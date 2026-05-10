Set-Location $PSScriptRoot

if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}

$env:DATABASE_URL = "sqlite:///./data/3dmrp.db"
$env:DATA_DIR     = "$PSScriptRoot\data"

Write-Host "Backend running on http://localhost:8000"
uv run --python 3.12 --with-requirements requirements.txt uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
