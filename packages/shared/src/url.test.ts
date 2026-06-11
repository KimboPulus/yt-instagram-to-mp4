import { describe, expect, it } from "vitest";

import { AppError } from "./errors.js";
import { normalizeVideoUrl } from "./url.js";

describe("normalizeVideoUrl", () => {
  it.each([
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12",
      "youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ],
    [
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ],
    [
      "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share",
      "youtube-shorts",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ],
    [
      "https://www.instagram.com/reel/C8example_1/?igsh=abc",
      "instagram-reel",
      "https://www.instagram.com/reel/C8example_1/",
    ],
    [
      "https://instagram.com/p/C8example_2/",
      "instagram-post",
      "https://www.instagram.com/p/C8example_2/",
    ],
  ])("normalizes %s", (input, platform, canonicalUrl) => {
    expect(normalizeVideoUrl(input)).toMatchObject({ platform, canonicalUrl });
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "file:///tmp/video.mp4",
    "not a url",
    "https://instagram.com/profile-name/",
  ])("rejects unsupported input %s", (input) => {
    expect(() => normalizeVideoUrl(input)).toThrow(AppError);
  });

  it("rejects YouTube playlists", () => {
    expect(() =>
      normalizeVideoUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123",
      ),
    ).toThrow("This link type is not supported.");
  });
});
