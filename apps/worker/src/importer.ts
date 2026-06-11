import path from "node:path";

import { AppError, ERROR_MESSAGES } from "@clipforge/shared";

import type { CommandRunner } from "./command.js";
import type { JobLogger } from "./log.js";

export interface MediaImporter {
  import(
    canonicalUrl: string,
    downloadDirectory: string,
    logger: JobLogger,
  ): Promise<string>;
}

export class YtDlpImporter implements MediaImporter {
  constructor(
    private readonly runner: CommandRunner,
    private readonly executable: string,
    private readonly maxFileSizeBytes: number,
  ) {}

  async import(
    canonicalUrl: string,
    downloadDirectory: string,
    logger: JobLogger,
  ): Promise<string> {
    const outputTemplate = path.join(
      downloadDirectory,
      "%(id)s.%(ext)s",
    );
    const args = buildImporterArgs(
      canonicalUrl,
      outputTemplate,
      this.maxFileSizeBytes,
    );
    const printedPaths: string[] = [];

    try {
      await logger.write("Starting local media import.");
      await this.runner.run(this.executable, args, {
        cwd: downloadDirectory,
        onStderrLine: (line) => void logger.write(`[yt-dlp] ${line}`),
        onStdoutLine: (line) => {
          if (line.trim()) {
            printedPaths.push(line.trim());
          }
        },
      });
    } catch (error) {
      await logger.write(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AppError(
        "IMPORT_FAILED",
        ERROR_MESSAGES.IMPORT_FAILED,
        true,
      );
    }

    const importedPath = printedPaths.at(-1);
    if (!importedPath) {
      throw new AppError("IMPORT_FAILED", ERROR_MESSAGES.IMPORT_FAILED, true);
    }

    await logger.write(`Imported media as ${path.basename(importedPath)}.`);
    return path.resolve(importedPath);
  }
}

export function buildImporterArgs(
  canonicalUrl: string,
  outputTemplate: string,
  maxFileSizeBytes: number,
): string[] {
  return [
    "--no-playlist",
    "--restrict-filenames",
    "--no-write-info-json",
    "--max-filesize",
    String(maxFileSizeBytes),
    "--merge-output-format",
    "mp4",
    "--print",
    "after_move:filepath",
    "--output",
    outputTemplate,
    canonicalUrl,
  ];
}
