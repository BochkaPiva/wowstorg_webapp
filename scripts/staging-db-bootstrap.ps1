# Loads .env.staging and runs prisma migrate deploy + db seed (preview Supabase).
# Requires: Node.js on PATH, npm install in repo root.
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$stagingEnv = Join-Path $repoRoot ".env.staging"
if (-not (Test-Path $stagingEnv)) {
    Write-Error "Missing .env.staging in repo root."
    exit 1
}

Get-Content $stagingEnv -Encoding UTF8 | ForEach-Object {
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
    Write-Error ".env.staging must define DATABASE_URL and DIRECT_URL."
    exit 1
}

Write-Host "prisma migrate deploy..."
npm run db:deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "prisma db seed..."
npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done: migrations and seed applied to preview DB."
