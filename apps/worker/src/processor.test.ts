import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  JobPhase,
  MediaMetadata,
  VideoJobData,
} from "@clipforge/shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { WorkerConfig } from "./config.js";
import type { JobFolders } from "./folders.js";
import type { MediaImporter } from "./importer.js";
import type { JobLogger } from "./log.js";
import type { MediaProcessor } from "./media.js";
import { createVideoProcessor, type WorkerJob } from "./processor.js";

class MemoryLogger implements JobLogger {
  readonly lines: string[] = [];
  async write(message: string) {
    this.lines.push(message);
  }
}

class FakeImporter implements MediaImporter {
  async import(
    _canonicalUrl: string,
    downloadDirectory: string,
  ): Promise<string> {
    const filePath = path.join(downloadDirectory, "source.webm");
    await writeFile(filePath, "source");
    return filePath;
  }
}

class FakeMedia implements MediaProcessor {
  sourceMetadata: MediaMetadata = {
    audioCodec: "opus",
    durationSeconds: 20,
    fileSizeBytes: 100,
    height: 1080,
    title: "Learning clip",
    videoCodec: "vp9",
    width: 1920,
  };

  async convert(
    _inputPath: string,
    outputPath: string,
    _mode: "original" | "vertical",
    _durationSeconds: number,
    _logger: JobLogger,
    onProgress: (percent: number) => Promise<void>,
  ) {
    await onProgress(50);
    await writeFile(outputPath, "converted");
  }

  async probe(filePath: string) {
    return filePath.endsWith("output.mp4")
      ? {
          ...this.sourceMetadata,
          audioCodec: "aac",
          fileSizeBytes: 200,
          videoCodec: "h264",
        }
      : this.sourceMetadata;
  }

  async thumbnail(_inputPath: string, outputPath: string) {
    await writeFile(outputPath, "jpeg");
  }
}

class FakeJob implements WorkerJob {
  readonly progress: Array<{ phase: JobPhase; percent: number }> = [];
  discarded = false;

  constructor(
    public readonly id: string,
    public readonly data: VideoJobData,
  ) {}

  discard() {
    this.discarded = true;
  }

  async updateProgress(progress: { phase: JobPhase; percent: number }) {
    this.progress.push(progress);
  }
}

describe("video processor", () => {
  let config: WorkerConfig;
  let media: FakeMedia;
  let logger: MemoryLogger;

  beforeEach(async () => {
    config = {
      cleanupAgeHours: 24,
      dataDir: await mkdtemp(path.join(tmpdir(), "clipforge-worker-")),
      downloaderPath: "yt-dlp",
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      maxDurationSeconds: 600,
      maxFileSizeBytes: 500_000_000,
      redisUrl: "redis://127.0.0.1:6379",
      workerConcurrency: 1,
    };
    media = new FakeMedia();
    logger = new MemoryLogger();
  });

  it("runs every phase and returns converted metadata", async () => {
    const processor = createVideoProcessor({
      config,
      importer: new FakeImporter(),
      media,
      loggerFactory: (_folders: JobFolders) => logger,
    });
    const job = new FakeJob("c072978e-7b07-4d9f-b51e-0fd1680ab4e5", {
      acknowledgedAt: new Date().toISOString(),
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      createdAt: new Date().toISOString(),
      outputMode: "original",
      platform: "youtube",
      sourceId: "dQw4w9WgXcQ",
    });

    const result = await processor(job);

    expect(job.progress.map((item) => item.phase)).toEqual(
      expect.arrayContaining([
        "validating",
        "importing",
        "probing",
        "converting",
        "thumbnailing",
        "finalizing",
        "completed",
      ]),
    );
    expect(result.metadata).toMatchObject({
      audioCodec: "aac",
      title: "Learning clip",
      videoCodec: "h264",
    });
    expect(result.thumbnailFileName).toBe("thumbnail.jpg");
  });

  it("discards jobs that exceed the duration limit", async () => {
    media.sourceMetadata.durationSeconds = 601;
    const processor = createVideoProcessor({
      config,
      importer: new FakeImporter(),
      media,
      loggerFactory: () => logger,
    });
    const job = new FakeJob("f8f1a5ad-c6cb-44d4-82f5-b2ce5df34997", {
      acknowledgedAt: new Date().toISOString(),
      canonicalUrl: "https://www.instagram.com/reel/C8example_1/",
      createdAt: new Date().toISOString(),
      outputMode: "vertical",
      platform: "instagram-reel",
      sourceId: "C8example_1",
    });

    await expect(processor(job)).rejects.toThrow("DURATION_LIMIT_EXCEEDED");
    expect(job.discarded).toBe(true);
    expect(job.progress.at(-1)?.phase).toBe("failed");
  });
});
