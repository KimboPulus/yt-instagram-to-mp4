import { stat } from "node:fs/promises";

import {
  AppError,
  ERROR_MESSAGES,
  type MediaMetadata,
  type OutputMode,
} from "@clipforge/shared";

import type { CommandRunner } from "./command.js";
import type { JobLogger } from "./log.js";

interface ProbeOutput {
  format?: {
    duration?: string;
    tags?: {
      title?: string;
    };
  };
  streams?: Array<{
    avg_frame_rate?: string;
    codec_name?: string;
    codec_type?: string;
    height?: number;
    tags?: {
      title?: string;
    };
    width?: number;
  }>;
}

export interface MediaProcessor {
  convert(
    inputPath: string,
    outputPath: string,
    mode: OutputMode,
    durationSeconds: number,
    logger: JobLogger,
    onProgress: (percent: number) => Promise<void>,
  ): Promise<void>;
  probe(filePath: string): Promise<MediaMetadata>;
  thumbnail(
    inputPath: string,
    outputPath: string,
    durationSeconds: number,
    logger: JobLogger,
  ): Promise<void>;
}

export class FfmpegMediaProcessor implements MediaProcessor {
  constructor(
    private readonly runner: CommandRunner,
    private readonly ffmpegPath: string,
    private readonly ffprobePath: string,
  ) {}

  async probe(filePath: string): Promise<MediaMetadata> {
    const result = await this.runner.run(this.ffprobePath, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filePath,
    ]);
    const fileStats = await stat(filePath);
    return parseProbeOutput(result.stdout, fileStats.size);
  }

  async convert(
    inputPath: string,
    outputPath: string,
    mode: OutputMode,
    durationSeconds: number,
    logger: JobLogger,
    onProgress: (percent: number) => Promise<void>,
  ): Promise<void> {
    let lastProgress = -1;

    try {
      await this.runner.run(
        this.ffmpegPath,
        buildConversionArgs(inputPath, outputPath, mode),
        {
          onStderrLine: (line) => {
            void logger.write(`[ffmpeg] ${line}`);
            const seconds = parseFfmpegTime(line);
            if (seconds === undefined || durationSeconds <= 0) {
              return;
            }
            const progress = Math.min(
              99,
              Math.max(0, Math.floor((seconds / durationSeconds) * 100)),
            );
            if (progress >= lastProgress + 2) {
              lastProgress = progress;
              void onProgress(progress);
            }
          },
        },
      );
    } catch (error) {
      await logger.write(
        `Conversion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AppError(
        "PROCESSING_FAILED",
        ERROR_MESSAGES.PROCESSING_FAILED,
        true,
      );
    }
  }

  async thumbnail(
    inputPath: string,
    outputPath: string,
    durationSeconds: number,
    logger: JobLogger,
  ): Promise<void> {
    const seekSeconds = Math.max(0, Math.min(5, durationSeconds * 0.1));
    await this.runner.run(
      this.ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        seekSeconds.toFixed(2),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        "-y",
        outputPath,
      ],
      {
        onStderrLine: (line) => void logger.write(`[thumbnail] ${line}`),
      },
    );
  }
}

export function parseProbeOutput(
  rawJson: string,
  fileSizeBytes: number,
): MediaMetadata {
  const parsed = JSON.parse(rawJson) as ProbeOutput;
  const video = parsed.streams?.find(
    (stream) => stream.codec_type === "video",
  );
  if (!video?.codec_name || !video.width || !video.height) {
    throw new AppError("NO_VIDEO_STREAM", ERROR_MESSAGES.NO_VIDEO_STREAM);
  }

  const audio = parsed.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  const durationSeconds = Number.parseFloat(parsed.format?.duration ?? "0");

  return {
    audioCodec: audio?.codec_name,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    fileSizeBytes,
    frameRate: parseFrameRate(video.avg_frame_rate),
    height: video.height,
    title: parsed.format?.tags?.title ?? video.tags?.title,
    videoCodec: video.codec_name,
    width: video.width,
  };
}

export function buildConversionArgs(
  inputPath: string,
  outputPath: string,
  mode: OutputMode,
): string[] {
  const args = [
    "-hide_banner",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
  ];

  if (mode === "vertical") {
    args.push(
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black",
    );
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  );

  return args;
}

function parseFrameRate(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }
  const [numerator, denominator] = rawValue.split("/").map(Number);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return undefined;
  }
  return numerator! / denominator!;
}

function parseFfmpegTime(line: string): number | undefined {
  const match = /time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
