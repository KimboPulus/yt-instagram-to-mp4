import path from "node:path";

import { config } from "dotenv";
import type { NextConfig } from "next";

config({
  path: path.resolve(process.cwd(), "..", "..", ".env"),
  quiet: true,
});

const nextConfig: NextConfig = {};

export default nextConfig;
