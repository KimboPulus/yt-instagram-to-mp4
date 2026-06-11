import path from "node:path";

import { DEFAULT_LIMITS } from "@clipforge/shared";
import { z } from "zod";

const projectRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const envSchema = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  CLEANUP_AGE_HOURS: z.coerce
    .number()
    .positive()
    .default(DEFAULT_LIMITS.cleanupAgeHours),
  DATA_DIR: z.string().optional(),
  MAX_DURATION_SECONDS: z.coerce
    .number()
    .positive()
    .default(DEFAULT_LIMITS.maxDurationSeconds),
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .positive()
    .default(DEFAULT_LIMITS.maxFileSizeBytes),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
});

export interface ApiConfig {
  cleanupAgeHours: number;
  dataDir: string;
  host: string;
  maxDurationSeconds: number;
  maxFileSizeBytes: number;
  port: number;
  redisUrl: string;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const parsed = envSchema.parse(environment);

  return {
    cleanupAgeHours: parsed.CLEANUP_AGE_HOURS,
    dataDir: path.resolve(projectRoot, parsed.DATA_DIR ?? "data"),
    host: parsed.API_HOST,
    maxDurationSeconds: parsed.MAX_DURATION_SECONDS,
    maxFileSizeBytes: parsed.MAX_FILE_SIZE_BYTES,
    port: parsed.API_PORT,
    redisUrl: parsed.REDIS_URL,
  };
}
