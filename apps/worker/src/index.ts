import "./env.js";

import {
  VIDEO_QUEUE_NAME,
  type VideoJobData,
  type VideoJobResult,
} from "@clipforge/shared";
import { Worker } from "bullmq";

import { cleanupExpiredFiles } from "./cleanup.js";
import { SpawnCommandRunner } from "./command.js";
import { loadConfig } from "./config.js";
import { YtDlpImporter } from "./importer.js";
import { FfmpegMediaProcessor } from "./media.js";
import { createVideoProcessor } from "./processor.js";

const config = loadConfig();
const runner = new SpawnCommandRunner();
const importer = new YtDlpImporter(
  runner,
  config.downloaderPath,
  config.maxFileSizeBytes,
);
const media = new FfmpegMediaProcessor(
  runner,
  config.ffmpegPath,
  config.ffprobePath,
);
const processor = createVideoProcessor({ config, importer, media });

await cleanupExpiredFiles(config.dataDir, config.cleanupAgeHours);

const worker = new Worker<VideoJobData, VideoJobResult, "import-video">(
  VIDEO_QUEUE_NAME,
  processor,
  {
    concurrency: config.workerConcurrency,
    connection: {
      maxRetriesPerRequest: null,
      url: config.redisUrl,
    },
  },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id ?? "unknown"} failed: ${error.message}`);
});

worker.on("error", (error) => {
  console.error("Worker connection error:", error);
});

const cleanupTimer = setInterval(
  () => {
    void cleanupExpiredFiles(config.dataDir, config.cleanupAgeHours).catch(
      (error) => console.error("Cleanup failed:", error),
    );
  },
  60 * 60 * 1000,
);
cleanupTimer.unref();

const shutdown = async () => {
  clearInterval(cleanupTimer);
  await worker.close();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
