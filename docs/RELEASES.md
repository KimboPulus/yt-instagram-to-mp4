# Desktop releases

ClipForge desktop packages are self-contained x64 builds. They include the
Electron runtime, FFmpeg, FFprobe and yt-dlp. They do not need Docker, Redis,
Node.js or npm on the destination computer.

## Windows

Download `ClipForge-Local-<version>-Windows-x64.exe` and run it. It is a
portable application, so there is no installer and no administrator access is
required.

The first launch can take longer because the portable wrapper extracts its
runtime into the user's temporary directory.

## Ubuntu

Use either package:

```bash
sudo apt install ./ClipForge-Local-<version>-Linux-x86_64.deb
```

or:

```bash
chmod +x ClipForge-Local-<version>-Linux-x86_64.AppImage
./ClipForge-Local-<version>-Linux-x86_64.AppImage
```

## openSUSE

Use either package:

```bash
sudo zypper install ./ClipForge-Local-<version>-Linux-x86_64.rpm
```

or run the AppImage as shown above.

## Local files

Desktop jobs are stored under the application's user-data directory:

- Windows: `%APPDATA%\yt-instagram-to-mp4\data`
- Linux: `~/.config/yt-instagram-to-mp4/data`

Use the application's delete action to remove a job and all its associated
source, output, thumbnail, log and temporary files.

## Release process

Pushing a tag such as `v0.1.0` starts the GitHub Actions release workflow. The
Windows runner produces the portable EXE. The Ubuntu runner produces AppImage,
DEB and RPM packages. Tagged workflows attach all successful artifacts to the
GitHub Release.
