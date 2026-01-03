import { nativeVideoStrategy } from "./native";
import { frameExtractionStrategy } from "./frames";

export type VideoAnalysisMode = "native" | "legacy" | "native_with_fallback";

export interface VideoAnalysisResult {
  explanation: string;
  thumbnail: string;
  strategy: "native" | "frames";
}

export interface VideoAnalysisStrategy {
  name: string;
  canHandle(videoBuffer: Buffer): boolean;
  analyze(
    videoBuffer: Buffer,
    filename: string,
    attendingPrompt?: string
  ): Promise<VideoAnalysisResult>;
}

function getAnalysisMode(): VideoAnalysisMode {
  const mode = process.env.VIDEO_ANALYSIS_MODE?.toLowerCase();
  if (mode === "native" || mode === "legacy" || mode === "native_with_fallback") {
    return mode;
  }
  return "native_with_fallback";
}

export async function analyzeVideo(
  videoBuffer: Buffer,
  filename: string,
  attendingPrompt?: string
): Promise<VideoAnalysisResult> {
  const mode = getAnalysisMode();
  const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);

  console.log(`[VIDEO ANALYSIS] Mode: ${mode}, Video size: ${sizeMB}MB`);

  if (mode === "legacy") {
    console.log(`[VIDEO ANALYSIS] Using frame extraction strategy (legacy mode)`);
    return frameExtractionStrategy.analyze(videoBuffer, filename, attendingPrompt);
  }

  if (mode === "native") {
    console.log(`[VIDEO ANALYSIS] Using native video strategy (native mode - no fallback)`);
    if (!nativeVideoStrategy.canHandle(videoBuffer)) {
      throw new Error(`Video too large for native analysis. Set VIDEO_ANALYSIS_MODE=native_with_fallback to enable fallback.`);
    }
    return nativeVideoStrategy.analyze(videoBuffer, filename, attendingPrompt);
  }

  console.log(`[VIDEO ANALYSIS] Using native_with_fallback mode`);

  if (nativeVideoStrategy.canHandle(videoBuffer)) {
    try {
      console.log(`[VIDEO ANALYSIS] Attempting native video strategy...`);
      return await nativeVideoStrategy.analyze(videoBuffer, filename, attendingPrompt);
    } catch (error) {
      console.error(`[VIDEO ANALYSIS] Native video failed, falling back to frame extraction:`, error);
    }
  } else {
    console.log(`[VIDEO ANALYSIS] Video too large for native (${sizeMB}MB > 20MB), using frame extraction`);
  }

  console.log(`[VIDEO ANALYSIS] Using frame extraction fallback`);
  return frameExtractionStrategy.analyze(videoBuffer, filename, attendingPrompt);
}

export { extractSingleFrame, extractFramesFromVideo } from "./frames";
