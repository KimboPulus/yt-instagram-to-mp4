import { describe, expect, it } from "vitest";

import { buildConversionArgs, parseProbeOutput } from "./media.js";

describe("parseProbeOutput", () => {
  it("extracts video, audio and format metadata", () => {
    const metadata = parseProbeOutput(
      JSON.stringify({
        format: {
          duration: "12.5",
          tags: { title: "Small test clip" },
        },
        streams: [
          {
            avg_frame_rate: "30000/1001",
            codec_name: "h264",
            codec_type: "video",
            height: 1080,
            width: 1920,
          },
          {
            codec_name: "aac",
            codec_type: "audio",
          },
        ],
      }),
      1234,
    );

    expect(metadata).toMatchObject({
      audioCodec: "aac",
      durationSeconds: 12.5,
      fileSizeBytes: 1234,
      height: 1080,
      title: "Small test clip",
      videoCodec: "h264",
      width: 1920,
    });
    expect(metadata.frameRate).toBeCloseTo(29.97, 2);
  });

  it("rejects files without a video stream", () => {
    expect(() =>
      parseProbeOutput(
        JSON.stringify({
          format: { duration: "2" },
          streams: [{ codec_name: "aac", codec_type: "audio" }],
        }),
        50,
      ),
    ).toThrow("does not contain a video stream");
  });
});

describe("buildConversionArgs", () => {
  it("maps optional audio and enables browser fast-start", () => {
    const args = buildConversionArgs("input.webm", "output.mp4", "original");

    expect(args).toContain("0:a?");
    expect(args).toContain("+faststart");
    expect(args).not.toContain("-vf");
  });

  it("adds a 9:16 scale and pad filter for vertical output", () => {
    const args = buildConversionArgs("input.webm", "output.mp4", "vertical");
    const filterIndex = args.indexOf("-vf");

    expect(args[filterIndex + 1]).toContain("scale=1080:1920");
    expect(args[filterIndex + 1]).toContain("pad=1080:1920");
  });
});
