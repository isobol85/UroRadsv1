import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { eq, lt, lte, or, and } from "drizzle-orm";
import { db } from "./db";
import { analysisJobs } from "@shared/schema";

export type JobKind = "image" | "video";
export type JobStatus = "running" | "completed" | "failed";

export type JobEventType = "status" | "chunk" | "complete" | "error";

export interface JobEvent {
  type: JobEventType;
  seq: number;
  data: any;
}

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  events: JobEvent[];
  result: any | null;
  error: { error: string; details?: string } | null;
  createdAt: number;
  updatedAt: number;
  emitter: EventEmitter;
}

const jobs = new Map<string, Job>();

// Keep finished jobs around long enough that a client whose phone slept for a
// while can still come back, fetch the result, and hydrate the UI.
const COMPLETED_TTL_MS = 30 * 60 * 1000;
// Hard cap: drop any job after this regardless of state so we don't leak memory
// if a runner ever gets stuck.
const HARD_TTL_MS = 2 * 60 * 60 * 1000;

let nextSeq = 1;
let cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, job] of Array.from(jobs.entries())) {
      const age = now - job.updatedAt;
      const terminal = job.status === "completed" || job.status === "failed";
      if ((terminal && age > COMPLETED_TTL_MS) || age > HARD_TTL_MS) {
        jobs.delete(id);
      }
    }
    // Also prune the durable store so the table doesn't grow forever.
    const completedCutoff = new Date(now - COMPLETED_TTL_MS);
    const hardCutoff = new Date(now - HARD_TTL_MS);
    db.delete(analysisJobs)
      .where(
        or(
          and(
            or(eq(analysisJobs.status, "completed"), eq(analysisJobs.status, "failed")),
            lt(analysisJobs.updatedAt, completedCutoff),
          ),
          lt(analysisJobs.updatedAt, hardCutoff),
        ),
      )
      .catch(err => console.error("[job-manager] prune failed:", err));
  }, 5 * 60 * 1000);
  cleanupTimer.unref?.();
}

function lastSeqOf(job: Job): number {
  return job.events.length ? job.events[job.events.length - 1].seq : 0;
}

// Serialize writes per job so a slow older write can never overtake a newer
// terminal write. Without this, a "running" snapshot could land in Postgres
// after the "completed" snapshot and regress the row — which would cause
// recoverInterruptedJobs() to falsely mark a successful job as failed on the
// next boot.
const writeQueues = new Map<string, Promise<void>>();

// Write-through persistence. Best-effort: we log but don't fail the job if
// the database is unavailable (the in-memory job remains functional for any
// still-connected client). The actual DB write also carries a monotonicity
// guard on `last_seq` as a belt-and-braces defence.
async function persistJobInner(snapshot: {
  id: string;
  kind: JobKind;
  status: JobStatus;
  events: JobEvent[];
  result: any;
  error: Job["error"];
  lastSeq: number;
  createdAt: Date;
  updatedAt: Date;
}): Promise<void> {
  try {
    await db
      .insert(analysisJobs)
      .values({
        id: snapshot.id,
        kind: snapshot.kind,
        status: snapshot.status,
        events: snapshot.events as any,
        result: snapshot.result as any,
        error: snapshot.error as any,
        lastSeq: snapshot.lastSeq,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoUpdate({
        target: analysisJobs.id,
        set: {
          status: snapshot.status,
          events: snapshot.events as any,
          result: snapshot.result as any,
          error: snapshot.error as any,
          lastSeq: snapshot.lastSeq,
          updatedAt: snapshot.updatedAt,
        },
        // Monotonicity guard: never let an older snapshot (smaller seq)
        // overwrite a newer one already in the row.
        where: lte(analysisJobs.lastSeq, snapshot.lastSeq),
      });
  } catch (err) {
    console.error(`[job-manager] failed to persist job ${snapshot.id}:`, err);
  }
}

function persistJob(job: Job): Promise<void> {
  // Snapshot the job's mutable state at enqueue time so subsequent in-memory
  // mutations don't race the queued DB write.
  const snapshot = {
    id: job.id,
    kind: job.kind,
    status: job.status,
    events: job.events.slice(),
    result: job.result,
    error: job.error,
    lastSeq: lastSeqOf(job),
    createdAt: new Date(job.createdAt),
    updatedAt: new Date(job.updatedAt),
  };
  const prev = writeQueues.get(job.id) ?? Promise.resolve();
  const next = prev.then(() => persistJobInner(snapshot));
  writeQueues.set(job.id, next);
  // Clean up the queue once this write settles, but only if no newer write
  // has been chained on top in the meantime.
  next.finally(() => {
    if (writeQueues.get(job.id) === next) writeQueues.delete(job.id);
  });
  return next;
}


export function createJob(kind: JobKind): Job {
  ensureCleanupTimer();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  const job: Job = {
    id: randomUUID(),
    kind,
    status: "running",
    events: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    emitter,
  };
  jobs.set(job.id, job);
  void persistJob(job);
  return job;
}

// Materialise an inert Job from a durable row. The emitter is present but
// nothing will ever fire on it — by construction, rehydrated jobs are always
// in a terminal state (the boot-time recovery marks any leftover "running"
// rows as failed before we ever hand them out).
function hydrateJob(row: typeof analysisJobs.$inferSelect): Job {
  const events = Array.isArray(row.events) ? (row.events as JobEvent[]) : [];
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  return {
    id: row.id,
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    events,
    result: row.result ?? null,
    error: (row.error as Job["error"]) ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    emitter,
  };
}

export async function getJob(id: string): Promise<Job | undefined> {
  const inMem = jobs.get(id);
  if (inMem) return inMem;
  try {
    const [row] = await db
      .select()
      .from(analysisJobs)
      .where(eq(analysisJobs.id, id));
    if (!row) return undefined;
    const job = hydrateJob(row);
    // Cache the hydrated terminal job so repeat polls don't hit the DB.
    jobs.set(job.id, job);
    return job;
  } catch (err) {
    console.error(`[job-manager] failed to load job ${id}:`, err);
    return undefined;
  }
}

export function emitJobEvent(
  job: Job,
  type: JobEventType,
  data: any,
): JobEvent {
  const event: JobEvent = { type, seq: nextSeq++, data };
  job.events.push(event);
  job.updatedAt = Date.now();

  if (type === "complete") {
    job.status = "completed";
    job.result = data;
  } else if (type === "error") {
    job.status = "failed";
    job.error = data;
  }

  job.emitter.emit("event", event);
  if (job.status !== "running") {
    job.emitter.emit("end");
  }
  // Write-through. Fire-and-forget — emit must stay synchronous so callers
  // can keep streaming chunks without awaiting Postgres on every token.
  void persistJob(job);
  return event;
}

export function snapshotJob(job: Job) {
  const lastSeq = lastSeqOf(job);
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    result: job.result,
    error: job.error,
    lastSeq,
  };
}

// Wait for a job to reach a terminal state OR for the supplied request to be
// closed by the client. Returns true when the job finished while the client
// was still listening, false when the client gave up first.
export function waitForJobTerminal(
  job: Job,
  req: { on: (ev: string, cb: () => void) => void; off?: (ev: string, cb: () => void) => void },
): Promise<boolean> {
  return new Promise(resolve => {
    if (job.status !== "running") return resolve(true);
    let settled = false;
    const onEnd = () => finish(true);
    const onClose = () => finish(false);
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      job.emitter.off("end", onEnd);
      req.off?.("close", onClose);
      resolve(ok);
    };
    job.emitter.on("end", onEnd);
    req.on("close", onClose);
  });
}

// Write the events of a job to an Express response as SSE. Replays events
// with seq > sinceSeq, then subscribes to live events until the job ends or
// the client disconnects. The response is ended on completion.
export function streamJobToResponse(
  job: Job,
  res: {
    write: (s: string) => boolean;
    end: () => void;
    flush?: () => void;
    on: (ev: string, cb: () => void) => void;
    off?: (ev: string, cb: () => void) => void;
  },
  sinceSeq: number,
): Promise<void> {
  return new Promise(resolve => {
    let closed = false;

    const writeEvent = (ev: JobEvent) => {
      if (closed) return;
      try {
        const payload = JSON.stringify({ ...ev.data, seq: ev.seq });
        res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${payload}\n\n`);
      } catch {
        // ignore write errors; the close handler will tear us down
      }
    };

    // Replay anything the client hasn't seen yet.
    for (const ev of job.events) {
      if (ev.seq > sinceSeq) writeEvent(ev);
    }

    if (job.status !== "running") {
      // Job already finished by the time the client reconnected: flush the
      // replayed events out of any intermediate buffers (compression
      // middleware etc.) before tearing down the connection so the client
      // actually receives the terminal event.
      try { res.flush?.(); } catch {}
      try { res.end(); } catch {}
      return resolve();
    }

    const onEvent = (ev: JobEvent) => writeEvent(ev);
    const cleanup = () => {
      closed = true;
      job.emitter.off("event", onEvent);
      job.emitter.off("end", onEnd);
      res.off?.("close", onClose);
    };
    const onEnd = () => {
      cleanup();
      try { res.end(); } catch {}
      resolve();
    };
    const onClose = () => {
      cleanup();
      resolve();
    };

    job.emitter.on("event", onEvent);
    job.emitter.on("end", onEnd);
    res.on("close", onClose);
  });
}

// Called once at server boot. Any jobs that were still "running" when the
// previous process died are abandoned — the buffers, ffmpeg children, and
// open OpenAI streams are gone. Mark them failed with a clear message and
// append a terminal "error" event so SSE replay still delivers a final frame
// to clients that reconnect.
export async function recoverInterruptedJobs(): Promise<void> {
  try {
    const stranded = await db
      .select()
      .from(analysisJobs)
      .where(eq(analysisJobs.status, "running"));
    if (stranded.length === 0) return;

    for (const row of stranded) {
      const events: JobEvent[] = Array.isArray(row.events)
        ? (row.events as JobEvent[])
        : [];
      const errorPayload = {
        error: "Analysis interrupted",
        details:
          "The server restarted while this analysis was running. Please re-upload to try again.",
      };
      const seq = (row.lastSeq ?? 0) + 1;
      events.push({ type: "error", seq, data: errorPayload });
      try {
        await db
          .update(analysisJobs)
          .set({
            status: "failed",
            error: errorPayload as any,
            events: events as any,
            lastSeq: seq,
            updatedAt: new Date(),
          })
          .where(eq(analysisJobs.id, row.id));
      } catch (err) {
        console.error(
          `[job-manager] failed to mark interrupted job ${row.id}:`,
          err,
        );
      }
    }
    console.log(
      `[job-manager] marked ${stranded.length} interrupted job(s) as failed after restart`,
    );
  } catch (err) {
    console.error("[job-manager] recoverInterruptedJobs failed:", err);
  }
}
