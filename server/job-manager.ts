import { randomUUID } from "crypto";
import { EventEmitter } from "events";

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
  }, 5 * 60 * 1000);
  cleanupTimer.unref?.();
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
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
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
  return event;
}

export function snapshotJob(job: Job) {
  const lastSeq = job.events.length ? job.events[job.events.length - 1].seq : 0;
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
