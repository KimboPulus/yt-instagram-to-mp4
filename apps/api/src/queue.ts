import {
  VIDEO_QUEUE_NAME,
  type JobPhase,
  type VideoJobData,
  type VideoJobResult,
} from "@clipforge/shared";
import { Queue } from "bullmq";

export interface QueueJobSnapshot {
  data: VideoJobData;
  error?: {
    code: string;
    message: string;
  };
  id: string;
  phase: JobPhase;
  progress: number;
  result?: VideoJobResult;
}

export interface VideoQueue {
  close(): Promise<void>;
  create(jobId: string, data: VideoJobData): Promise<void>;
  delete(jobId: string): Promise<boolean>;
  get(jobId: string): Promise<QueueJobSnapshot | undefined>;
  ping(): Promise<boolean>;
}

interface WorkerProgress {
  phase?: JobPhase;
  percent?: number;
}

interface WorkerFailure {
  code: string;
  message: string;
}

export class BullVideoQueue implements VideoQueue {
  private readonly queue: Queue<
    VideoJobData,
    VideoJobResult,
    "import-video",
    VideoJobData,
    VideoJobResult,
    "import-video"
  >;

  constructor(redisUrl: string) {
    this.queue = new Queue<
      VideoJobData,
      VideoJobResult,
      "import-video",
      VideoJobData,
      VideoJobResult,
      "import-video"
    >(VIDEO_QUEUE_NAME, {
      connection: {
        maxRetriesPerRequest: null,
        url: redisUrl,
      },
    });
  }

  async create(jobId: string, data: VideoJobData): Promise<void> {
    await this.queue.add("import-video", data, {
      attempts: 2,
      backoff: {
        delay: 3_000,
        type: "fixed",
      },
      jobId,
      removeOnComplete: {
        age: 7 * 24 * 60 * 60,
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60,
      },
    });
  }

  async get(jobId: string): Promise<QueueJobSnapshot | undefined> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return undefined;
    }

    const state = await job.getState();
    const progress =
      typeof job.progress === "object" && job.progress !== null
        ? (job.progress as WorkerProgress)
        : undefined;
    const failed = parseFailure(job.failedReason);
    const fallbackPhase: JobPhase =
      state === "completed"
        ? "completed"
        : state === "failed"
          ? "failed"
          : state === "active"
            ? "validating"
            : "queued";

    return {
      data: job.data,
      error: failed,
      id: job.id ?? jobId,
      phase: progress?.phase ?? fallbackPhase,
      progress:
        progress?.percent ??
        (state === "completed" ? 100 : state === "active" ? 5 : 0),
      result: job.returnvalue ?? undefined,
    };
  }

  async delete(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return false;
    }
    await job.remove();
    return true;
  }

  async ping(): Promise<boolean> {
    await this.queue.getJobCounts("wait");
    return true;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

function parseFailure(
  rawFailure: string | undefined,
): WorkerFailure | undefined {
  if (!rawFailure) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawFailure) as Partial<WorkerFailure>;
    if (parsed.message) {
      return {
        code: parsed.code ?? "PROCESSING_FAILED",
        message: parsed.message,
      };
    }
  } catch {
    // Older or external workers may leave a plain-text reason.
  }

  return {
    code: "PROCESSING_FAILED",
    message: rawFailure,
  };
}
