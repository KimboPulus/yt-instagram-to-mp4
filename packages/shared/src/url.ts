import { AppError, ERROR_MESSAGES } from "./errors.js";
import type { NormalizedVideoUrl, Platform } from "./types.js";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,15}$/;
const INSTAGRAM_ID = /^[A-Za-z0-9_-]+$/;

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function assertNoPlaylist(url: URL): void {
  if (
    url.pathname.toLowerCase() === "/playlist" ||
    url.searchParams.has("list")
  ) {
    throw new AppError("UNSUPPORTED_URL", ERROR_MESSAGES.UNSUPPORTED_URL);
  }
}

function normalizeYouTube(url: URL): NormalizedVideoUrl | undefined {
  const host = normalizedHostname(url);

  if (host === "youtu.be") {
    assertNoPlaylist(url);
    const sourceId = url.pathname.split("/").filter(Boolean)[0];
    if (!sourceId || !YOUTUBE_ID.test(sourceId)) {
      return undefined;
    }
    return {
      canonicalUrl: `https://www.youtube.com/watch?v=${sourceId}`,
      platform: "youtube",
      sourceId,
    };
  }

  if (!["youtube.com", "m.youtube.com"].includes(host)) {
    return undefined;
  }

  assertNoPlaylist(url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/watch") {
    const sourceId = url.searchParams.get("v");
    if (!sourceId || !YOUTUBE_ID.test(sourceId)) {
      return undefined;
    }
    return {
      canonicalUrl: `https://www.youtube.com/watch?v=${sourceId}`,
      platform: "youtube",
      sourceId,
    };
  }

  if (parts[0] === "shorts" && parts[1] && YOUTUBE_ID.test(parts[1])) {
    return {
      canonicalUrl: `https://www.youtube.com/shorts/${parts[1]}`,
      platform: "youtube-shorts",
      sourceId: parts[1],
    };
  }

  return undefined;
}

function normalizeInstagram(url: URL): NormalizedVideoUrl | undefined {
  const host = normalizedHostname(url);
  if (host !== "instagram.com") {
    return undefined;
  }

  const [kind, sourceId] = url.pathname.split("/").filter(Boolean);
  if (
    !kind ||
    !sourceId ||
    !["p", "reel", "tv"].includes(kind) ||
    !INSTAGRAM_ID.test(sourceId)
  ) {
    return undefined;
  }

  const platformByKind: Record<string, Platform> = {
    p: "instagram-post",
    reel: "instagram-reel",
    tv: "instagram-tv",
  };

  return {
    canonicalUrl: `https://www.instagram.com/${kind}/${sourceId}/`,
    platform: platformByKind[kind]!,
    sourceId,
  };
}

export function normalizeVideoUrl(rawUrl: string): NormalizedVideoUrl {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new AppError("UNSUPPORTED_URL", ERROR_MESSAGES.UNSUPPORTED_URL);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError("UNSUPPORTED_URL", ERROR_MESSAGES.UNSUPPORTED_URL);
  }

  const normalized = normalizeYouTube(url) ?? normalizeInstagram(url);
  if (!normalized) {
    throw new AppError("UNSUPPORTED_URL", ERROR_MESSAGES.UNSUPPORTED_URL);
  }

  return normalized;
}
