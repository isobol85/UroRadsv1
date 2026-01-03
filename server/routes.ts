import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema, insertChatMessageSchema } from "@shared/schema";
import { generateExplanation, generateTitle, generateCategory, generateChatResponse, refineExplanation, analyzeVideoFrames, testMultiImageCapability } from "./ai";
import { extractFramesFromVideo, getVideoInfo } from "./video";
import { z } from "zod";
import multer from "multer";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

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

      const frameCount = parseInt(req.body.frameCount || "10", 10);
      const attendingPrompt = req.body.attendingPrompt;

      console.log(`Processing video: ${req.file.originalname}, size: ${req.file.size} bytes`);
      console.log(`Extracting ${frameCount} frames...`);

      // Get video info
      const videoInfo = await getVideoInfo(req.file.buffer);
      console.log(`Video info: duration=${videoInfo.duration}s, ${videoInfo.width}x${videoInfo.height}, ${videoInfo.fps}fps`);

      // Extract frames
      const frames = await extractFramesFromVideo(req.file.buffer, { frameCount });
      console.log(`Extracted ${frames.length} frames`);

      // Use 5th frame (index 4) as thumbnail, or middle frame if less than 5
      const thumbnailIndex = Math.min(4, Math.floor(frames.length / 2));
      const thumbnailFrame = frames[thumbnailIndex];
      const thumbnail = `data:${thumbnailFrame.mimeType};base64,${thumbnailFrame.base64}`;

      // Analyze with AI (Gemini multi-image)
      console.log(`Sending ${frames.length} frames to Gemini for analysis...`);
      const explanation = await analyzeVideoFrames(frames, attendingPrompt);
      
      // Generate title and category from the explanation
      const [title, category] = await Promise.all([
        generateTitle(explanation),
        generateCategory(explanation),
      ]);

      res.json({
        explanation,
        title,
        category,
        videoInfo,
        framesExtracted: frames.length,
        thumbnail,
      });
    } catch (error) {
      console.error("Error analyzing video:", error);
      res.status(500).json({ 
        error: "Failed to analyze video",
        details: error instanceof Error ? error.message : "Unknown error"
      });
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

  return httpServer;
}
