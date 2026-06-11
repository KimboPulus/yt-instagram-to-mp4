import { describe, expect, it } from "vitest";

import { buildImporterArgs } from "./importer.js";

describe("buildImporterArgs", () => {
  it("blocks playlists and does not add cookies or account options", () => {
    const args = buildImporterArgs(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "downloads/%(id)s.%(ext)s",
      500_000_000,
    );

    expect(args).toContain("--no-playlist");
    expect(args).toContain("--max-filesize");
    expect(args).not.toContain("--cookies");
    expect(args.at(-1)).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});
