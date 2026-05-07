import { cases, chatMessages, chatSessions, counters, type Case, type InsertCase, type ChatMessage, type InsertChatMessage, type ChatSession, type InsertChatSession } from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, ilike, or } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getCases(): Promise<Case[]>;
  getCase(id: string): Promise<Case | undefined>;
  getCaseByNumber(caseNumber: number): Promise<Case | undefined>;
  getNextCaseNumber(): Promise<number>;
  createCase(case_: InsertCase, createdBy?: string): Promise<Case>;
  updateCase(id: string, updates: { title?: string; explanation?: string; category?: string }): Promise<Case | undefined>;
  deleteCase(id: string): Promise<boolean>;
  
  // Chat session methods
  getChatSession(id: string): Promise<ChatSession | undefined>;
  getChatSessionsForUser(userId: string): Promise<(ChatSession & { caseName: string })[]>;
  searchChatSessions(userId: string, query: string): Promise<(ChatSession & { caseName: string })[]>;
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  updateChatSessionTitle(id: string, title: string): Promise<ChatSession | undefined>;
  getOrCreateChatSession(caseId: string, userId: string): Promise<ChatSession>;
  
  // Chat message methods
  getChatMessages(caseId: string): Promise<ChatMessage[]>;
  getChatMessagesBySession(sessionId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  deleteChatMessages(caseId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCases(): Promise<Case[]> {
    return db.select().from(cases).orderBy(desc(cases.caseNumber));
  }

  async getCase(id: string): Promise<Case | undefined> {
    const [case_] = await db.select().from(cases).where(eq(cases.id, id));
    return case_ || undefined;
  }

  async getCaseByNumber(caseNumber: number): Promise<Case | undefined> {
    const [case_] = await db.select().from(cases).where(eq(cases.caseNumber, caseNumber));
    return case_ || undefined;
  }

  async getNextCaseNumber(): Promise<number> {
    const result = await db.execute(sql`
      INSERT INTO counters (name, value)
      VALUES (
        'case_number',
        GREATEST(COALESCE((SELECT MAX(case_number) FROM cases), 0), 0) + 1
      )
      ON CONFLICT (name) DO UPDATE
        SET value = GREATEST(
          counters.value,
          COALESCE((SELECT MAX(case_number) FROM cases), 0)
        ) + 1
      RETURNING value
    `);
    const rows = (result as unknown as { rows: Array<{ value: number }> }).rows;
    return Number(rows[0].value);
  }

  async createCase(insertCase: InsertCase, createdBy?: string): Promise<Case> {
    const id = randomUUID();
    const caseNumber = await this.getNextCaseNumber();
    const [case_] = await db
      .insert(cases)
      .values({
        id,
        caseNumber,
        title: insertCase.title,
        imageUrl: insertCase.imageUrl,
        explanation: insertCase.explanation,
        category: insertCase.category,
        attendingPrompt: insertCase.attendingPrompt ?? null,
        videoUrl: insertCase.videoUrl ?? null,
        mediaType: insertCase.mediaType ?? "image",
        createdBy: createdBy ?? null,
      })
      .returning();
    return case_;
  }

  async updateCase(id: string, updates: { title?: string; explanation?: string; category?: string }): Promise<Case | undefined> {
    const existingCase = await this.getCase(id);
    if (!existingCase) {
      return undefined;
    }
    
    const updateData: Partial<{ title: string; explanation: string; category: string }> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.explanation !== undefined) updateData.explanation = updates.explanation;
    if (updates.category !== undefined) updateData.category = updates.category;
    
    if (Object.keys(updateData).length === 0) {
      return existingCase;
    }
    
    const [updated] = await db
      .update(cases)
      .set(updateData)
      .where(eq(cases.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCase(id: string): Promise<boolean> {
    const caseToDelete = await this.getCase(id);
    if (!caseToDelete) {
      return false;
    }

    await this.deleteChatMessages(id);
    const result = await db.delete(cases).where(eq(cases.id, id)).returning();

    return result.length > 0;
  }

  // Chat session methods
  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session || undefined;
  }

  async getChatSessionsForUser(userId: string): Promise<(ChatSession & { caseName: string })[]> {
    const result = await db
      .select({
        id: chatSessions.id,
        caseId: chatSessions.caseId,
        userId: chatSessions.userId,
        title: chatSessions.title,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
        caseName: cases.title,
      })
      .from(chatSessions)
      .innerJoin(cases, eq(chatSessions.caseId, cases.id))
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.updatedAt));
    
    return result;
  }

  async searchChatSessions(userId: string, query: string): Promise<(ChatSession & { caseName: string })[]> {
    const searchPattern = `%${query}%`;
    const result = await db
      .select({
        id: chatSessions.id,
        caseId: chatSessions.caseId,
        userId: chatSessions.userId,
        title: chatSessions.title,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
        caseName: cases.title,
      })
      .from(chatSessions)
      .innerJoin(cases, eq(chatSessions.caseId, cases.id))
      .where(
        and(
          eq(chatSessions.userId, userId),
          or(
            ilike(chatSessions.title, searchPattern),
            ilike(cases.title, searchPattern)
          )
        )
      )
      .orderBy(desc(chatSessions.updatedAt));
    
    return result;
  }

  async createChatSession(insertSession: InsertChatSession): Promise<ChatSession> {
    const id = randomUUID();
    const [session] = await db
      .insert(chatSessions)
      .values({
        id,
        caseId: insertSession.caseId,
        userId: insertSession.userId,
        title: insertSession.title ?? null,
      })
      .returning();
    return session;
  }

  async updateChatSessionTitle(id: string, title: string): Promise<ChatSession | undefined> {
    const [updated] = await db
      .update(chatSessions)
      .set({ title, updatedAt: new Date() })
      .where(eq(chatSessions.id, id))
      .returning();
    return updated || undefined;
  }

  async getOrCreateChatSession(caseId: string, userId: string): Promise<ChatSession> {
    // Check if user already has a session for this case
    const [existing] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.caseId, caseId), eq(chatSessions.userId, userId)));
    
    if (existing) {
      // Update the updatedAt timestamp
      const [updated] = await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, existing.id))
        .returning();
      return updated || existing;
    }
    
    // Create new session
    return this.createChatSession({ caseId, userId, title: null });
  }

  // Chat message methods
  async getChatMessages(caseId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.caseId, caseId)).orderBy(chatMessages.createdAt);
  }

  async getChatMessagesBySession(sessionId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(chatMessages.createdAt);
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const [message] = await db
      .insert(chatMessages)
      .values({
        id,
        sessionId: insertMessage.sessionId,
        caseId: insertMessage.caseId,
        role: insertMessage.role,
        content: insertMessage.content,
      })
      .returning();
    return message;
  }

  async deleteChatMessages(caseId: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.caseId, caseId));
  }
}

export const storage = new DatabaseStorage();
