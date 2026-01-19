import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

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
  createdBy: varchar("created_by", { length: 255 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  caseNumber: true,
  createdBy: true,
  createdAt: true,
});

export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  caseId: varchar("case_id", { length: 36 }).notNull().references(() => cases.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"), // AI-generated 3-word title, null until generated
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  sessionId: varchar("session_id", { length: 36 }).references(() => chatSessions.id, { onDelete: "cascade" }),
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
