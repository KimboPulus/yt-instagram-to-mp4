import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { JOB_ID_PATTERN } from "@clipforge/shared";

export interface JobFolders {
  downloads: string;
  logs: string;
  outputs: string;
  temp: string;
}

export function getJobFolders(dataDir: string, jobId: string): JobFolders {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error("Refusing to create folders for an invalid job ID");
  }

  return {
    downloads: path.join(dataDir, "downloads", jobId),
    logs: path.join(dataDir, "logs", jobId),
    outputs: path.join(dataDir, "outputs", jobId),
    temp: path.join(dataDir, "temp", jobId),
  };
}

export async function prepareJobFolders(
  dataDir: string,
  jobId: string,
): Promise<JobFolders> {
  const folders = getJobFolders(dataDir, jobId);
  await Promise.all(
    Object.values(folders).map((folder) => mkdir(folder, { recursive: true })),
  );
  return folders;
}

export async function removeTemporaryFolder(folder: string): Promise<void> {
  await rm(folder, { force: true, recursive: true });
}
