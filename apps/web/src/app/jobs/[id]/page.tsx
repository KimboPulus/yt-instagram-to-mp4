"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import type { JobPhase, JobStatusResponse } from "@clipforge/shared";

import {
  API_URL,
  deleteJob,
  getJob,
  type ApiRequestError,
} from "../../../lib/api";

const DEMO_JOB: JobStatusResponse = {
  createdAt: "2026-06-11T10:42:00.000Z",
  id: "demo",
  phase: "completed",
  platform: "youtube-shorts",
  progress: 100,
  result: {
    completedAt: "2026-06-11T10:42:19.000Z",
    metadata: {
      audioCodec: "aac",
      durationSeconds: 37.4,
      fileSizeBytes: 18_742_221,
      frameRate: 30,
      height: 1920,
      title: "Morning studio notes",
      videoCodec: "h264",
      width: 1080,
    },
    outputFileName: "output.mp4",
    thumbnailFileName: "thumbnail.jpg",
  },
};

const PHASES: Array<{ key: JobPhase; label: string }> = [
  { key: "queued", label: "Queued" },
  { key: "importing", label: "Importing" },
  { key: "probing", label: "Inspecting" },
  { key: "converting", label: "Converting" },
  { key: "thumbnailing", label: "Preview" },
  { key: "completed", label: "Ready" },
];

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const demo = id === "demo";
  const [job, setJob] = useState<JobStatusResponse | undefined>(
    demo ? DEMO_JOB : undefined,
  );
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (demo) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const nextJob = await getJob(id);
        if (cancelled) {
          return;
        }
        setJob(nextJob);
        setError(undefined);
        if (!["completed", "failed", "deleted"].includes(nextJob.phase)) {
          timer = setTimeout(refresh, 1_500);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            (caughtError as ApiRequestError).message ??
              "The local API is unavailable.",
          );
        }
      }
    }

    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [demo, id]);

  async function handleDelete() {
    if (demo) {
      router.push("/");
      return;
    }
    setDeleting(true);
    try {
      await deleteJob(id);
      router.push("/");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The job could not be deleted.",
      );
      setDeleting(false);
    }
  }

  if (!job && !error) {
    return (
      <section className="job-page">
        <div className="loading-card">
          <span className="loading-ring" />
          <h1>Opening local job...</h1>
          <p>Checking the queue and worker state.</p>
        </div>
      </section>
    );
  }

  if (!job) {
    return (
      <section className="job-page">
        <div className="error-card">
          <p className="eyebrow">LOCAL API ERROR</p>
          <h1>We could not read this job.</h1>
          <p>{error}</p>
          <a className="secondary-button" href="/">
            Back to importer
          </a>
        </div>
      </section>
    );
  }

  const metadata = job.result?.metadata;
  const completed = job.phase === "completed";
  const failed = job.phase === "failed";

  return (
    <section className="job-page">
      <div className="job-topline">
        <a className="back-link" href="/">
          &lt;- New job
        </a>
        <span className="job-id">JOB {shortId(job.id)}</span>
      </div>

      <div className="job-layout">
        <div className="job-main">
          <div className="job-title-row">
            <div>
              <p className="eyebrow">{platformName(job.platform)}</p>
              <h1>
                {failed
                  ? "This job stopped."
                  : completed
                    ? "Your MP4 is ready."
                    : "Working on your video."}
              </h1>
            </div>
            <div className={`result-stamp ${failed ? "result-failed" : ""}`}>
              <span>{completed ? "DONE" : failed ? "STOPPED" : "LOCAL"}</span>
              <strong>{job.progress}%</strong>
            </div>
          </div>

          <div className="progress-panel">
            <div className="progress-track">
              <span style={{ width: `${job.progress}%` }} />
            </div>
            <div className="phase-list">
              {PHASES.map((phase, index) => {
                const state = phaseState(job.phase, phase.key);
                return (
                  <div className={`phase-item phase-${state}`} key={phase.key}>
                    <span>{state === "done" ? "OK" : index + 1}</span>
                    <small>{phase.label}</small>
                  </div>
                );
              })}
            </div>
          </div>

          {failed ? (
            <div className="job-error">
              <strong>{job.error?.code ?? "PROCESSING_FAILED"}</strong>
              <p>{job.error?.message ?? "The worker could not finish."}</p>
            </div>
          ) : null}

          {metadata ? (
            <>
              <div className="preview-panel">
                <div className="preview-placeholder">
                  <div className="preview-art">
                    <span>MP4</span>
                    <strong>{metadata.title ?? "Converted video"}</strong>
                    <small>
                      {formatDuration(metadata.durationSeconds)} local preview
                    </small>
                  </div>
                </div>
                <div className="preview-copy">
                  <p className="step-label">OUTPUT FILE</p>
                  <h2>{metadata.title ?? "Converted video"}</h2>
                  <p>
                    H.264 MP4 with fast-start metadata, ready for normal browser
                    playback.
                  </p>
                  <div className="output-actions">
                    <a
                      className={`primary-button ${demo ? "button-disabled" : ""}`}
                      href={
                        demo ? undefined : `${API_URL}/jobs/${job.id}/download`
                      }
                    >
                      Download MP4
                    </a>
                    <button
                      className="text-button"
                      disabled={deleting}
                      onClick={handleDelete}
                      type="button"
                    >
                      {deleting ? "Deleting..." : "Delete local files"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="metadata-grid">
                <Metadata
                  label="Duration"
                  value={formatDuration(metadata.durationSeconds)}
                />
                <Metadata
                  label="Frame"
                  value={`${metadata.width} x ${metadata.height}`}
                />
                <Metadata
                  label="File size"
                  value={formatBytes(metadata.fileSizeBytes)}
                />
                <Metadata
                  label="Video"
                  value={metadata.videoCodec.toUpperCase()}
                />
                <Metadata
                  label="Audio"
                  value={metadata.audioCodec?.toUpperCase() ?? "None"}
                />
                <Metadata
                  label="Frame rate"
                  value={
                    metadata.frameRate
                      ? `${metadata.frameRate.toFixed(2)} fps`
                      : "Unknown"
                  }
                />
              </div>
            </>
          ) : (
            <div className="waiting-panel">
              <span className="loading-ring" />
              <div>
                <strong>{phaseDescription(job.phase)}</strong>
                <p>
                  Keep this tab open or come back later. The worker owns the
                  slow part.
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="job-aside">
          <p className="step-label">LOCAL JOB NOTES</p>
          <ul>
            <li>The source and output live in folders named after this job.</li>
            <li>No browser cookies, private logins or proxy lists are used.</li>
            <li>Temporary files are removed after the worker finishes.</li>
            <li>Old local files are cleaned using the configured retention.</li>
          </ul>
          {demo ? (
            <p className="demo-note">
              Documentation preview. Buttons that need a real output file are
              disabled.
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function phaseState(current: JobPhase, target: JobPhase) {
  if (current === "failed") {
    return "idle";
  }
  const currentIndex = PHASES.findIndex((item) => item.key === current);
  const targetIndex = PHASES.findIndex((item) => item.key === target);
  if (targetIndex < currentIndex || current === "completed") {
    return "done";
  }
  if (targetIndex === currentIndex) {
    return "active";
  }
  return "idle";
}

function platformName(platform: JobStatusResponse["platform"]) {
  return platform.replaceAll("-", " ").toUpperCase();
}

function shortId(id: string) {
  return id === "demo" ? "DEMO-2406" : id.slice(0, 8).toUpperCase();
}

function phaseDescription(phase: JobPhase) {
  const descriptions: Partial<Record<JobPhase, string>> = {
    converting: "FFmpeg is writing the final MP4.",
    importing: "The source is being imported locally.",
    probing: "FFprobe is checking the media streams.",
    queued: "The job is waiting for the worker.",
    thumbnailing: "A small JPEG preview is being created.",
    validating: "The link and job settings are being checked.",
  };
  return descriptions[phase] ?? "The worker is finalizing this job.";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
