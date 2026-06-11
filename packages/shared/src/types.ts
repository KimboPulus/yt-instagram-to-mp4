import { z } from "zod";

export const platformSchema = z.enum([
  "youtube",
  "youtube-shorts",
  "instagram-reel",
  "instagram-post",
  "instagram-tv",
]);

export type Platform = z.infer<typeof platformSchema>;

export const outputModeSchema = z.enum(["original", "vertical"]);
export type OutputMode = z.infer<typeof outputModeSchema>;

export const jobPhaseSchema = z.enum([
  "created",
  "queued",
  "validating",
  "importing",
  "probing",
  "converting",
  "thumbnailing",
  "finalizing",
  "completed",
  "failed",
  "deleted",
]);

export type JobPhase = z.infer<typeof jobPhaseSchema>;

export const createJobRequestSchema = z.object({
  acknowledged: z.literal(true),
  outputMode: outputModeSchema.default("original"),
  url: z.string().trim().min(1).max(2048),
});

export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

export interface NormalizedVideoUrl {
  canonicalUrl: string;
  platform: Platform;
  sourceId: string;
}

export interface MediaMetadata {
  audioCodec?: string;
  durationSeconds: number;
  fileSizeBytes: number;
  frameRate?: number;
  height: number;
  title?: string;
  videoCodec: string;
  width: number;
}

export interface VideoJobData {
  acknowledgedAt: string;
  canonicalUrl: string;
  createdAt: string;
  outputMode: OutputMode;
  platform: Platform;
  sourceId: string;
}

export interface VideoJobResult {
  completedAt: string;
  metadata: MediaMetadata;
  outputFileName: string;
  thumbnailFileName?: string;
}

export interface JobStatusResponse {
  createdAt: string;
  error?: {
    code: string;
    message: string;
  };
  id: string;
  phase: JobPhase;
  platform: Platform;
  progress: number;
  result?: VideoJobResult;
}

export interface CreateJobResponse {
  id: string;
  platform: Platform;
  statusUrl: string;
}
