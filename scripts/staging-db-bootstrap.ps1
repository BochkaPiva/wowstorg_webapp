# Применяет миграции и сид к БД из .env.staging (preview Supabase).
# Требуется: Node.js в PATH, в корне репозитория выполнен npm install.
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$stagingEnv = Join-Path $repoRoot ".env.staging"
if (-not (Test-Path $stagingEnv)) {
    Write-Error "Нет файла .env.staging в корне проекта."
    exit 1
}

Get-Content $stagingEnv | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $val, "Process")
}

if (-not $env:DATABASE_URL -or -not $env:DIRECT_URL) {
    Write-Error "В .env.staging должны быть DATABASE_URL и DIRECT_URL."
    exit 1
}

Write-Host "prisma migrate deploy..."
npm run db:deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "prisma db seed..."
npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Готово: схема и сид применены к preview-БД."
