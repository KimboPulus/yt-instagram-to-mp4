import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import path from "node:path";

import { AppError, ERROR_MESSAGES, JOB_ID_PATTERN } from "@clipforge/shared";

export function assertJobId(jobId: string): void {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new AppError("INVALID_JOB_ID", ERROR_MESSAGES.INVALID_JOB_ID);
  }
}

export function jobDirectory(
  dataDir: string,
  category: "downloads" | "logs" | "outputs" | "temp",
  jobId: string,
): string {
  assertJobId(jobId);
  return path.join(dataDir, category, jobId);
}

export function outputPath(dataDir: string, jobId: string): string {
  return path.join(jobDirectory(dataDir, "outputs", jobId), "output.mp4");
}

export function thumbnailPath(dataDir: string, jobId: string): string {
  return path.join(jobDirectory(dataDir, "outputs", jobId), "thumbnail.jpg");
}

export async function openKnownFile(filePath: string) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    throw new Error("Expected a regular file");
  }

  return {
    size: fileStats.size,
    stream: createReadStream(filePath),
  };
}

export async function deleteJobFiles(
  dataDir: string,
  jobId: string,
): Promise<void> {
  assertJobId(jobId);
  await Promise.all(
    (["downloads", "logs", "outputs", "temp"] as const).map((category) =>
      rm(jobDirectory(dataDir, category, jobId), {
        force: true,
        recursive: true,
      }),
    ),
  );
}
