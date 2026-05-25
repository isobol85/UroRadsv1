import { frameExtractionStrategy } from "./frames";

export interface VideoAnalysisResult {
  explanation: string;
  thumbnail: string;
  strategy: "frames";
}

export interface VideoAnalysisStrategy {
  name: string;
  analyze(
    videoBuffer: Buffer,
    filename: string,
    attendingPrompt?: string,
  ): Promise<VideoAnalysisResult>;
}

export async function analyzeVideo(
  videoBuffer: Buffer,
  filename: string,
  attendingPrompt?: string,
): Promise<VideoAnalysisResult> {
  const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`[VIDEO ANALYSIS] Frame extraction, video size: ${sizeMB}MB`);
  return frameExtractionStrategy.analyze(videoBuffer, filename, attendingPrompt);
}

export {
  extractSingleFrame,
  extractFramesFromVideo,
  streamFrameAnalysis,
  prepareFrameAnalysis,
  type FrameAnalysisContext,
} from "./frames";
