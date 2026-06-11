import { describe, expect, it } from "vitest";

import { createJobRequestSchema } from "./types.js";

describe("createJobRequestSchema", () => {
  it("applies the original output mode by default", () => {
    const result = createJobRequestSchema.parse({
      acknowledged: true,
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(result.outputMode).toBe("original");
  });

  it("requires explicit acknowledgement", () => {
    expect(() =>
      createJobRequestSchema.parse({
        acknowledged: false,
        url: "https://youtu.be/dQw4w9WgXcQ",
      }),
    ).toThrow();
  });
});
