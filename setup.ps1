#Requires -Version 5.1
# 3DMRP one-click setup for Windows
# https://github.com/MKloberg/3dmrp

$REPO        = 'MKloberg/3dmrp'
$DOCKER_URL  = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
$DEFAULT_DIR = "$env:USERPROFILE\3dmrp"

# ── UI helpers ─────────────────────────────────────────────────────────────
function Write-Banner {
    Clear-Host
    Write-Host ''
    Write-Host '    ____  ____  __  __ ____  ____  ' -ForegroundColor Cyan
    Write-Host '   |___ \|  _ \|  \/  |  _ \|  _ \ ' -ForegroundColor Cyan
    Write-Host '     __) | | | | |\/| | |_) | |_) |' -ForegroundColor Cyan
    Write-Host '    / __/| |_| | |  | |  _ <|  __/ ' -ForegroundColor Cyan
    Write-Host '   |_____|____/|_|  |_|_| \_\_|    ' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '   Setup' -ForegroundColor White
    Write-Host ''
}

function Write-OK   ([string]$msg) { Write-Host "  [OK] $msg" -ForegroundColor Green  }
function Write-Fail ([string]$msg) { Write-Host "  [!!] $msg" -ForegroundColor Red    }
function Write-Warn ([string]$msg) { Write-Host "  [--] $msg" -ForegroundColor Yellow }
function Write-Step ([string]$msg) { Write-Host "   ->  $msg" -ForegroundColor Gray   }
function Write-Info ([string]$msg) { Write-Host "       $msg" -ForegroundColor DarkGray }
function Write-Head ([string]$msg) { Write-Host "  $msg"      -ForegroundColor White  }

# ── Checks ─────────────────────────────────────────────────────────────────
function Test-DockerInstalled {
    (Test-Path 'C:\Program Files\Docker\Docker\Docker Desktop.exe') -or
    ($null -ne (Get-ItemProperty 'HKLM:\SOFTWARE\Docker Inc.\Docker Desktop' -ErrorAction SilentlyContinue))
}

function Test-DockerRunning {
    try { $null = docker info 2>&1; return ($LASTEXITCODE -eq 0) }
    catch { return $false }
}

function Test-Uv {
    $null -ne (Get-Command uv -ErrorAction SilentlyContinue)
}

function Update-Path {
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') +
                ';' +
                [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    # Also add the default uv install location in case the env var update hasn't propagated
    $uvBin = "$env:USERPROFILE\.local\bin"
    if ((Test-Path $uvBin) -and ($env:PATH -notlike "*$uvBin*")) {
        $env:PATH = "$uvBin;$env:PATH"
    }
}

# ── Main ────────────────────────────────────────────────────────────────────

Write-Banner
Write-Head 'Checking prerequisites...'
Write-Host ''

# ── 1. Docker ──────────────────────────────────────────────────────────────
if (-not (Test-DockerInstalled)) {
    Write-Fail 'Docker Desktop — not installed'
    Write-Host ''
    Write-Head 'Downloading Docker Desktop installer (~600 MB)...'
    Write-Info 'This may take a few minutes on a slow connection.'
    Write-Host ''

    $installer = "$env:TEMP\DockerDesktopInstaller.exe"
    Write-Step 'Downloading...'
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest $DOCKER_URL -OutFile $installer -UseBasicParsing
    } catch {
        Write-Fail "Download failed: $_"
        Write-Info 'Download Docker Desktop manually from https://www.docker.com/products/docker-desktop/'
        Read-Host '  Press Enter to exit'
        exit 1
    }
    $ProgressPreference = 'Continue'
    Write-OK 'Downloaded'
    Write-Host ''

    # Copy this script to the Desktop so the user can re-run it after restarting
    $selfPath = if ($PSCommandPath) { $PSCommandPath } else {
        # Running via irm ... | iex — download a copy of the script
        $tmp = "$env:TEMP\3dmrp-setup.ps1"
        Write-Step 'Saving setup script for re-use...'
        Invoke-WebRequest "https://raw.githubusercontent.com/$REPO/main/setup.ps1" -OutFile $tmp -UseBasicParsing
        $tmp
    }
    Copy-Item $selfPath "$env:USERPROFILE\Desktop\3dmrp-setup.ps1" -Force

    Write-Step 'Launching Docker installer...'
    Write-Host ''
    Write-Host '  ┌─────────────────────────────────────────────────────────┐' -ForegroundColor Yellow
    Write-Host '  │  Complete the Docker installer wizard.                  │' -ForegroundColor Yellow
    Write-Host '  │  If asked to restart your PC — do it.                   │' -ForegroundColor Yellow
    Write-Host '  │                                                         │' -ForegroundColor Yellow
    Write-Host '  │  After restarting, find "3dmrp-setup.ps1" on your       │' -ForegroundColor Yellow
    Write-Host '  │  Desktop, right-click it, and choose                    │' -ForegroundColor Yellow
    Write-Host '  │  "Run with PowerShell" to continue setup.               │' -ForegroundColor Yellow
    Write-Host '  └─────────────────────────────────────────────────────────┘' -ForegroundColor Yellow
    Write-Host ''

    Start-Process $installer -Wait

    Write-Host ''
    Write-Host '  Restart your PC if prompted, then re-run setup from your Desktop.' -ForegroundColor Cyan
    Read-Host '  Press Enter to exit'
    exit 0
}

# Docker is installed — make sure it's running
if (-not (Test-DockerRunning)) {
    Write-Warn 'Docker Desktop — installed but not running'
    Write-Host ''
    Write-Head 'Please start Docker Desktop from the Start menu.'
    Write-Info 'Wait until the whale icon in the taskbar stops animating, then press Enter.'
    Write-Host ''
    Read-Host '  Press Enter when Docker is ready'
    Write-Host ''
    if (-not (Test-DockerRunning)) {
        Write-Fail 'Docker is still not responding.'
        Write-Info 'Start Docker Desktop, wait for it to fully load, then run setup again.'
        Read-Host '  Press Enter to exit'
        exit 1
    }
}

Write-OK 'Docker Desktop — running'

# ── 2. uv ──────────────────────────────────────────────────────────────────
if (Test-Uv) {
    Write-OK 'uv — found'
} else {
    Write-Step 'Installing uv (Python environment manager)...'
    try {
        $ProgressPreference = 'SilentlyContinue'
        & powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex" 2>&1 | Out-Null
        $ProgressPreference = 'Continue'
        Update-Path
    } catch {
        $ProgressPreference = 'Continue'
    }

    if (Test-Uv) {
        Write-OK 'uv — installed'
    } else {
        Write-Fail 'uv installation failed.'
        Write-Info 'Install manually from https://github.com/astral-sh/uv then run setup again.'
        Read-Host '  Press Enter to exit'
        exit 1
    }
}

Write-Host ''

# ── 3. Install path ────────────────────────────────────────────────────────
Write-Head 'Where would you like to install 3DMRP?'
Write-Host "  Default: $DEFAULT_DIR" -ForegroundColor DarkGray
Write-Host '  Press Enter to accept, or type a different path:' -ForegroundColor DarkGray
$pathInput  = (Read-Host '  Path').Trim()
$installDir = if ($pathInput -ne '') { $pathInput } else { $DEFAULT_DIR }

Write-Host ''

# ── 4. Update vs fresh install ────────────────────────────────────────────
$updating = $false
$dataBak  = "$env:TEMP\3dmrp_data_bak"
$envBak   = "$env:TEMP\3dmrp_env_bak"

if (Test-Path (Join-Path $installDir 'start.bat')) {
    Write-Warn "3DMRP is already installed at $installDir"
    $ans = (Read-Host '  Update to the latest version? [Y/n]').Trim()
    if ($ans -match '^[Nn]') {
        Write-Host ''
        Write-Info "Nothing changed. Double-click start.bat in $installDir to launch."
        Read-Host '  Press Enter to exit'
        exit 0
    }
    $updating = $true

    # Preserve database and uploads
    $dataSrc = Join-Path $installDir 'backend\data'
    if (Test-Path $dataSrc) {
        Write-Step 'Backing up your data...'
        if (Test-Path $dataBak) { Remove-Item $dataBak -Recurse -Force }
        Copy-Item $dataSrc $dataBak -Recurse
        Write-OK 'Data backed up'
    }

    # Preserve .env if customised
    $envSrc = Join-Path $installDir '.env'
    if (Test-Path $envSrc) {
        Copy-Item $envSrc $envBak -Force
    }

    Write-Host ''
}

# ── 5. Download latest release ────────────────────────────────────────────
Write-Head 'Downloading 3DMRP...'
try {
    $release = Invoke-RestMethod "https://api.github.com/repos/$REPO/releases/latest"
    $version = $release.tag_name
    $zipUrl  = "https://github.com/$REPO/archive/refs/tags/$version.zip"
    Write-Step "Latest version: $version"

    $zipFile = "$env:TEMP\3dmrp-$version.zip"
    Write-Step 'Downloading...'
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest $zipUrl -OutFile $zipFile -UseBasicParsing
    $ProgressPreference = 'Continue'
    Write-OK "Downloaded $version"
} catch {
    Write-Fail "Download failed: $_"
    Read-Host '  Press Enter to exit'
    exit 1
}

# ── 6. Extract ────────────────────────────────────────────────────────────
Write-Step 'Installing...'
$extractTemp = "$env:TEMP\3dmrp_extract"
if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force }

try {
    Expand-Archive -Path $zipFile -DestinationPath $extractTemp -Force
} catch {
    Write-Fail "Extraction failed: $_"
    Read-Host '  Press Enter to exit'
    exit 1
}

# GitHub source ZIPs extract to a subfolder named "3dmrp-X.Y.Z" (no 'v')
$extracted = (Get-ChildItem $extractTemp | Select-Object -First 1).FullName

if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }
Move-Item $extracted $installDir
Write-OK "Installed to $installDir"

# Restore data
if ($updating -and (Test-Path $dataBak)) {
    Write-Step 'Restoring your data...'
    $dataDest = Join-Path $installDir 'backend\data'
    if (Test-Path $dataDest) { Remove-Item $dataDest -Recurse -Force }
    Move-Item $dataBak $dataDest
    Write-OK 'Data restored'
}

# Restore .env
if (Test-Path $envBak) {
    Copy-Item $envBak (Join-Path $installDir '.env') -Force
    Remove-Item $envBak -Force
}

# Cleanup temp files
Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
Remove-Item $extractTemp -Recurse -Force -ErrorAction SilentlyContinue

# ── 7. Desktop shortcut ────────────────────────────────────────────────────
Write-Step 'Creating desktop shortcut...'
try {
    $wsh        = New-Object -ComObject WScript.Shell
    $shortcut   = $wsh.CreateShortcut("$env:USERPROFILE\Desktop\3DMRP.lnk")
    $shortcut.TargetPath       = "$installDir\start.bat"
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description      = '3DMRP — 3D Print Management & Resource Planning'
    $shortcut.Save()
    Write-OK 'Desktop shortcut created'
} catch {
    Write-Warn "Could not create shortcut: $_"
    Write-Info "You can still launch 3DMRP by double-clicking start.bat in $installDir"
}

# ── Done ───────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor DarkGray
Write-Host "  All done!  3DMRP $version is ready." -ForegroundColor Green
Write-Host ''
Write-Host "  Installed to: $installDir" -ForegroundColor Gray
Write-Host ''
Write-Host '  To start 3DMRP:' -ForegroundColor White
Write-Host '    Double-click the 3DMRP shortcut on your Desktop' -ForegroundColor Gray
Write-Host ''
Write-Host '  Then open your browser to:' -ForegroundColor White
Write-Host '    http://localhost:7891' -ForegroundColor Cyan
Write-Host '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor DarkGray
Write-Host ''

$launch = (Read-Host '  Launch 3DMRP now? [Y/n]').Trim()
if ($launch -notmatch '^[Nn]') {
    Start-Process "$installDir\start.bat" -WorkingDirectory $installDir
}

Write-Host ''
