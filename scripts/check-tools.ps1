$ErrorActionPreference = "Stop"

$requiredTools = @(
  @{ Name = "Node.js"; Command = "node"; VersionArgs = @("--version") },
  @{ Name = "npm"; Command = "npm"; VersionArgs = @("--version") },
  @{ Name = "Docker"; Command = "docker"; VersionArgs = @("--version") },
  @{ Name = "FFmpeg"; Command = "ffmpeg"; VersionArgs = @("-version") },
  @{ Name = "FFprobe"; Command = "ffprobe"; VersionArgs = @("-version") },
  @{ Name = "yt-dlp"; Command = "yt-dlp"; VersionArgs = @("--version") }
)

$missing = @()

Write-Host ""
Write-Host "ClipForge local tool check" -ForegroundColor Cyan
Write-Host "--------------------------"

foreach ($tool in $requiredTools) {
  $resolved = Get-Command $tool.Command -ErrorAction SilentlyContinue
  if (-not $resolved) {
    Write-Host ("[missing] " + $tool.Name) -ForegroundColor Red
    $missing += $tool.Name
    continue
  }

  $version = (& $tool.Command @($tool.VersionArgs) 2>&1 | Select-Object -First 1)
  Write-Host ("[ok]      " + $tool.Name + " - " + $version) -ForegroundColor Green
}

Write-Host ""
if ($missing.Count -gt 0) {
  Write-Host ("Install the missing tools and make sure they are available in PATH: " + ($missing -join ", ")) -ForegroundColor Yellow
  exit 1
}

Write-Host "Everything needed for a real conversion job is available." -ForegroundColor Green
