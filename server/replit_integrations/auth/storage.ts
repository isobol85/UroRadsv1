import { users, type User, type UpsertUser } from "@shared/models/auth";
import { cases } from "@shared/schema";
import { db } from "../../db";
import { asc, eq, sql } from "drizzle-orm";

// Helper: username-only users have ids prefixed with `username_` (see routes.ts).
// They are never allowed to be admins.
export function isUsernameUserId(id: string): boolean {
  return id.startsWith("username_");
}

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserCount(): Promise<number>;
  listUsers(): Promise<User[]>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    return result[0]?.count || 0;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Username-only users can never be admin (enforced server-side for security).
    if (userData.id && isUsernameUserId(userData.id)) {
      userData.isAdmin = false;
    } else {
      // Bootstrap: if there are no admins yet, the next SSO user to log in
      // becomes admin. This guarantees an admin always exists, even if some
      // username-only accounts were created first.
      const existingUser = await this.getUser(userData.id!);
      if (!existingUser) {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.isAdmin, true));
        if (Number(count) === 0) {
          userData.isAdmin = true;
        }
      }
    }
    
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async listUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(asc(users.createdAt));
  }

  async deleteUser(id: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      // Anonymize owned cases by clearing createdBy so cases remain available
      // for other learners even after the author's account is removed.
      await tx
        .update(cases)
        .set({ createdBy: null })
        .where(eq(cases.createdBy, id));
      // chat_sessions and chat_messages cascade via FK onDelete.
      const deleted = await tx
        .delete(users)
        .where(eq(users.id, id))
        .returning({ id: users.id });
      return deleted.length > 0;
    });
  }

  async setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined> {
    // Username-only users can never be admin (enforced server-side for security).
    if (isAdmin && isUsernameUserId(id)) {
      throw new Error("Username-only users cannot be granted admin rights");
    }
    const [updated] = await db
      .update(users)
      .set({ isAdmin, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
}

export const authStorage = new AuthStorage();
