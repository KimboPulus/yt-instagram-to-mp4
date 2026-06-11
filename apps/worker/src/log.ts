import { appendFile } from "node:fs/promises";
import path from "node:path";

export interface JobLogger {
  write(message: string): Promise<void>;
}

export class FileJobLogger implements JobLogger {
  constructor(private readonly logDirectory: string) {}

  async write(message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await appendFile(path.join(this.logDirectory, "job.log"), line, "utf8");
  }
}
