import path from "node:path";

import { DEFAULT_LIMITS } from "@clipforge/shared";
import { z } from "zod";

const projectRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const envSchema = z.object({
  CLEANUP_AGE_HOURS: z.coerce
    .number()
    .positive()
    .default(DEFAULT_LIMITS.cleanupAgeHours),
  DATA_DIR: z.string().optional(),
  DOWNLOADER_PATH: z.string().default("yt-dlp"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  MAX_DURATION_SECONDS: z.coerce
    .number()
    .positive()
    .default(DEFAULT_LIMITS.maxDurationSeconds),
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .positive()
    .default(DEFAULT_LIMITS.maxFileSizeBytes),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  WORKER_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .default(DEFAULT_LIMITS.workerConcurrency),
});

export interface WorkerConfig {
  cleanupAgeHours: number;
  dataDir: string;
  downloaderPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  maxDurationSeconds: number;
  maxFileSizeBytes: number;
  redisUrl: string;
  workerConcurrency: number;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const parsed = envSchema.parse(environment);

  return {
    cleanupAgeHours: parsed.CLEANUP_AGE_HOURS,
    dataDir: path.resolve(projectRoot, parsed.DATA_DIR ?? "data"),
    downloaderPath: parsed.DOWNLOADER_PATH,
    ffmpegPath: parsed.FFMPEG_PATH,
    ffprobePath: parsed.FFPROBE_PATH,
    maxDurationSeconds: parsed.MAX_DURATION_SECONDS,
    maxFileSizeBytes: parsed.MAX_FILE_SIZE_BYTES,
    redisUrl: parsed.REDIS_URL,
    workerConcurrency: parsed.WORKER_CONCURRENCY,
  };
}
