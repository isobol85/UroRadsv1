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

function buildFramePrompts(frames: ExtractedFrame[], attendingPrompt?: string) {
  const systemPrompt = attendingPrompt
    ? `${SYSTEM_PROMPT_VIDEO_ANALYSIS}\n\nAdditional guidance from the attending: ${attendingPrompt}`
    : SYSTEM_PROMPT_VIDEO_ANALYSIS;

  const userText = `The following ${frames.length} frames are extracted from a CT scan video, shown in sequence:`;

  const images = frames.map(frame => ({
    base64: frame.base64,
    mimeType: frame.mimeType,
  }));

  return { systemPrompt, userText, images };
}

export const frameExtractionStrategy: VideoAnalysisStrategy = {
  name: "frames",

  async analyze(
    videoBuffer: Buffer,
    filename: string,
    attendingPrompt?: string,
  ): Promise<VideoAnalysisResult> {
    const frameCount = 10;
    console.log(`[FRAME EXTRACTION] Processing video: ${filename}`);
    console.log(`[FRAME EXTRACTION] Extracting ${frameCount} frames...`);

    const frames = await extractFramesFromVideo(videoBuffer, { frameCount });
    console.log(`[FRAME EXTRACTION] Extracted ${frames.length} frames`);

    const { systemPrompt, userText, images } = buildFramePrompts(frames, attendingPrompt);

    console.log(`[FRAME EXTRACTION] Sending ${images.length} frames to OpenAI`);
    const explanation = await openaiWithImages(systemPrompt, userText, images, MODELS.VISION);

    const thumbnailIndex = Math.min(4, Math.floor(frames.length / 2));
    const thumbnailFrame = frames[thumbnailIndex];
    const thumbnail = `data:${thumbnailFrame.mimeType};base64,${thumbnailFrame.base64}`;

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
}

export async function prepareFrameAnalysis(
  videoBuffer: Buffer,
  filename: string,
  attendingPrompt?: string,
): Promise<FrameAnalysisContext> {
  const frameCount = 10;
  console.log(`[FRAME STREAM] Preparing video: ${filename}`);

  const frames = await extractFramesFromVideo(videoBuffer, { frameCount });
  console.log(`[FRAME STREAM] Extracted ${frames.length} frames`);

  const { systemPrompt, userText, images } = buildFramePrompts(frames, attendingPrompt);

  const thumbnailIndex = Math.min(4, Math.floor(frames.length / 2));
  const thumbnailFrame = frames[thumbnailIndex];
  const thumbnail = `data:${thumbnailFrame.mimeType};base64,${thumbnailFrame.base64}`;

  return { frames, systemPrompt, userText, images, thumbnail };
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
