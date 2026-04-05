# Loads .env.staging and runs prisma migrate deploy + db seed (preview Supabase).
# Requires: Node.js installed, npm install in repo root.
$ErrorActionPreference = "Stop"

function Initialize-NodeJsPath {
    # Non-interactive `powershell -File` often has an empty/minimal PATH.
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $merged = @($machine, $user) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd(";") }
    $env:Path = ($merged -join ";")

    $extra = @(
        (Join-Path $env:ProgramFiles "nodejs")
        (Join-Path ${env:ProgramFiles(x86)} "nodejs")
        (Join-Path $env:USERPROFILE ".volta\bin")
    )
    foreach ($dir in $extra) {
        if ($dir -and (Test-Path (Join-Path $dir "npm.cmd"))) {
            $env:Path = "$dir;$env:Path"
            return
        }
    }
}

Initialize-NodeJsPath

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Install Node.js (https://nodejs.org LTS) and reopen the terminal. Or run from a terminal where 'npm -v' works: npm run db:deploy then npm run db:seed (with DATABASE_URL and DIRECT_URL set from .env.staging)."
    exit 1
}

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
