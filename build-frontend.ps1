$env:CACHEBUST = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
docker compose build frontend
if ($LASTEXITCODE -eq 0) {
    docker compose up -d frontend
}
