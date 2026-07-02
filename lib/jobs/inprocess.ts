import type {
  Job,
  JobContext,
  JobHandler,
  JobInput,
  JobKind,
  JobQueue,
  JobStatus,
} from "@/lib/jobs/types";

// The default, dependency-free queue: runs jobs in-process, one at a time off a microtask
// loop, with retries and an in-memory record of every job. It is the reference implementation
// of `JobQueue` and is what runs in dev and in a single-instance deploy. A production adapter
// (BullMQ/Inngest/Temporal) would implement the same interface against a real broker; nothing
// that enqueues work would change. Handlers must be pure of request state so they port cleanly.

const MAX_ATTEMPTS = 3;

export class InProcessQueue implements JobQueue {
  private handlers = new Map<JobKind, JobHandler>();
  private jobs = new Map<string, Job>();
  private pending: string[] = [];
  private waiters = new Map<string, ((j: Job) => void)[]>();
  private draining = false;
  private seq = 0;

  /** Resolve when the job reaches a terminal state (succeeded or exhausted-failed). */
  waitFor(id: string): Promise<Job> {
    const j = this.jobs.get(id);
    if (j && (j.status === "succeeded" || j.status === "failed"))
      return Promise.resolve(j);
    return new Promise((resolve) => {
      const arr = this.waiters.get(id) ?? [];
      arr.push(resolve);
      this.waiters.set(id, arr);
    });
  }

  private notify(job: Job): void {
    const arr = this.waiters.get(job.id);
    if (!arr) return;
    this.waiters.delete(job.id);
    for (const r of arr) r(job);
  }

  register<P, R>(kind: JobKind, handler: JobHandler<P, R>): void {
    this.handlers.set(kind, handler as JobHandler);
  }

  async enqueue<P>(input: JobInput<P>): Promise<Job<P>> {
    // Idempotency: if a non-failed job with the same dedupeKey exists, return it.
    if (input.dedupeKey) {
      for (const j of this.jobs.values())
        if (j.dedupeKey === input.dedupeKey && j.status !== "failed") return j as Job<P>;
    }
    const id = `job_${++this.seq}_${Date.now().toString(36)}`;
    const job: Job = {
      id,
      kind: input.kind,
      payload: input.payload as Record<string, unknown>,
      dedupeKey: input.dedupeKey,
      status: "queued",
      attempts: 0,
      enqueuedAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.pending.push(id);
    void this.drain();
    return job as Job<P>;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(filter?: { kind?: JobKind; status?: JobStatus }): Job[] {
    const all = [...this.jobs.values()].sort((a, b) => b.enqueuedAt - a.enqueuedAt);
    return all.filter(
      (j) => (!filter?.kind || j.kind === filter.kind) && (!filter?.status || j.status === filter.status),
    );
  }

  /** Process the queue sequentially. Re-entrant-safe via the `draining` guard. */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        const id = this.pending.shift()!;
        const job = this.jobs.get(id);
        if (!job) continue;
        await this.runOnce(job);
        // A retry-pending job is put back as "queued", never left transiently "failed", so a
        // waiter cannot mistake a to-be-retried attempt for a terminal failure.
        if (job.status === "queued") this.pending.push(id);
        else this.notify(job); // terminal: succeeded, or failed after exhausting retries
      }
    } finally {
      this.draining = false;
    }
  }

  private async runOnce(job: Job): Promise<void> {
    const handler = this.handlers.get(job.kind);
    if (!handler) {
      job.status = "failed";
      job.error = `No handler registered for job kind "${job.kind}".`;
      job.attempts = MAX_ATTEMPTS; // unrecoverable: do not retry
      return;
    }
    job.status = "running";
    job.startedAt = Date.now();
    job.attempts++;
    const ctx: JobContext = {
      jobId: job.id,
      log: () => {},
      progress: () => {},
      enqueue: (input) => this.enqueue(input),
    };
    try {
      job.result = await handler(job.payload, ctx);
      job.status = "succeeded";
      job.error = undefined;
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e);
      // Decide retry vs terminal here, so the job never sits in a transient "failed" state
      // that a waiter could observe as the final outcome.
      job.status = job.attempts < MAX_ATTEMPTS ? "queued" : "failed";
    } finally {
      job.finishedAt = Date.now();
    }
  }
}
