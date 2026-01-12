import { VideoAnalysisResult, VideoAnalysisStrategy } from "./index";
import { extractSingleFrame } from "./frames";

const geminiApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT_VIDEO_ANALYSIS = `You are a radiology teaching assistant for urology trainees.
You are viewing a CT scan video showing an axial scroll through the scan.

Analyze this CT scan video and provide a comprehensive teaching explanation:

1. OVERVIEW: Describe the scan orientation and what body region is being shown
2. SCROLL ANALYSIS: Walk through the key anatomical changes as we scroll through the slices
3. KEY FINDINGS: Identify any pathology or abnormalities you observe, noting when they appear in the video
4. TEACHING POINTS: Explain the recognition features that help learners identify these findings
5. DIFFERENTIAL CONSIDERATIONS: If pathology is present, briefly discuss what else might look similar

Write for PGY-2 residents and new APPs learning uro-radiology.
Be thorough but organized - this is a teaching case.`;

const MAX_INLINE_SIZE_MB = 20;

function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'avi': return 'video/x-msvideo';
    default: return 'video/mp4';
  }
}

async function callGeminiVideo(
  textPrompt: string,
  videoBase64: string,
  mimeType: string
): Promise<string> {
  if (!geminiApiKey || !geminiBaseUrl) {
    throw new Error("Gemini AI integration not configured");
  }

  const url = `${geminiBaseUrl}/models/${GEMINI_MODEL}:generateContent`;

  const parts = [
    {
      inline_data: {
        mime_type: mimeType,
        data: videoBase64,
      },
    },
    { text: textPrompt },
  ];

  console.log(`[NATIVE VIDEO] Sending video to Gemini (${(videoBase64.length * 0.75 / 1024 / 1024).toFixed(2)}MB)`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${geminiApiKey}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function* streamGeminiVideo(
  textPrompt: string,
  videoBase64: string,
  mimeType: string
): AsyncGenerator<string, void, unknown> {
  if (!geminiApiKey || !geminiBaseUrl) {
    throw new Error("Gemini AI integration not configured");
  }

  const url = `${geminiBaseUrl}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

  const parts = [
    {
      inline_data: {
        mime_type: mimeType,
        data: videoBase64,
      },
    },
    { text: textPrompt },
  ];

  console.log(`[NATIVE VIDEO STREAM] Sending video to Gemini for streaming (${(videoBase64.length * 0.75 / 1024 / 1024).toFixed(2)}MB)`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${geminiApiKey}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body for streaming");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr && jsonStr !== "[DONE]") {
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield text;
            }
          } catch (e) {
            // Skip malformed JSON chunks
          }
        }
      }
    }
  }

  // Process any remaining buffer
  if (buffer.startsWith("data: ")) {
    const jsonStr = buffer.slice(6).trim();
    if (jsonStr && jsonStr !== "[DONE]") {
      try {
        const data = JSON.parse(jsonStr);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          yield text;
        }
      } catch (e) {
        // Skip malformed JSON
      }
    }
  }
}

export const nativeVideoStrategy: VideoAnalysisStrategy = {
  name: "native",

  canHandle(videoBuffer: Buffer): boolean {
    const sizeMB = videoBuffer.length / (1024 * 1024);
    return sizeMB <= MAX_INLINE_SIZE_MB;
  },

  async analyze(
    videoBuffer: Buffer,
    filename: string,
    attendingPrompt?: string
  ): Promise<VideoAnalysisResult> {
    const sizeMB = videoBuffer.length / (1024 * 1024);
    console.log(`[NATIVE VIDEO] Processing video: ${filename} (${sizeMB.toFixed(2)}MB)`);

    if (sizeMB > MAX_INLINE_SIZE_MB) {
      throw new Error(`Video too large for native analysis (${sizeMB.toFixed(2)}MB > ${MAX_INLINE_SIZE_MB}MB)`);
    }

    const videoBase64 = videoBuffer.toString("base64");
    const mimeType = getMimeType(filename);

    const prompt = attendingPrompt
      ? `${SYSTEM_PROMPT_VIDEO_ANALYSIS}\n\nAdditional guidance from the attending: ${attendingPrompt}`
      : SYSTEM_PROMPT_VIDEO_ANALYSIS;

    const explanation = await callGeminiVideo(prompt, videoBase64, mimeType);

    const thumbnailFrame = await extractSingleFrame(videoBuffer, 0.3);
    const thumbnail = `data:${thumbnailFrame.mimeType};base64,${thumbnailFrame.base64}`;

    console.log(`[NATIVE VIDEO] Analysis complete`);

    return {
      explanation,
      thumbnail,
      strategy: "native",
    };
  },
};

export interface StreamingVideoAnalysisContext {
  videoBase64: string;
  mimeType: string;
  prompt: string;
}

export function prepareStreamingAnalysis(
  videoBuffer: Buffer,
  filename: string,
  attendingPrompt?: string
): StreamingVideoAnalysisContext {
  const sizeMB = videoBuffer.length / (1024 * 1024);
  console.log(`[NATIVE VIDEO STREAM] Preparing video: ${filename} (${sizeMB.toFixed(2)}MB)`);

  if (sizeMB > MAX_INLINE_SIZE_MB) {
    throw new Error(`Video too large for native analysis (${sizeMB.toFixed(2)}MB > ${MAX_INLINE_SIZE_MB}MB)`);
  }

  const videoBase64 = videoBuffer.toString("base64");
  const mimeType = getMimeType(filename);

  const prompt = attendingPrompt
    ? `${SYSTEM_PROMPT_VIDEO_ANALYSIS}\n\nAdditional guidance from the attending: ${attendingPrompt}`
    : SYSTEM_PROMPT_VIDEO_ANALYSIS;

  return { videoBase64, mimeType, prompt };
}

export { extractSingleFrame } from "./frames";
