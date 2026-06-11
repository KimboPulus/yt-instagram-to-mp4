import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";

import cors from "@fastify/cors";
import {
  AppError,
  createJobRequestSchema,
  ERROR_MESSAGES,
  normalizeVideoUrl,
  type JobStatusResponse,
  type VideoJobData,
} from "@clipforge/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import type { ApiConfig } from "./config.js";
import {
  assertJobId,
  deleteJobFiles,
  openKnownFile,
  outputPath,
  thumbnailPath,
} from "./files.js";
import type { VideoQueue } from "./queue.js";

export interface AppDependencies {
  config: ApiConfig;
  queue: VideoQueue;
}

export async function buildApp({
  config,
  queue,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  await app.register(cors, {
    origin: ["http://127.0.0.1:3000", "http://localhost:3000"],
  });

  app.get("/health", async (_request, reply) => {
    const redis = await queue.ping().catch(() => false);
    return reply.code(redis ? 200 : 503).send({
      api: "ok",
      redis: redis ? "ok" : "unavailable",
    });
  });

  app.post("/jobs", async (request, reply) => {
    const payload = createJobRequestSchema.parse(request.body);
    const normalized = normalizeVideoUrl(payload.url);
    const id = randomUUID();
    const now = new Date().toISOString();
    const data: VideoJobData = {
      acknowledgedAt: now,
      canonicalUrl: normalized.canonicalUrl,
      createdAt: now,
      outputMode: payload.outputMode,
      platform: normalized.platform,
      sourceId: normalized.sourceId,
    };

    await queue.create(id, data);

    return reply.code(202).send({
      id,
      platform: normalized.platform,
      statusUrl: `/jobs/${id}`,
    });
  });

  app.get<{ Params: { id: string } }>("/jobs/:id", async (request, reply) => {
    assertJobId(request.params.id);
    const job = await queue.get(request.params.id);
    if (!job) {
      return reply.code(404).send({
        code: "JOB_NOT_FOUND",
        message: "The requested job does not exist.",
      });
    }

    const response: JobStatusResponse = {
      createdAt: job.data.createdAt,
      error: job.error,
      id: job.id,
      phase: job.phase,
      platform: job.data.platform,
      progress: Math.max(0, Math.min(100, Math.round(job.progress))),
      result: job.result,
    };

    return response;
  });

  app.get<{ Params: { id: string } }>(
    "/jobs/:id/download",
    async (request, reply) => {
      assertJobId(request.params.id);
      const job = await queue.get(request.params.id);
      if (!job || job.phase !== "completed") {
        throw new AppError(
          "DOWNLOAD_NOT_READY",
          ERROR_MESSAGES.DOWNLOAD_NOT_READY,
        );
      }

      const file = await openKnownFile(outputPath(config.dataDir, job.id));
      return reply
        .header("Content-Disposition", `attachment; filename="${job.id}.mp4"`)
        .header("Content-Length", file.size)
        .type("video/mp4")
        .send(file.stream);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/jobs/:id/thumbnail",
    async (request, reply) => {
      assertJobId(request.params.id);
      const filePath = thumbnailPath(config.dataDir, request.params.id);
      await access(filePath);
      const file = await openKnownFile(filePath);
      return reply
        .header("Cache-Control", "private, max-age=300")
        .header("Content-Length", file.size)
        .type("image/jpeg")
        .send(file.stream);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/jobs/:id",
    async (request, reply) => {
      assertJobId(request.params.id);
      await queue.delete(request.params.id);
      await deleteJobFiles(config.dataDir, request.params.id);
      return reply.code(204).send();
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const acknowledgementMissing = error.issues.some(
        (issue) => issue.path[0] === "acknowledged",
      );
      return reply.code(400).send({
        code: acknowledgementMissing
          ? "ACKNOWLEDGEMENT_REQUIRED"
          : "INVALID_REQUEST",
        message: acknowledgementMissing
          ? ERROR_MESSAGES.ACKNOWLEDGEMENT_REQUIRED
          : "The request is invalid.",
      });
    }

    if (error instanceof AppError) {
      return reply.code(400).send({
        code: error.code,
        message: error.message,
      });
    }

    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return reply.code(404).send({
        code: "FILE_NOT_FOUND",
        message: "The requested local file no longer exists.",
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "An unexpected local error occurred.",
    });
  });

  return app;
}
