import { createWriteStream } from "node:fs";
import { chmod, copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const platform = process.platform;
const target = platform === "win32" ? "win32" : "linux";
const outputDirectory = path.join(root, "release-tools", target);
const temporaryDirectory = path.join(root, "release-tools", ".downloads");

await rm(outputDirectory, { force: true, recursive: true });
await rm(temporaryDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(temporaryDirectory, { recursive: true });

if (platform === "win32") {
  await prepareWindowsTools();
} else if (platform === "linux") {
  await prepareLinuxTools();
} else {
  throw new Error(`Release tools are not configured for ${platform}.`);
}

console.log(`Release tools prepared in ${outputDirectory}`);

async function prepareWindowsTools() {
  const ytDlp = path.join(outputDirectory, "yt-dlp.exe");
  const ffmpegArchive = path.join(temporaryDirectory, "ffmpeg.zip");
  const ffmpegExtracted = path.join(temporaryDirectory, "ffmpeg");

  await download(
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
    ytDlp,
  );
  await download(
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
    ffmpegArchive,
  );
  await run("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${escapePowerShell(ffmpegArchive)}' -DestinationPath '${escapePowerShell(ffmpegExtracted)}' -Force`,
  ]);

  const binDirectory = await findDirectory(ffmpegExtracted, "bin");
  await copyFile(
    path.join(binDirectory, "ffmpeg.exe"),
    path.join(outputDirectory, "ffmpeg.exe"),
  );
  await copyFile(
    path.join(binDirectory, "ffprobe.exe"),
    path.join(outputDirectory, "ffprobe.exe"),
  );
}

async function prepareLinuxTools() {
  const ytDlp = path.join(outputDirectory, "yt-dlp");
  const ffmpegArchive = path.join(temporaryDirectory, "ffmpeg.tar.xz");
  const ffmpegExtracted = path.join(temporaryDirectory, "ffmpeg");

  await download(
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
    ytDlp,
  );
  await chmod(ytDlp, 0o755);
  await download(
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
    ffmpegArchive,
  );
  await mkdir(ffmpegExtracted, { recursive: true });
  await run("tar", ["-xJf", ffmpegArchive, "-C", ffmpegExtracted]);

  const binDirectory = await findDirectoryContaining(ffmpegExtracted, "ffmpeg");
  for (const name of ["ffmpeg", "ffprobe"]) {
    const destination = path.join(outputDirectory, name);
    await copyFile(path.join(binDirectory, name), destination);
    await chmod(destination, 0o755);
  }
}

async function download(url, destination) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

async function findDirectory(directory, name) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.name === name) {
      return fullPath;
    }
    const nested = await findDirectory(fullPath, name).catch(() => undefined);
    if (nested) {
      return nested;
    }
  }
  throw new Error(`Could not find directory ${name} under ${directory}.`);
}

async function findDirectoryContaining(directory, fileName) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === fileName)) {
    return directory;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = await findDirectoryContaining(
      path.join(directory, entry.name),
      fileName,
    ).catch(() => undefined);
    if (nested) {
      return nested;
    }
  }
  throw new Error(`Could not find ${fileName} under ${directory}.`);
}

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${executable} exited with code ${code}.`));
      }
    });
  });
}

function escapePowerShell(value) {
  return value.replaceAll("'", "''");
}
