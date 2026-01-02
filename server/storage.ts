import { cases, chatMessages, type Case, type InsertCase, type ChatMessage, type InsertChatMessage } from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, gt } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getCases(): Promise<Case[]>;
  getCase(id: string): Promise<Case | undefined>;
  getCaseByNumber(caseNumber: number): Promise<Case | undefined>;
  getNextCaseNumber(): Promise<number>;
  createCase(case_: InsertCase): Promise<Case>;
  updateCase(id: string, updates: { title?: string; explanation?: string; category?: string }): Promise<Case | undefined>;
  deleteCase(id: string): Promise<boolean>;
  getChatMessages(caseId: string): Promise<ChatMessage[]>;
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
    const result = await db.select({ max: sql<number>`COALESCE(MAX(${cases.caseNumber}), 0)` }).from(cases);
    return (result[0]?.max || 0) + 1;
  }

  async createCase(insertCase: InsertCase): Promise<Case> {
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
    
    const deletedCaseNumber = caseToDelete.caseNumber;
    
    await this.deleteChatMessages(id);
    const result = await db.delete(cases).where(eq(cases.id, id)).returning();
    
    if (result.length > 0) {
      await db
        .update(cases)
        .set({ caseNumber: sql`${cases.caseNumber} - 1` })
        .where(gt(cases.caseNumber, deletedCaseNumber));
      return true;
    }
    return false;
  }

  async getChatMessages(caseId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.caseId, caseId)).orderBy(chatMessages.createdAt);
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const [message] = await db
      .insert(chatMessages)
      .values({
        id,
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
