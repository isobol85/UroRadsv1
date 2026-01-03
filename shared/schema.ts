import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cases = pgTable("cases", {
  id: varchar("id", { length: 36 }).primaryKey(),
  caseNumber: integer("case_number").notNull(),
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull(),
  explanation: text("explanation").notNull(),
  category: text("category").notNull(),
  attendingPrompt: text("attending_prompt"),
  videoUrl: text("video_url"),
  mediaType: text("media_type").notNull().default("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  caseNumber: true,
  createdAt: true,
});

export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  caseId: varchar("case_id", { length: 36 }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
