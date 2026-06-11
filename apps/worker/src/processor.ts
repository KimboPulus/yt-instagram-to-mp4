import path from "node:path";

import {
  AppError,
  ERROR_MESSAGES,
  normalizeVideoUrl,
  type JobPhase,
  type VideoJobData,
  type VideoJobResult,
} from "@clipforge/shared";

import type { WorkerConfig } from "./config.js";
import {
  prepareJobFolders,
  removeTemporaryFolder,
  type JobFolders,
} from "./folders.js";
import type { MediaImporter } from "./importer.js";
import { FileJobLogger, type JobLogger } from "./log.js";
import type { MediaProcessor } from "./media.js";

export interface WorkerJob {
  data: VideoJobData;
  discard(): void;
  id?: string;
  updateProgress(progress: {
    phase: JobPhase;
    percent: number;
  }): Promise<void>;
}

export interface ProcessorDependencies {
  config: WorkerConfig;
  importer: MediaImporter;
  media: MediaProcessor;
  loggerFactory?: (folders: JobFolders) => JobLogger;
}

export function createVideoProcessor(dependencies: ProcessorDependencies) {
  return async (job: WorkerJob): Promise<VideoJobResult> => {
    if (!job.id) {
      throw new Error("BullMQ did not provide a job ID");
    }

    const folders = await prepareJobFolders(
      dependencies.config.dataDir,
      job.id,
    );
    const logger =
      dependencies.loggerFactory?.(folders) ??
      new FileJobLogger(folders.logs);

    try {
      await setPhase(job, logger, "validating", 5);
      const normalized = normalizeVideoUrl(job.data.canonicalUrl);
      if (
        normalized.canonicalUrl !== job.data.canonicalUrl ||
        normalized.platform !== job.data.platform
      ) {
        throw new AppError("UNSUPPORTED_URL", ERROR_MESSAGES.UNSUPPORTED_URL);
      }

      await setPhase(job, logger, "importing", 15);
      const importedPath = await dependencies.importer.import(
        job.data.canonicalUrl,
        folders.downloads,
        logger,
      );

      await setPhase(job, logger, "probing", 40);
      const sourceMetadata = await dependencies.media.probe(importedPath);
      enforceLimits(sourceMetadata, dependencies.config);

      await setPhase(job, logger, "converting", 50);
      const outputFileName = "output.mp4";
      const outputFilePath = path.join(folders.outputs, outputFileName);
      await dependencies.media.convert(
        importedPath,
        outputFilePath,
        job.data.outputMode,
        sourceMetadata.durationSeconds,
        logger,
        async (conversionProgress) => {
          const totalProgress = 50 + Math.round(conversionProgress * 0.4);
          await job.updateProgress({
            phase: "converting",
            percent: Math.min(90, totalProgress),
          });
        },
      );

      await setPhase(job, logger, "thumbnailing", 92);
      const thumbnailFileName = "thumbnail.jpg";
      await dependencies.media.thumbnail(
        outputFilePath,
        path.join(folders.outputs, thumbnailFileName),
        sourceMetadata.durationSeconds,
        logger,
      );

      await setPhase(job, logger, "finalizing", 97);
      const outputMetadata = await dependencies.media.probe(outputFilePath);
      await removeTemporaryFolder(folders.temp);
      await setPhase(job, logger, "completed", 100);

      return {
        completedAt: new Date().toISOString(),
        metadata: {
          ...outputMetadata,
          title: sourceMetadata.title,
        },
        outputFileName,
        thumbnailFileName,
      };
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              "PROCESSING_FAILED",
              ERROR_MESSAGES.PROCESSING_FAILED,
              true,
            );

      if (!appError.retryable) {
        job.discard();
      }

      await job.updateProgress({
        phase: "failed",
        percent: 0,
      });
      await logger.write(`Job failed: ${appError.message}`);
      throw new Error(
        JSON.stringify({
          code: appError.code,
          message: appError.message,
        }),
        { cause: error },
      );
    }
  };
}

async function setPhase(
  job: WorkerJob,
  logger: JobLogger,
  phase: JobPhase,
  percent: number,
): Promise<void> {
  await job.updateProgress({ phase, percent });
  await logger.write(`Phase: ${phase} (${percent}%).`);
}

function enforceLimits(
  metadata: {
    durationSeconds: number;
    fileSizeBytes: number;
  },
  config: WorkerConfig,
): void {
  if (metadata.durationSeconds > config.maxDurationSeconds) {
    throw new AppError(
      "DURATION_LIMIT_EXCEEDED",
      ERROR_MESSAGES.DURATION_LIMIT_EXCEEDED,
    );
  }
  if (metadata.fileSizeBytes > config.maxFileSizeBytes) {
    throw new AppError(
      "FILE_LIMIT_EXCEEDED",
      ERROR_MESSAGES.FILE_LIMIT_EXCEEDED,
    );
  }
}
