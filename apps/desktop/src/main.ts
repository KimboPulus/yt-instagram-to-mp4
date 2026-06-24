import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { app, BrowserWindow, dialog, shell } from "electron";

import { buildApp } from "../../api/dist/app.js";
import type { ApiConfig } from "../../api/dist/config.js";
import { cleanupExpiredFiles } from "../../worker/dist/cleanup.js";
import { SpawnCommandRunner } from "../../worker/dist/command.js";
import type { WorkerConfig } from "../../worker/dist/config.js";
import { YtDlpImporter } from "../../worker/dist/importer.js";
import { FfmpegMediaProcessor } from "../../worker/dist/media.js";
import { createVideoProcessor } from "../../worker/dist/processor.js";
import { LocalVideoQueue } from "./local-queue.js";

const API_PORT = 4100;
const WEB_PORT = 3210;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..", "..", "..");
const require = createRequire(import.meta.url);
const createNextApp = require("next") as typeof import("next").default;

let apiServer: Awaited<ReturnType<typeof buildApp>> | undefined;
let webServer: Server | undefined;
let queue: LocalVideoQueue | undefined;
let mainWindow: BrowserWindow | undefined;
let shuttingDown = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    await startServices();
    createWindow();
  } catch (error) {
    dialog.showErrorBox(
      "ClipForge could not start",
      error instanceof Error ? error.message : String(error),
    );
    await shutdown();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (!shuttingDown) {
    event.preventDefault();
    void shutdown().finally(() => app.quit());
  }
});

async function startServices(): Promise<void> {
  const dataDir = path.join(app.getPath("userData"), "data");
  const tools = resolveTools();
  const workerConfig: WorkerConfig = {
    cleanupAgeHours: 24,
    dataDir,
    downloaderPath: tools.downloader,
    ffmpegPath: tools.ffmpeg,
    ffprobePath: tools.ffprobe,
    maxDurationSeconds: 600,
    maxFileSizeBytes: 500 * 1024 * 1024,
    redisUrl: "redis://desktop-local-queue",
    workerConcurrency: 1,
  };
  const apiConfig: ApiConfig = {
    cleanupAgeHours: workerConfig.cleanupAgeHours,
    dataDir,
    host: "127.0.0.1",
    maxDurationSeconds: workerConfig.maxDurationSeconds,
    maxFileSizeBytes: workerConfig.maxFileSizeBytes,
    port: API_PORT,
    redisUrl: workerConfig.redisUrl,
  };
  const runner = new SpawnCommandRunner();
  const processor = createVideoProcessor({
    config: workerConfig,
    importer: new YtDlpImporter(
      runner,
      tools.downloader,
      workerConfig.maxFileSizeBytes,
    ),
    media: new FfmpegMediaProcessor(runner, tools.ffmpeg, tools.ffprobe),
  });

  await cleanupExpiredFiles(dataDir, workerConfig.cleanupAgeHours);
  queue = new LocalVideoQueue(processor);
  apiServer = await buildApp({
    allowedOrigins: [WEB_ORIGIN],
    config: apiConfig,
    healthDependency: "localQueue",
    queue,
  });
  await apiServer.listen({ host: apiConfig.host, port: apiConfig.port });

  const webDirectory = path.join(projectRoot, "apps", "web");
  const nextApp = createNextApp({
    dev: false,
    dir: webDirectory,
    hostname: "127.0.0.1",
    port: WEB_PORT,
  });
  await nextApp.prepare();
  const handler = nextApp.getRequestHandler();
  webServer = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    webServer?.once("error", reject);
    webServer?.listen(WEB_PORT, "127.0.0.1", resolve);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    backgroundColor: "#f3f0e8",
    height: 860,
    minHeight: 680,
    minWidth: 960,
    show: false,
    title: "ClipForge Local",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 1280,
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadURL(WEB_ORIGIN);
}

function resolveTools(): {
  downloader: string;
  ffmpeg: string;
  ffprobe: string;
} {
  const toolDirectory =
    process.env.CLIPFORGE_TOOL_DIR ??
    (app.isPackaged ? path.join(process.resourcesPath, "tools") : undefined);

  if (!toolDirectory) {
    return {
      downloader: process.env.DOWNLOADER_PATH ?? "yt-dlp",
      ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
      ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    };
  }

  const extension = process.platform === "win32" ? ".exe" : "";
  return {
    downloader: path.join(toolDirectory, `yt-dlp${extension}`),
    ffmpeg: path.join(toolDirectory, `ffmpeg${extension}`),
    ffprobe: path.join(toolDirectory, `ffprobe${extension}`),
  };
}

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  await Promise.allSettled([
    apiServer?.close(),
    queue?.close(),
    new Promise<void>((resolve) => {
      if (!webServer) {
        resolve();
        return;
      }
      webServer.close(() => resolve());
    }),
  ]);
}
