import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const DATA_CATEGORIES = ["downloads", "logs", "outputs", "temp"] as const;

export async function cleanupExpiredFiles(
  dataDir: string,
  cleanupAgeHours: number,
  now = Date.now(),
): Promise<number> {
  const threshold = now - cleanupAgeHours * 60 * 60 * 1000;
  const expiredJobIds = new Set<string>();

  for (const category of DATA_CATEGORIES) {
    const categoryDirectory = path.join(dataDir, category);
    const entries = await readdir(categoryDirectory, {
      withFileTypes: true,
    }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const directory = path.join(categoryDirectory, entry.name);
      const directoryStats = await stat(directory);
      if (directoryStats.mtimeMs < threshold) {
        expiredJobIds.add(entry.name);
      }
    }
  }

  await Promise.all(
    [...expiredJobIds].flatMap((jobId) =>
      DATA_CATEGORIES.map((category) =>
        rm(path.join(dataDir, category, jobId), {
          force: true,
          recursive: true,
        }),
      ),
    ),
  );

  return expiredJobIds.size;
}
