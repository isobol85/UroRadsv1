import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

export interface ExtractedFrame {
  index: number;
  base64: string;
  mimeType: string;
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

export async function compressVideo(
  videoBuffer: Buffer,
  options: {
    maxSizeMB?: number;
  } = {}
): Promise<Buffer> {
  const { maxSizeMB = 20 } = options;
  
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ct-compress-"));
  const inputPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "output.mp4");
  
  try {
    await fs.promises.writeFile(inputPath, videoBuffer);
    
    // Compress with H.264, CRF 18 for medical quality, movflags for progressive playback
    await execAsync(
      `ffmpeg -i "${inputPath}" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart -y "${outputPath}" -hide_banner -loglevel error`
    );
    
    const compressedBuffer = await fs.promises.readFile(outputPath);
    const compressedSizeMB = compressedBuffer.length / (1024 * 1024);
    
    console.log(`Video compressed: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB`);
    
    if (compressedSizeMB > maxSizeMB) {
      throw new Error(`Compressed video (${compressedSizeMB.toFixed(2)}MB) exceeds max size of ${maxSizeMB}MB`);
    }
    
    return compressedBuffer;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function getVideoInfo(videoBuffer: Buffer): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
}> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ct-info-"));
  const videoPath = path.join(tempDir, "input.mp4");
  
  try {
    await fs.promises.writeFile(videoPath, videoBuffer);
    
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -of json "${videoPath}"`
    );
    
    const info = JSON.parse(stdout);
    const stream = info.streams?.[0];
    
    if (!stream) {
      throw new Error("No video stream found");
    }
    
    const [fpsNum, fpsDen] = (stream.r_frame_rate || "30/1").split("/").map(Number);
    
    return {
      duration: parseFloat(stream.duration) || 0,
      width: stream.width || 0,
      height: stream.height || 0,
      fps: fpsNum / fpsDen,
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}
