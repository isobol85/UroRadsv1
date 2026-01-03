import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { VideoAnalysisResult, VideoAnalysisStrategy } from "./index";

const execAsync = promisify(exec);

const geminiApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT_VIDEO_ANALYSIS = `You are a radiology teaching assistant for urology trainees.
You are viewing a sequence of CT scan frames extracted from a video showing an axial scroll through the scan.
The frames are presented in order from superior to inferior (or as recorded in the video).

Analyze these sequential CT images and provide a comprehensive teaching explanation:

1. OVERVIEW: Describe the scan orientation and what body region is being shown
2. FRAME-BY-FRAME ANALYSIS: Walk through the key anatomical changes as we scroll through the slices
3. KEY FINDINGS: Identify any pathology or abnormalities you observe, noting which frames they appear in
4. TEACHING POINTS: Explain the recognition features that help learners identify these findings
5. DIFFERENTIAL CONSIDERATIONS: If pathology is present, briefly discuss what else might look similar

Write for PGY-2 residents and new APPs learning uro-radiology.
Be thorough but organized - this is a teaching case.`;

export interface ExtractedFrame {
  index: number;
  base64: string;
  mimeType: string;
}

export async function extractSingleFrame(
  videoBuffer: Buffer,
  position: number = 0.3
): Promise<ExtractedFrame> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ct-thumb-"));
  const videoPath = path.join(tempDir, "input.mp4");
  const framePath = path.join(tempDir, "thumbnail.jpeg");

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);

    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    const duration = parseFloat(durationOutput.trim());
    const seekTime = duration * position;

    await execAsync(
      `ffmpeg -i "${videoPath}" -ss ${seekTime} -vframes 1 -q:v 2 "${framePath}" -hide_banner -loglevel error`
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
  } = {}
): Promise<ExtractedFrame[]> {
  const { frameCount = 10, outputFormat = "jpeg" } = options;

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ct-frames-"));
  const videoPath = path.join(tempDir, "input.mp4");
  const framePattern = path.join(tempDir, `frame-%03d.${outputFormat}`);

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);

    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    const duration = parseFloat(durationOutput.trim());

    if (isNaN(duration) || duration <= 0) {
      throw new Error("Could not determine video duration");
    }

    const fps = frameCount / duration;

    await execAsync(
      `ffmpeg -i "${videoPath}" -vf "fps=${fps}" -q:v 2 "${framePattern}" -hide_banner -loglevel error`
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

async function callGeminiMultiImage(
  textPrompt: string,
  images: Array<{ base64: string; mimeType: string }>
): Promise<string> {
  if (!geminiApiKey || !geminiBaseUrl) {
    throw new Error("Gemini AI integration not configured");
  }

  const url = `${geminiBaseUrl}/models/${GEMINI_MODEL}:generateContent`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64,
      },
    });
  }

  parts.push({ text: textPrompt });

  console.log(`[FRAME EXTRACTION] Sending ${images.length} frames to Gemini`);

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

export const frameExtractionStrategy: VideoAnalysisStrategy = {
  name: "frames",

  canHandle(_videoBuffer: Buffer): boolean {
    return true;
  },

  async analyze(
    videoBuffer: Buffer,
    filename: string,
    attendingPrompt?: string
  ): Promise<VideoAnalysisResult> {
    const frameCount = 10;
    console.log(`[FRAME EXTRACTION] Processing video: ${filename}`);
    console.log(`[FRAME EXTRACTION] Extracting ${frameCount} frames...`);

    const frames = await extractFramesFromVideo(videoBuffer, { frameCount });
    console.log(`[FRAME EXTRACTION] Extracted ${frames.length} frames`);

    const prompt = attendingPrompt
      ? `${SYSTEM_PROMPT_VIDEO_ANALYSIS}\n\nAdditional guidance from the attending: ${attendingPrompt}`
      : SYSTEM_PROMPT_VIDEO_ANALYSIS;

    const textPrompt = `${prompt}\n\nThe following ${frames.length} frames are extracted from a CT scan video, shown in sequence:`;

    const images = frames.map(frame => ({
      base64: frame.base64,
      mimeType: frame.mimeType,
    }));

    const explanation = await callGeminiMultiImage(textPrompt, images);

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
