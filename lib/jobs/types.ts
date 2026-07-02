// Queue-ready job abstraction.
//
// The heavy or slow work in Covera (PUF ingestion, formulary refreshes, procedure re-pricing,
// benchmark runs, annual recommendation re-checks, and large simulations) does not belong on
// a request path. This module defines a thin, provider-agnostic queue interface so that work
// lives in plain handler functions and can be enqueued from anywhere. The default runner is
// in-process (below); swapping in BullMQ, Inngest, Cloud Tasks, or Temporal later means
// writing one adapter that implements `JobQueue`, with zero changes to the business logic.

/** The kinds of background work the app knows how to run. */
export type JobKind =
  | "ingestPlans"
  | "refreshFormulary"
  | "refreshProcedurePrices"
  | "runBenchmark"
  | "recheckRecommendation"
  | "longSimulation";

/** A unit of work: a kind plus its typed-ish payload. Payloads are JSON-serializable. */
export interface JobInput<P = Record<string, unknown>> {
  kind: JobKind;
  payload: P;
  /** Optional idempotency key: a queue may dedupe on this. */
  dedupeKey?: string;
}

export interface Job<P = Record<string, unknown>> extends JobInput<P> {
  id: string;
  status: JobStatus;
  attempts: number;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: unknown;
  error?: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

/** A handler runs one job's work and returns a JSON-serializable result. */
export type JobHandler<P = Record<string, unknown>, R = unknown> = (
  payload: P,
  ctx: JobContext,
) => Promise<R>;

/** Passed to handlers: lets long jobs report progress and enqueue follow-up work. */
export interface JobContext {
  jobId: string;
  log: (msg: string) => void;
  progress: (fraction: number) => void;
  enqueue: (input: JobInput) => Promise<Job>;
}

/**
 * The queue contract every provider implements. Business code depends only on this, never on
 * a specific queue library.
 */
export interface JobQueue {
  register<P, R>(kind: JobKind, handler: JobHandler<P, R>): void;
  enqueue<P>(input: JobInput<P>): Promise<Job<P>>;
  get(id: string): Job | undefined;
  list(filter?: { kind?: JobKind; status?: JobStatus }): Job[];
  /** Resolve when the job reaches a terminal state (succeeded or exhausted-failed). */
  waitFor(id: string): Promise<Job>;
}
