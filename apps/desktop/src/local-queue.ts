import type { JobPhase, VideoJobData, VideoJobResult } from "@clipforge/shared";

import type { QueueJobSnapshot, VideoQueue } from "../../api/dist/queue.js";
import type { WorkerJob } from "../../worker/dist/processor.js";

type Processor = (job: WorkerJob) => Promise<VideoJobResult>;

export class LocalVideoQueue implements VideoQueue {
  private readonly active = new Set<Promise<void>>();
  private readonly jobs = new Map<string, QueueJobSnapshot>();

  constructor(private readonly processor: Processor) {}

  async create(jobId: string, data: VideoJobData): Promise<void> {
    this.jobs.set(jobId, {
      data,
      id: jobId,
      phase: "queued",
      progress: 0,
    });

    const task = this.process(jobId, data);
    this.active.add(task);
    void task.finally(() => this.active.delete(task));
  }

  async delete(jobId: string): Promise<boolean> {
    return this.jobs.delete(jobId);
  }

  async get(jobId: string): Promise<QueueJobSnapshot | undefined> {
    return this.jobs.get(jobId);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.active);
  }

  private async process(jobId: string, data: VideoJobData): Promise<void> {
    let discarded = false;
    const job: WorkerJob = {
      data,
      discard: () => {
        discarded = true;
      },
      id: jobId,
      updateProgress: async ({ phase, percent }) => {
        const current = this.jobs.get(jobId);
        if (current) {
          this.jobs.set(jobId, {
            ...current,
            phase,
            progress: percent,
          });
        }
      },
    };

    try {
      const result = await this.processor(job);
      const current = this.jobs.get(jobId);
      if (current) {
        this.jobs.set(jobId, {
          ...current,
          phase: "completed",
          progress: 100,
          result,
        });
      }
    } catch (error) {
      const current = this.jobs.get(jobId);
      if (!current) {
        return;
      }
      this.jobs.set(jobId, {
        ...current,
        error: parseFailure(error),
        phase: "failed",
        progress: 0,
      });
      if (discarded) {
        return;
      }
    }
  }
}

function parseFailure(error: unknown): {
  code: string;
  message: string;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);

  try {
    const parsed = JSON.parse(rawMessage) as {
      code?: string;
      message?: string;
    };
    if (parsed.message) {
      return {
        code: parsed.code ?? "PROCESSING_FAILED",
        message: parsed.message,
      };
    }
  } catch {
    // Keep the original message for unexpected local failures.
  }

  return {
    code: "PROCESSING_FAILED",
    message: rawMessage,
  };
}
