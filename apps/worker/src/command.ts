import { spawn } from "node:child_process";

export interface CommandOptions {
  cwd?: string;
  onStderrLine?: (line: string) => void;
  onStdoutLine?: (line: string) => void;
}

export interface CommandResult {
  stderr: string;
  stdout: string;
}

export interface CommandRunner {
  run(
    executable: string,
    args: readonly string[],
    options?: CommandOptions,
  ): Promise<CommandResult>;
}

export class SpawnCommandRunner implements CommandRunner {
  run(
    executable: string,
    args: readonly string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let stdoutRemainder = "";
      let stderrRemainder = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        stdoutRemainder = emitLines(
          stdoutRemainder + chunk,
          options.onStdoutLine,
        );
      });

      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        stderrRemainder = emitLines(
          stderrRemainder + chunk,
          options.onStderrLine,
        );
      });

      child.on("error", (error) => {
        reject(
          new Error(`Could not start ${executable}: ${error.message}`, {
            cause: error,
          }),
        );
      });

      child.on("close", (exitCode) => {
        if (stdoutRemainder) {
          options.onStdoutLine?.(stdoutRemainder);
        }
        if (stderrRemainder) {
          options.onStderrLine?.(stderrRemainder);
        }

        if (exitCode === 0) {
          resolve({ stderr, stdout });
          return;
        }

        reject(
          new Error(
            `${executable} exited with code ${exitCode ?? "unknown"}: ${lastUsefulLine(stderr)}`,
          ),
        );
      });
    });
  }
}

function emitLines(
  value: string,
  onLine: ((line: string) => void) | undefined,
): string {
  const lines = value.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    if (line) {
      onLine?.(line);
    }
  }
  return remainder;
}

function lastUsefulLine(output: string): string {
  return (
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? "no diagnostic output"
  );
}
