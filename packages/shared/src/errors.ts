export type ErrorCode =
  | "ACKNOWLEDGEMENT_REQUIRED"
  | "DOWNLOAD_NOT_READY"
  | "DURATION_LIMIT_EXCEEDED"
  | "FILE_LIMIT_EXCEEDED"
  | "IMPORT_FAILED"
  | "INVALID_JOB_ID"
  | "NO_VIDEO_STREAM"
  | "PROCESSING_FAILED"
  | "UNSUPPORTED_URL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ACKNOWLEDGEMENT_REQUIRED:
    "You must confirm that this is your own video or that you have permission.",
  DOWNLOAD_NOT_READY: "The converted file is not ready yet.",
  DURATION_LIMIT_EXCEEDED:
    "This video exceeds the configured duration limit.",
  FILE_LIMIT_EXCEEDED: "This file exceeds the configured local limit.",
  IMPORT_FAILED:
    "The media could not be imported. It may be unavailable, private, restricted, removed, or unsupported.",
  INVALID_JOB_ID: "The requested job ID is invalid.",
  NO_VIDEO_STREAM: "The imported media does not contain a video stream.",
  PROCESSING_FAILED: "FFmpeg could not convert this file. See logs.",
  UNSUPPORTED_URL: "This link type is not supported.",
};
