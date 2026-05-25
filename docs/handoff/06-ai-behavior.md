# 06 — AI Behavior

## Model tiers

All model IDs are centralised in `server/openai.ts`:

```ts
export const MODELS = {
  VISION: "gpt-5",       // image case analysis, video frame analysis, refine, chat
  CHAT:   "gpt-5",       // follow-up chat on a case
  SMALL:  "gpt-5-nano",  // titles, categories, chat-title generation
} as const;
```

The repo currently calls into a Replit-hosted OpenAI-compatible gateway. **Switch to OpenAI directly** on the rebuild — same model IDs, same JSON shape. Only the base URL and the env var name change.

| Use case | Model | Where |
| -------- | ----- | ----- |
| Generate explanation from a single CT image | `gpt-5` | `generateExplanation()` in `server/ai.ts` |
| Generate explanation from a CT-scroll video | `gpt-5` | `frameExtractionStrategy.analyze()` in `server/video-analysis/frames.ts` (also `streamFrameAnalysis` for SSE) |
| Refine an existing explanation given user feedback | `gpt-5` | `refineExplanation()` |
| Follow-up chat on a case | `gpt-5` | `generateChatResponse()` |
| Generate the 3-word session title | `gpt-5-nano` | `generateChatTitle()` |
| Generate a case title from an explanation | `gpt-5-nano` | `generateTitle()` |
| Classify a case into a category | `gpt-5-nano` | `generateCategory()` |

## The single AI gateway

`server/openai.ts` exports four functions — port these one-for-one:

| Function | What it does |
| -------- | ------------ |
| `openaiText(systemPrompt, userPrompt, model = SMALL)` | Plain text chat completion |
| `openaiWithImages(systemPrompt, userText, images[], model = VISION)` | Multi-image vision request. Each image becomes a `image_url` part with `detail: "high"` and a `data:` URL |
| `openaiChat(systemPrompt, history[], userMessage, model = CHAT)` | Roundtrip with prior history; history `role` of `"user"` stays, anything else maps to `"assistant"` |
| `openaiStreamWithImages(...)` | Async generator that yields token deltas; used by the SSE video stream endpoint |

All four call `${baseUrl}/chat/completions` with `Authorization: Bearer $OPENAI_API_KEY`. The stream variant requests `stream: true` and parses `data: {...}` SSE lines.

## Prompts (verbatim where possible)

The prompts are product, not infrastructure. Copy them as-is from `server/ai.ts` (and `SYSTEM_PROMPT_VIDEO_ANALYSIS` referenced by the video pipeline). Key ones to expect:

- **Image explanation prompt** — instructs the model to act as a uro-radiology attending, write a structured teaching explanation suitable for a resident, integrate any `attendingPrompt` if present.
- **Video explanation prompt** (`SYSTEM_PROMPT_VIDEO_ANALYSIS`) — additionally tells the model that the frames are in scroll order, and that some images may include scene-change-weighted slices and/or a body crop applied by ffmpeg.
- **Refine prompt** — given current explanation + feedback, regenerate.
- **Title prompt** — produces a short, specific case title (e.g. "Right hydronephrosis with delayed nephrogram").
- **Category prompt** — single bucket like "Hydronephrosis", "Renal mass", "Trauma", etc. (Free text — the UI doesn't validate against an enum.)
- **Chat prompt** — bind the model to the case via the explanation in the system message; treat the user message as a learner question.
- **Chat title prompt** — exactly three words, no punctuation.

Do not paraphrase these in the rebuild — copy them character-for-character to keep behaviour stable. Place them in `lib/prompts.ts` if you prefer to centralise.

## Smart-frame video pipeline

Live in `server/video-analysis/frames.ts`. This is the **current production path** for any video upload, both `/api/ai/analyze-video` and `/api/ai/analyze-video-stream`. The older `extractFramesFromVideo()` (uniform fps sampling) is legacy and not invoked from any route handler — drop it on the rebuild.

```mermaid
flowchart TD
  A[Upload: multipart `video` field] --> B[Buffer → temp file via fs.mkdtemp]
  B --> C[probeDuration: ffprobe -show_entries format=duration]
  C --> D[Parallel:]
  D --> E[detectSceneChanges: ffmpeg select='gt(scene,0.12)',showinfo → pts_time list]
  D --> F[detectCrop: ffmpeg cropdetect=24:16:0 sampled mid-segment → most common crop=w:h:x:y]
  E --> G[planTimestamps:<br>baseCount = clamp(minFrames=8, maxFrames=24, round(duration*1.2))<br>merge even + scene timestamps, dedup minGap, downsample to maxFrames]
  F --> G
  G --> H[Per-timestamp ffmpeg -ss t -frames:v 1 -vf '{crop?,}scale=min(1024,iw):-2' -q:v 2]
  H --> I[Frames → base64 JPEGs]
  I --> J[openaiWithImages / openaiStreamWithImages, model=VISION]
  J --> K[Explanation text]
  K --> L[generateTitle (SMALL) ‖ generateCategory (SMALL)]
  L --> M[compressVideo iterative CRF 18→20→23→26, scale to 1280w on final attempt]
  M --> N[uploadVideoToStorage → object storage URL]
  N --> O[Return { explanation, title, category, videoInfo, thumbnail, videoUrl, mediaType: 'video' }]
```

Key tunables in `extractSmartFrames` (defaults shown):

```ts
maxFrames = 24
minFrames = 8
framesPerSecond = 1.2    // base sampling density
sceneThreshold = 0.12    // ffmpeg scene detector threshold
enableCrop = true        // ffmpeg cropdetect to trim letterboxing
outputFormat = "jpeg"
```

Thumbnail policy: `pickThumbnail()` returns the **middle** extracted frame as a `data:` URL. The UI uses this until the real `videoUrl` is available (or as the persistent thumbnail for video cases).

### Streaming variant

`prepareFrameAnalysis()` returns a `FrameAnalysisContext` (frames, prompts, thumbnail, meta) without calling the LLM. `streamFrameAnalysis()` then yields token deltas via `openaiStreamWithImages`. The route handler interleaves these with `status` SSE events (see doc 4) and only triggers `compressVideo`/`uploadVideoToStorage` **after** the explanation has fully streamed. This matters: if the model errors out, you don't waste a compress + upload cycle.

## ffmpeg / ffprobe requirements

The smart-frame pipeline shells out to `ffmpeg` and `ffprobe`. The build/runtime image must have both on PATH. (`apt-get install ffmpeg` works on Debian/Ubuntu; on Vercel you need either an external worker, a custom container, or the `@vercel/og` runtime exception is not enough.) See doc 8.

## Compression policy

`compressVideo()` in `server/video.ts`:

- Tries CRF 18, 20, 23, 26 in order.
- On the last attempt, additionally caps width to 1280px.
- Hard-fails if compressed > 50 MB after all attempts, with a user-facing message asking for a shorter clip (10–15 s recommended).

Port this verbatim. The 50 MB cap is also implicit upstream — uploads larger than that will be rejected after a noticeable delay. Worth surfacing a client-side check on the rebuild.

## Token-budget guidance

- Vision calls send up to 24 high-detail JPEGs. With 1024px-wide images that's a meaningful prompt cost. If you swap to a cheaper vision tier, reduce `maxFrames` to keep latency reasonable.
- Chat history is sent on every request. The UI does not truncate. For long sessions, add a simple rolling-window or summary on the rebuild.
