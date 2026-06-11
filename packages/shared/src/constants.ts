export const VIDEO_QUEUE_NAME = "video-import";

export const DEFAULT_LIMITS = {
  cleanupAgeHours: 24,
  maxDurationSeconds: 10 * 60,
  maxFileSizeBytes: 500 * 1024 * 1024,
  workerConcurrency: 1,
} as const;

export const JOB_ID_PATTERN = /^[a-f0-9-]{36}$/i;
