import type { VideoJobData } from "@clipforge/shared";
import { describe, expect, it } from "vitest";

import { LocalVideoQueue } from "./local-queue.js";

const data: VideoJobData = {
  acknowledgedAt: "2026-06-24T10:00:00.000Z",
  canonicalUrl: "https://www.youtube.com/shorts/0LG1SJl_FmI",
  createdAt: "2026-06-24T10:00:00.000Z",
  outputMode: "original",
  platform: "youtube-shorts",
  sourceId: "0LG1SJl_FmI",
};

describe("LocalVideoQueue", () => {
  it("tracks processor progress and completion", async () => {
    const queue = new LocalVideoQueue(async (job) => {
      await job.updateProgress({ phase: "converting", percent: 65 });
      return {
        completedAt: "2026-06-24T10:00:10.000Z",
        metadata: {
          durationSeconds: 10,
          fileSizeBytes: 100,
          height: 1920,
          videoCodec: "h264",
          width: 1080,
        },
        outputFileName: "output.mp4",
      };
    });

    await queue.create("a8ad5f97-7728-4e0a-a327-c342d1e31338", data);
    await queue.close();

    await expect(
      queue.get("a8ad5f97-7728-4e0a-a327-c342d1e31338"),
    ).resolves.toMatchObject({
      phase: "completed",
      progress: 100,
      result: { outputFileName: "output.mp4" },
    });
  });

  it("exposes structured processor failures", async () => {
    const queue = new LocalVideoQueue(async () => {
      throw new Error(
        JSON.stringify({
          code: "IMPORT_FAILED",
          message: "The media could not be imported.",
        }),
      );
    });

    await queue.create("94a0c340-9d89-4146-8b61-ab75b11f4b23", data);
    await queue.close();

    await expect(
      queue.get("94a0c340-9d89-4146-8b61-ab75b11f4b23"),
    ).resolves.toMatchObject({
      error: {
        code: "IMPORT_FAILED",
        message: "The media could not be imported.",
      },
      phase: "failed",
    });
  });
});
