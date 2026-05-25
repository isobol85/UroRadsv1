import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { VideoAnalysisResult, VideoAnalysisStrategy } from "./index";
import { MODELS, openaiWithImages, openaiStreamWithImages } from "../openai";
import { SYSTEM_PROMPT_VIDEO_ANALYSIS } from "../ai";

const execAsync = promisify(exec);

export interface ExtractedFrame {
  index: number;
  base64: string;
  mimeType: string;
}

export interface SmartExtractionOptions {
  maxFrames?: number;
  minFrames?: number;
  framesPerSecond?: number;
  sceneThreshold?: number;
  enableCrop?: boolean;
  outputFormat?: "jpeg" | "png";
}

export interface SmartExtractionMeta {
  duration: number;
  baseCount: number;
  sceneTimestamps: number[];
  crop: string | null;
  sampledTimestamps: number[];
}

async function probeDuration(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
  );
  const d = parseFloat(stdout.trim());
  if (isNaN(d) || d <= 0) {
    throw new Error("Could not determine video duration");
  }
  return d;
}

async function detectSceneChanges(
  videoPath: string,
  threshold: number,
): Promise<number[]> {
  try {
    const { stderr } = await execAsync(
      `ffmpeg -i "${videoPath}" -vf "select='gt(scene,${threshold})',showinfo" -an -f null - -hide_banner -loglevel info`,
      { maxBuffer: 32 * 1024 * 1024 },
    );
    const out: number[] = [];
    const re = /pts_time:([0-9.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stderr)) !== null) {
      const v = parseFloat(m[1]);
      if (!isNaN(v)) out.push(v);
    }
    return out;
  } catch (err) {
    console.warn(`[FRAME EXTRACTION] scene detection failed: ${(err as Error).message}`);
    return [];
  }
}

async function detectCrop(
  videoPath: string,
  duration: number,
): Promise<string | null> {
  try {
    const sampleStart = duration > 2 ? duration * 0.15 : 0;
    const sampleDuration = Math.min(Math.max(duration * 0.5, 1), 4);
    const { stderr } = await execAsync(
      `ffmpeg -ss ${sampleStart.toFixed(3)} -i "${videoPath}" -t ${sampleDuration.toFixed(3)} -vf "cropdetect=24:16:0" -an -f null - -hide_banner -loglevel info`,
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const matches: string[] = [];
    const cropRe = /crop=(\d+:\d+:\d+:\d+)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cropRe.exec(stderr)) !== null) matches.push(cm[1]);
    if (matches.length === 0) return null;

    const counts: Record<string, number> = {};
    for (const m of matches) counts[m] = (counts[m] || 0) + 1;
    let best: string | null = null;
    let bestCount = 0;
    for (const k of Object.keys(counts)) {
      if (counts[k] > bestCount) {
        bestCount = counts[k];
        best = k;
      }
    }

    if (!best) return null;
    const [w, h] = best.split(":").map(Number);
    if (!w || !h || w < 64 || h < 64) return null;
    return best;
  } catch (err) {
    console.warn(`[FRAME EXTRACTION] crop detection failed: ${(err as Error).message}`);
    return null;
  }
}

function planTimestamps(
  duration: number,
  baseCount: number,
  sceneTs: number[],
  maxFrames: number,
): number[] {
  const evenTs: number[] = [];
  for (let i = 0; i < baseCount; i++) {
    evenTs.push(duration * ((i + 0.5) / baseCount));
  }

  const all = [...evenTs, ...sceneTs.filter(t => t >= 0 && t <= duration)].sort(
    (a, b) => a - b,
  );

  const minGap = Math.max(0.15, duration / (maxFrames * 4));
  const deduped: number[] = [];
  for (const t of all) {
    if (deduped.length === 0 || t - deduped[deduped.length - 1] >= minGap) {
      deduped.push(t);
    }
  }

  if (deduped.length <= maxFrames) return deduped;

  const out: number[] = [];
  for (let i = 0; i < maxFrames; i++) {
    const idx = Math.min(
      deduped.length - 1,
      Math.floor(((i + 0.5) * deduped.length) / maxFrames),
    );
    out.push(deduped[idx]);
  }
  return out;
}

export async function extractSmartFrames(
  videoBuffer: Buffer,
  options: SmartExtractionOptions = {},
): Promise<{ frames: ExtractedFrame[]; meta: SmartExtractionMeta }> {
  const {
    maxFrames = 24,
    minFrames = 8,
    framesPerSecond = 1.2,
    sceneThreshold = 0.12,
    enableCrop = true,
    outputFormat = "jpeg",
  } = options;

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ct-frames-"));
  const videoPath = path.join(tempDir, "input.mp4");

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);
    const duration = await probeDuration(videoPath);

    const baseCount = Math.min(
      maxFrames,
      Math.max(minFrames, Math.round(duration * framesPerSecond)),
    );

    const [sceneTs, crop] = await Promise.all([
      detectSceneChanges(videoPath, sceneThreshold),
      enableCrop ? detectCrop(videoPath, duration) : Promise.resolve(null),
    ]);

    const sampledTs = planTimestamps(duration, baseCount, sceneTs, maxFrames);

    const cropFilter = crop ? `crop=${crop},` : "";
    const vf = `${cropFilter}scale='min(1024,iw)':-2`;

    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < sampledTs.length; i++) {
      const t = sampledTs[i];
      const framePath = path.join(
        tempDir,
        `frame-${String(i).padStart(3, "0")}.${outputFormat}`,
      );
      await execAsync(
        `ffmpeg -ss ${t.toFixed(3)} -i "${videoPath}" -frames:v 1 -vf "${vf}" -q:v 2 "${framePath}" -hide_banner -loglevel error`,
      );
      const buf = await fs.promises.readFile(framePath);
      frames.push({
        index: i + 1,
        base64: buf.toString("base64"),
        mimeType: outputFormat === "jpeg" ? "image/jpeg" : "image/png",
      });
    }

    return {
      frames,
      meta: {
        duration,
        baseCount,
        sceneTimestamps: sceneTs,
        crop,
        sampledTimestamps: sampledTs,
      },
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function extractSingleFrame(
  videoBuffer: Buffer,
  position: number = 0.3,
): Promise<ExtractedFrame> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ct-thumb-"));
  const videoPath = path.join(tempDir, "input.mp4");
  const framePath = path.join(tempDir, "thumbnail.jpeg");

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);

    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    );
    const duration = parseFloat(durationOutput.trim());
    const seekTime = duration * position;

    await execAsync(
      `ffmpeg -i "${videoPath}" -ss ${seekTime} -vframes 1 -q:v 2 "${framePath}" -hide_banner -loglevel error`,
    );

    const frameBuffer = await fs.promises.readFile(framePath);
    return {
      index: 0,
      base64: frameBuffer.toString("base64"),
      mimeType: "image/jpeg",
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function extractFramesFromVideo(
  videoBuffer: Buffer,
  options: {
    frameCount?: number;
    outputFormat?: "jpeg" | "png";
  } = {},
): Promise<ExtractedFrame[]> {
  const { frameCount = 10, outputFormat = "jpeg" } = options;

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ct-frames-"));
  const videoPath = path.join(tempDir, "input.mp4");
  const framePattern = path.join(tempDir, `frame-%03d.${outputFormat}`);

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);

    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    );
    const duration = parseFloat(durationOutput.trim());

    if (isNaN(duration) || duration <= 0) {
      throw new Error("Could not determine video duration");
    }

    const fps = frameCount / duration;

    await execAsync(
      `ffmpeg -i "${videoPath}" -vf "fps=${fps}" -q:v 2 "${framePattern}" -hide_banner -loglevel error`,
    );

    const frameFiles = await fs.promises.readdir(tempDir);
    const frameFilesSorted = frameFiles
      .filter(f => f.startsWith("frame-") && f.endsWith(`.${outputFormat}`))
      .sort();

    const frames: ExtractedFrame[] = [];

    for (let i = 0; i < frameFilesSorted.length; i++) {
      const framePath = path.join(tempDir, frameFilesSorted[i]);
      const frameBuffer = await fs.promises.readFile(framePath);
      const base64 = frameBuffer.toString("base64");

      frames.push({
        index: i + 1,
        base64,
        mimeType: outputFormat === "jpeg" ? "image/jpeg" : "image/png",
      });
    }

    return frames;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function buildFramePrompts(
  frames: ExtractedFrame[],
  meta: SmartExtractionMeta,
  attendingPrompt?: string,
) {
  const systemPrompt = attendingPrompt
    ? `${SYSTEM_PROMPT_VIDEO_ANALYSIS}\n\nAdditional guidance from the attending: ${attendingPrompt}`
    : SYSTEM_PROMPT_VIDEO_ANALYSIS;

  const samplingNote =
    meta.sceneTimestamps.length > 0
      ? ` Sampling was weighted toward slices with the most anatomic change (${meta.sceneTimestamps.length} scene-change points detected across a ${meta.duration.toFixed(1)}s scroll).`
      : ` Frames are sampled evenly across a ${meta.duration.toFixed(1)}s scroll.`;
  const cropNote = meta.crop
    ? " Frames have been cropped to the body to maximize useful detail."
    : "";

  const userText = `The following ${frames.length} frames are extracted from a CT scan video, shown in scroll order.${samplingNote}${cropNote}`;

  const images = frames.map(frame => ({
    base64: frame.base64,
    mimeType: frame.mimeType,
  }));

  return { systemPrompt, userText, images };
}

function pickThumbnail(frames: ExtractedFrame[]): string {
  const idx = Math.min(frames.length - 1, Math.max(0, Math.floor(frames.length / 2)));
  const f = frames[idx];
  return `data:${f.mimeType};base64,${f.base64}`;
}

export const frameExtractionStrategy: VideoAnalysisStrategy = {
  name: "frames",

  async analyze(
    videoBuffer: Buffer,
    filename: string,
    attendingPrompt?: string,
  ): Promise<VideoAnalysisResult> {
    console.log(`[FRAME EXTRACTION] Processing video: ${filename}`);

    const { frames, meta } = await extractSmartFrames(videoBuffer);
    console.log(
      `[FRAME EXTRACTION] duration=${meta.duration.toFixed(2)}s base=${meta.baseCount} scene=${meta.sceneTimestamps.length} crop=${meta.crop ?? "none"} → ${frames.length} frames`,
    );

    const { systemPrompt, userText, images } = buildFramePrompts(
      frames,
      meta,
      attendingPrompt,
    );

    console.log(`[FRAME EXTRACTION] Sending ${images.length} frames to OpenAI`);
    const explanation = await openaiWithImages(
      systemPrompt,
      userText,
      images,
      MODELS.VISION,
    );

    const thumbnail = pickThumbnail(frames);
    console.log(`[FRAME EXTRACTION] Analysis complete`);

    return {
      explanation,
      thumbnail,
      strategy: "frames",
    };
  },
};

export interface FrameAnalysisContext {
  frames: ExtractedFrame[];
  systemPrompt: string;
  userText: string;
  images: Array<{ base64: string; mimeType: string }>;
  thumbnail: string;
  meta: SmartExtractionMeta;
}

export async function prepareFrameAnalysis(
  videoBuffer: Buffer,
  filename: string,
  attendingPrompt?: string,
): Promise<FrameAnalysisContext> {
  console.log(`[FRAME STREAM] Preparing video: ${filename}`);

  const { frames, meta } = await extractSmartFrames(videoBuffer);
  console.log(
    `[FRAME STREAM] duration=${meta.duration.toFixed(2)}s base=${meta.baseCount} scene=${meta.sceneTimestamps.length} crop=${meta.crop ?? "none"} → ${frames.length} frames`,
  );

  const { systemPrompt, userText, images } = buildFramePrompts(
    frames,
    meta,
    attendingPrompt,
  );

  const thumbnail = pickThumbnail(frames);

  return { frames, systemPrompt, userText, images, thumbnail, meta };
}

export async function* streamFrameAnalysis(
  context: FrameAnalysisContext,
): AsyncGenerator<string, void, unknown> {
  console.log(`[FRAME STREAM] Streaming ${context.images.length} frames from OpenAI`);
  yield* openaiStreamWithImages(
    context.systemPrompt,
    context.userText,
    context.images,
    MODELS.VISION,
  );
}
