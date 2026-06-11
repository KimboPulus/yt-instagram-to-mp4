"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { OutputMode } from "@clipforge/shared";

import { createJob } from "../lib/api";

type PlatformHint = "instagram" | "unknown" | "youtube";

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [outputMode, setOutputMode] = useState<OutputMode>("original");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const platform = useMemo(() => detectPlatform(url), [url]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!acknowledged) {
      setError(
        "Confirm that you own the video or have permission to process it.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const job = await createJob({ acknowledged, outputMode, url });
      router.push(`/jobs/${job.id}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The local API could not create this job.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">ONE LINK. ONE LOCAL QUEUE.</p>
          <h1>Turn your own clips into tidy MP4 files.</h1>
          <p className="hero-lead">
            Paste a YouTube or Instagram link you are allowed to use. ClipForge
            imports it locally, checks the media and converts it with FFmpeg.
          </p>
          <div className="hero-notes">
            <span>No accounts</span>
            <span>No cloud upload</span>
            <span>One job at a time</span>
          </div>
        </div>

        <form className="import-card" onSubmit={handleSubmit}>
          <div className="card-heading">
            <div>
              <p className="step-label">NEW JOB</p>
              <h2>Paste a video link</h2>
            </div>
            <span className={`platform-chip platform-${platform}`}>
              {platformLabel(platform)}
            </span>
          </div>

          <label className="field-label" htmlFor="video-url">
            YouTube or Instagram URL
          </label>
          <div className="url-field">
            <span aria-hidden="true">https://</span>
            <input
              autoComplete="off"
              id="video-url"
              name="url"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="youtube.com/watch?v=..."
              required
              type="url"
              value={url}
            />
          </div>

          <fieldset className="format-picker">
            <legend>Output shape</legend>
            <label
              className={outputMode === "original" ? "format-active" : ""}
            >
              <input
                checked={outputMode === "original"}
                name="outputMode"
                onChange={() => setOutputMode("original")}
                type="radio"
              />
              <span className="format-icon format-wide" />
              <span>
                <strong>Keep original</strong>
                <small>Preserve the source aspect ratio</small>
              </span>
            </label>
            <label
              className={outputMode === "vertical" ? "format-active" : ""}
            >
              <input
                checked={outputMode === "vertical"}
                name="outputMode"
                onChange={() => setOutputMode("vertical")}
                type="radio"
              />
              <span className="format-icon format-tall" />
              <span>
                <strong>Vertical 9:16</strong>
                <small>Fit inside a 1080 x 1920 frame</small>
              </span>
            </label>
          </fieldset>

          <label className="permission-check">
            <input
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              type="checkbox"
            />
            <span>
              I own this video or have permission to download and convert it.
            </span>
          </label>

          <div className="legal-note">
            Local personal use only. Do not process other people&apos;s
            copyrighted or private content.
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            <span>{submitting ? "Adding to queue..." : "Create local job"}</span>
            <span aria-hidden="true">-&gt;</span>
          </button>
        </form>
      </section>

      <section className="process-section">
        <div className="section-heading">
          <p className="eyebrow">UNDER THE HOOD</p>
          <h2>A small pipeline with visible steps.</h2>
          <p>
            Slow work happens in a separate worker, so the browser stays
            responsive and every failure has a useful phase.
          </p>
        </div>
        <div className="process-grid">
          <ProcessCard
            number="01"
            title="Validate"
            text="Accept only supported video links and reject playlists or missing permission."
          />
          <ProcessCard
            number="02"
            title="Import"
            text="A local yt-dlp adapter downloads one permitted source into its own job folder."
          />
          <ProcessCard
            number="03"
            title="Inspect"
            text="FFprobe reads duration, dimensions, codecs and size before conversion begins."
          />
          <ProcessCard
            number="04"
            title="Convert"
            text="FFmpeg writes H.264 video, optional AAC audio and browser-friendly fast-start data."
          />
        </div>
      </section>
    </>
  );
}

function ProcessCard({
  number,
  text,
  title,
}: {
  number: string;
  text: string;
  title: string;
}) {
  return (
    <article className="process-card">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function detectPlatform(value: string): PlatformHint {
  const normalized = value.toLowerCase();
  if (normalized.includes("youtu.be") || normalized.includes("youtube.com")) {
    return "youtube";
  }
  if (normalized.includes("instagram.com")) {
    return "instagram";
  }
  return "unknown";
}

function platformLabel(platform: PlatformHint): string {
  if (platform === "youtube") {
    return "YouTube";
  }
  if (platform === "instagram") {
    return "Instagram";
  }
  return "Auto detect";
}
