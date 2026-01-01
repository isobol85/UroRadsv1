import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema, insertChatMessageSchema } from "@shared/schema";
import { generateExplanation, generateTitle, generateCategory, generateChatResponse, refineExplanation } from "./ai";
import { z } from "zod";

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

  return httpServer;
}
