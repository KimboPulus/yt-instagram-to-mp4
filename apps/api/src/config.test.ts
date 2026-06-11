import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("API config", () => {
  it("resolves a relative data directory from the project root", () => {
    const config = loadConfig({ DATA_DIR: "./custom-data" });
    const projectRoot = path.resolve(import.meta.dirname, "..", "..", "..");

    expect(config.dataDir).toBe(path.join(projectRoot, "custom-data"));
  });

  it("preserves an absolute data directory", () => {
    const absoluteDataDir = path.resolve("D:/clipforge-test-data");

    expect(loadConfig({ DATA_DIR: absoluteDataDir }).dataDir).toBe(
      absoluteDataDir,
    );
  });
});
