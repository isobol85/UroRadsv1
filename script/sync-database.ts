import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const { Pool } = pg;

const DATA_FILE = join(process.cwd(), "db-export.json");

async function exportData() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  console.log("🔍 Connecting to database...");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log("📦 Exporting cases...");
  const cases = await db.select().from(schema.cases);

  console.log("💬 Exporting chat messages...");
  const chatMessages = await db.select().from(schema.chatMessages);

  const data = {
    cases,
    chatMessages,
    exportedAt: new Date().toISOString(),
  };

  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`✅ Exported ${cases.length} cases and ${chatMessages.length} chat messages to ${DATA_FILE}`);

  await pool.end();
}

async function importData() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  if (!existsSync(DATA_FILE)) {
    throw new Error(`Data file not found: ${DATA_FILE}. Run 'npm run db:export' first.`);
  }

  console.log("📖 Reading data file...");
  const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));

  console.log("🔍 Connecting to database...");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log(`📥 Importing ${data.cases.length} cases...`);
  for (const caseData of data.cases) {
    await db.insert(schema.cases).values(caseData).onConflictDoNothing();
  }

  console.log(`💬 Importing ${data.chatMessages.length} chat messages...`);
  for (const message of data.chatMessages) {
    await db.insert(schema.chatMessages).values(message).onConflictDoNothing();
  }

  console.log("✅ Import completed successfully!");
  console.log(`   Exported at: ${data.exportedAt}`);

  await pool.end();
}

const command = process.argv[2];

if (command === "export") {
  exportData().catch(console.error);
} else if (command === "import") {
  importData().catch(console.error);
} else {
  console.log("Usage:");
  console.log("  npm run db:export  - Export data from current database");
  console.log("  npm run db:import  - Import data to current database");
}
