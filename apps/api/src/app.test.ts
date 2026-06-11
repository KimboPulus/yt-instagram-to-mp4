import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { JobPhase, VideoJobData, VideoJobResult } from "@clipforge/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import type { QueueJobSnapshot, VideoQueue } from "./queue.js";

class FakeQueue implements VideoQueue {
  readonly jobs = new Map<string, QueueJobSnapshot>();

  async close() {}

  async create(jobId: string, data: VideoJobData) {
    this.jobs.set(jobId, {
      data,
      id: jobId,
      phase: "queued",
      progress: 0,
    });
  }

  async delete(jobId: string) {
    return this.jobs.delete(jobId);
  }

  async get(jobId: string) {
    return this.jobs.get(jobId);
  }

  async ping() {
    return true;
  }

  complete(jobId: string, result: VideoJobResult) {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, {
        ...job,
        phase: "completed",
        progress: 100,
        result,
      });
    }
  }

  setPhase(jobId: string, phase: JobPhase) {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, { ...job, phase });
    }
  }
}

describe("API routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let config: ApiConfig;
  let queue: FakeQueue;

  beforeEach(async () => {
    queue = new FakeQueue();
    config = {
      cleanupAgeHours: 24,
      dataDir: await mkdtemp(path.join(tmpdir(), "clipforge-api-")),
      host: "127.0.0.1",
      maxDurationSeconds: 600,
      maxFileSizeBytes: 500_000_000,
      port: 4100,
      redisUrl: "redis://127.0.0.1:6379",
    };
    app = await buildApp({ config, queue });
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a normalized queue job", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        acknowledged: true,
        url: "https://youtu.be/dQw4w9WgXcQ?si=test",
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.platform).toBe("youtube");
    expect(queue.jobs.get(body.id)?.data.canonicalUrl).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("rejects a missing ownership acknowledgement", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        acknowledged: false,
        url: "https://youtu.be/dQw4w9WgXcQ",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("ACKNOWLEDGEMENT_REQUIRED");
  });

  it("rejects path-shaped job identifiers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/jobs/..%2F..%2Fsecret/download",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_JOB_ID");
  });

  it("returns a clear response for an unknown job", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/jobs/0f715539-1daf-4f7a-8b03-0d44e9da1189",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "JOB_NOT_FOUND",
      message: "The requested job does not exist.",
    });
  });

  it("blocks downloads until processing has completed", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        acknowledged: true,
        url: "https://youtube.com/shorts/0LG1SJl_FmI",
      },
    });
    const { id } = createResponse.json();

    const response = await app.inject({
      method: "GET",
      url: `/jobs/${id}/download`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("DOWNLOAD_NOT_READY");
  });

  it("serves only the known completed output file", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        acknowledged: true,
        url: "https://instagram.com/reel/C8example_1/",
      },
    });
    const { id } = createResponse.json();
    const outputDirectory = path.join(config.dataDir, "outputs", id);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "output.mp4"), "fake-mp4");
    queue.complete(id, {
      completedAt: new Date().toISOString(),
      metadata: {
        durationSeconds: 1,
        fileSizeBytes: 8,
        height: 1080,
        videoCodec: "h264",
        width: 1920,
      },
      outputFileName: "output.mp4",
    });

    const response = await app.inject({
      method: "GET",
      url: `/jobs/${id}/download`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("video/mp4");
    expect(response.body).toBe("fake-mp4");
  });

  it("serves a generated JPEG thumbnail", async () => {
    const id = "5c34c915-83c0-4fda-b384-c9fe691db50b";
    const outputDirectory = path.join(config.dataDir, "outputs", id);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "thumbnail.jpg"), "fake-jpeg");

    const response = await app.inject({
      method: "GET",
      url: `/jobs/${id}/thumbnail`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["cache-control"]).toBe("private, max-age=300");
    expect(response.body).toBe("fake-jpeg");
  });

  it("deletes queue state and local folders", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        acknowledged: true,
        url: "https://instagram.com/p/C8example_2/",
      },
    });
    const { id } = createResponse.json();
    const categories = ["downloads", "logs", "outputs", "temp"] as const;

    await Promise.all(
      categories.map(async (category) => {
        const directory = path.join(config.dataDir, category, id);
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "artifact.txt"), category);
      }),
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/jobs/${id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(queue.jobs.has(id)).toBe(false);
    await Promise.all(
      categories.map((category) =>
        expect(
          access(path.join(config.dataDir, category, id)),
        ).rejects.toMatchObject({ code: "ENOENT" }),
      ),
    );
  });
});
