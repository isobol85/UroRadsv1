import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema, insertChatMessageSchema } from "@shared/schema";
import { generateExplanation, generateTitle, generateCategory, generateChatResponse, refineExplanation, testMultiImageCapability } from "./ai";
import { getVideoInfo, compressVideo } from "./video";
import { analyzeVideo, streamGeminiVideo, prepareStreamingAnalysis, extractSingleFrame } from "./video-analysis";
import { z } from "zod";
import multer from "multer";
import { objectStorageClient } from "./replit_integrations/object_storage";
import { randomUUID } from "crypto";
import seedData from "./seed-data.json";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Upload video to object storage and return the public URL
async function uploadVideoToStorage(videoBuffer: Buffer, filename: string): Promise<string> {
  const publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  if (!publicSearchPaths) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
  }
  
  // PUBLIC_OBJECT_SEARCH_PATHS is a plain path like "/bucket/public"
  const publicDir = publicSearchPaths.trim();
  if (!publicDir) {
    throw new Error("No public directories configured");
  }
  
  const objectId = `videos/${randomUUID()}-${filename}`;
  const fullPath = `${publicDir}/${objectId}`;
  
  // Parse bucket and object name from path
  const pathParts = fullPath.split("/").filter(p => p.length > 0);
  const bucketName = pathParts[0];
  const objectName = pathParts.slice(1).join("/");
  
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  
  await file.save(videoBuffer, {
    contentType: "video/mp4",
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });
  
  // Return the direct GCS URL (publicly accessible)
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

// Delete video from object storage
async function deleteVideoFromStorage(videoUrl: string): Promise<void> {
  if (!videoUrl || !videoUrl.includes("storage.googleapis.com")) {
    return;
  }
  
  try {
    const url = new URL(videoUrl);
    const pathParts = url.pathname.split("/").filter(p => p.length > 0);
    const bucketName = pathParts[0];
    const objectName = pathParts.slice(1).join("/");
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
      console.log(`Deleted video from storage: ${objectName}`);
    }
  } catch (error) {
    console.error("Error deleting video from storage:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/cases", async (req, res) => {
    try {
      const cases = await storage.getCases();
      res.json(cases);
    } catch (error) {
      console.error("Error fetching cases:", error);
      res.status(500).json({ error: "Failed to fetch cases" });
    }
  });

  app.get("/api/cases/:id", async (req, res) => {
    try {
      const case_ = await storage.getCase(req.params.id);
      if (!case_) {
        return res.status(404).json({ error: "Case not found" });
      }
      res.json(case_);
    } catch (error) {
      console.error("Error fetching case:", error);
      res.status(500).json({ error: "Failed to fetch case" });
    }
  });

  app.post("/api/cases", async (req, res) => {
    try {
      const validated = insertCaseSchema.parse(req.body);
      const case_ = await storage.createCase(validated);
      res.status(201).json(case_);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid case data", details: error.errors });
      }
      console.error("Error creating case:", error);
      res.status(500).json({ error: "Failed to create case" });
    }
  });

  const updateCaseSchema = z.object({
    title: z.string().optional(),
    explanation: z.string().optional(),
    category: z.string().optional(),
  });

  app.patch("/api/cases/:id", async (req, res) => {
    try {
      const validated = updateCaseSchema.parse(req.body);
      const updated = await storage.updateCase(req.params.id, validated);
      if (!updated) {
        return res.status(404).json({ error: "Case not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid case data", details: error.errors });
      }
      console.error("Error updating case:", error);
      res.status(500).json({ error: "Failed to update case" });
    }
  });

  app.delete("/api/cases/:id", async (req, res) => {
    try {
      // Get case first to check for video URL
      const caseToDelete = await storage.getCase(req.params.id);
      if (!caseToDelete) {
        return res.status(404).json({ error: "Case not found" });
      }
      
      // Delete video from object storage if it exists
      if (caseToDelete.videoUrl) {
        await deleteVideoFromStorage(caseToDelete.videoUrl);
      }
      
      const deleted = await storage.deleteCase(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Case not found" });
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting case:", error);
      res.status(500).json({ error: "Failed to delete case" });
    }
  });

  app.get("/api/cases/:caseId/messages", async (req, res) => {
    try {
      const messages = await storage.getChatMessages(req.params.caseId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/cases/:caseId/messages", async (req, res) => {
    try {
      const validated = insertChatMessageSchema.parse({
        ...req.body,
        caseId: req.params.caseId,
      });
      const message = await storage.createChatMessage(validated);
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid message data", details: error.errors });
      }
      console.error("Error creating message:", error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  const analyzeImageSchema = z.object({
    imageBase64: z.string(),
    attendingPrompt: z.string().optional(),
  });

  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const { imageBase64, attendingPrompt } = analyzeImageSchema.parse(req.body);
      
      const explanation = await generateExplanation(imageBase64, attendingPrompt);
      const [title, category] = await Promise.all([
        generateTitle(explanation),
        generateCategory(explanation),
      ]);
      
      res.json({ explanation, title, category });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error analyzing image:", error);
      res.status(500).json({ error: "Failed to analyze image" });
    }
  });

  const refineSchema = z.object({
    imageBase64: z.string(),
    currentExplanation: z.string(),
    feedback: z.string(),
  });

  app.post("/api/ai/refine", async (req, res) => {
    try {
      const { imageBase64, currentExplanation, feedback } = refineSchema.parse(req.body);
      
      const explanation = await refineExplanation(imageBase64, currentExplanation, feedback);
      const [title, category] = await Promise.all([
        generateTitle(explanation),
        generateCategory(explanation),
      ]);
      
      res.json({ explanation, title, category });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error refining explanation:", error);
      res.status(500).json({ error: "Failed to refine explanation" });
    }
  });

  const chatSchema = z.object({
    explanation: z.string(),
    chatHistory: z.array(z.object({
      role: z.string(),
      content: z.string(),
    })),
    userMessage: z.string(),
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { explanation, chatHistory, userMessage } = chatSchema.parse(req.body);
      
      const response = await generateChatResponse(explanation, chatHistory, userMessage);
      
      res.json({ response });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error generating chat response:", error);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  // Video analysis endpoints
  app.post("/api/ai/analyze-video", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded" });
      }

      const attendingPrompt = req.body.attendingPrompt;
      const filename = req.file.originalname || "video.mp4";

      console.log(`Processing video: ${filename}, size: ${req.file.size} bytes`);

      // Get video info
      const videoInfo = await getVideoInfo(req.file.buffer);
      console.log(`Video info: duration=${videoInfo.duration}s, ${videoInfo.width}x${videoInfo.height}, ${videoInfo.fps}fps`);

      // Analyze with the video analysis service (native or frame extraction based on VIDEO_ANALYSIS_MODE)
      const analysisResult = await analyzeVideo(req.file.buffer, filename, attendingPrompt);
      
      // Generate title and category from the explanation
      const [title, category] = await Promise.all([
        generateTitle(analysisResult.explanation),
        generateCategory(analysisResult.explanation),
      ]);

      // Only compress and upload after AI analysis succeeds
      console.log("Compressing video for storage...");
      const compressedVideo = await compressVideo(req.file.buffer);
      
      console.log("Uploading compressed video to object storage...");
      const videoUrl = await uploadVideoToStorage(compressedVideo, filename);
      console.log(`Video uploaded: ${videoUrl}`);

      res.json({
        explanation: analysisResult.explanation,
        title,
        category,
        videoInfo,
        analysisStrategy: analysisResult.strategy,
        thumbnail: analysisResult.thumbnail,
        videoUrl,
        mediaType: "video",
      });
    } catch (error) {
      console.error("Error analyzing video:", error);
      res.status(500).json({ 
        error: "Failed to analyze video",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Streaming video analysis endpoint using SSE
  app.post("/api/ai/analyze-video-stream", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded" });
      }

      const attendingPrompt = req.body.attendingPrompt;
      const filename = req.file.originalname || "video.mp4";
      const videoBuffer = req.file.buffer;

      console.log(`[STREAM] Processing video: ${filename}, size: ${req.file.size} bytes`);

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Send initial event to indicate processing has started
      res.write(`event: status\ndata: ${JSON.stringify({ status: "processing", message: "Preparing video for analysis..." })}\n\n`);

      // Get video info
      const videoInfo = await getVideoInfo(videoBuffer);
      console.log(`[STREAM] Video info: duration=${videoInfo.duration}s, ${videoInfo.width}x${videoInfo.height}, ${videoInfo.fps}fps`);

      res.write(`event: status\ndata: ${JSON.stringify({ status: "analyzing", message: "Sending to AI for analysis..." })}\n\n`);

      // Prepare for streaming analysis
      const context = prepareStreamingAnalysis(videoBuffer, filename, attendingPrompt);

      // Stream the analysis
      let fullExplanation = "";
      try {
        for await (const chunk of streamGeminiVideo(context.prompt, context.videoBase64, context.mimeType)) {
          fullExplanation += chunk;
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      } catch (streamError) {
        console.error("[STREAM] Streaming error:", streamError);
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Streaming failed", details: streamError instanceof Error ? streamError.message : "Unknown error" })}\n\n`);
        res.end();
        return;
      }

      // Generate title and category from the full explanation
      res.write(`event: status\ndata: ${JSON.stringify({ status: "finalizing", message: "Generating metadata..." })}\n\n`);

      const [title, category] = await Promise.all([
        generateTitle(fullExplanation),
        generateCategory(fullExplanation),
      ]);

      // Extract thumbnail
      const thumbnailFrame = await extractSingleFrame(videoBuffer, 0.3);
      const thumbnail = `data:${thumbnailFrame.mimeType};base64,${thumbnailFrame.base64}`;

      // Compress and upload video
      res.write(`event: status\ndata: ${JSON.stringify({ status: "uploading", message: "Uploading video..." })}\n\n`);
      
      console.log("[STREAM] Compressing video for storage...");
      const compressedVideo = await compressVideo(videoBuffer);
      
      console.log("[STREAM] Uploading compressed video to object storage...");
      const videoUrl = await uploadVideoToStorage(compressedVideo, filename);
      console.log(`[STREAM] Video uploaded: ${videoUrl}`);

      // Send final complete event with all metadata
      res.write(`event: complete\ndata: ${JSON.stringify({
        explanation: fullExplanation,
        title,
        category,
        videoInfo,
        analysisStrategy: "native",
        thumbnail,
        videoUrl,
        mediaType: "video",
      })}\n\n`);

      res.end();
    } catch (error) {
      console.error("[STREAM] Error analyzing video:", error);
      
      // If headers haven't been sent, send JSON error
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Failed to analyze video",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      } else {
        // Headers already sent (SSE started), send error event
        res.write(`event: error\ndata: ${JSON.stringify({ 
          error: "Failed to analyze video",
          details: error instanceof Error ? error.message : "Unknown error"
        })}\n\n`);
        res.end();
      }
    }
  });

  // Test endpoint for multi-image capability
  const testMultiImageSchema = z.object({
    images: z.array(z.object({
      base64: z.string(),
      mimeType: z.string(),
    })).min(1).max(20),
  });

  app.post("/api/ai/test-multi-image", async (req, res) => {
    try {
      const { images } = testMultiImageSchema.parse(req.body);
      console.log(`Testing multi-image capability with ${images.length} images...`);
      
      const result = await testMultiImageCapability(images);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error testing multi-image:", error);
      res.status(500).json({ error: "Failed to test multi-image capability" });
    }
  });

  // Video info endpoint (for previewing before full analysis)
  app.post("/api/video/info", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded" });
      }

      const videoInfo = await getVideoInfo(req.file.buffer);
      res.json(videoInfo);
    } catch (error) {
      console.error("Error getting video info:", error);
      res.status(500).json({ 
        error: "Failed to get video info",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Stream video content through the server (proxy)
  app.get("/api/videos/:caseId/stream", async (req, res) => {
    try {
      const case_ = await storage.getCase(req.params.caseId);
      if (!case_) {
        return res.status(404).json({ error: "Case not found" });
      }
      if (!case_.videoUrl) {
        return res.status(404).json({ error: "No video for this case" });
      }

      // Parse bucket and object name from the stored URL
      const url = new URL(case_.videoUrl);
      const pathParts = url.pathname.split("/").filter(p => p.length > 0);
      const bucketName = pathParts[0];
      const objectName = pathParts.slice(1).join("/");

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: "Video file not found" });
      }

      // Get file metadata for content type and size
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || "video/mp4";
      const fileSize = parseInt(metadata.size as string, 10);

      // Handle range requests for video seeking
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Validate range
        if (isNaN(start) || start < 0 || start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set({ "Content-Range": `bytes */${fileSize}` }).end();
          return;
        }

        const chunkSize = end - start + 1;

        res.status(206);
        res.set({
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": contentType,
        });

        const stream = file.createReadStream({ start, end });
        stream.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Stream error" });
          }
        });
        stream.pipe(res);
      } else {
        res.set({
          "Content-Length": fileSize,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
        });

        const stream = file.createReadStream();
        stream.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Stream error" });
          }
        });
        stream.pipe(res);
      }
    } catch (error) {
      console.error("Error streaming video:", error);
      res.status(500).json({ error: "Failed to stream video" });
    }
  });

  // Seed endpoint - populates database with initial case data
  app.post("/api/seed", async (req, res) => {
    try {
      const existingCases = await storage.getCases();
      
      if (existingCases.length > 0) {
        return res.json({ 
          message: "Database already has cases", 
          existingCount: existingCases.length,
          seeded: 0 
        });
      }

      let seededCount = 0;
      for (const caseData of seedData as any[]) {
        try {
          await storage.createCase({
            title: caseData.title,
            imageUrl: caseData.imageUrl,
            explanation: caseData.explanation,
            category: caseData.category,
            attendingPrompt: caseData.attendingPrompt || null,
            videoUrl: caseData.videoUrl || null,
            mediaType: caseData.mediaType || "image",
          });
          seededCount++;
        } catch (err) {
          console.error("Error seeding case:", caseData.title, err);
        }
      }

      res.json({ 
        message: "Database seeded successfully", 
        seeded: seededCount,
        total: (seedData as any[]).length
      });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ error: "Failed to seed database" });
    }
  });

  return httpServer;
}
