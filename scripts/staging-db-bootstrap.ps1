# Loads .env.staging and runs prisma migrate deploy + db seed (preview Supabase).
# Uses npm when available; otherwise node.exe + prisma CLI (no npm on PATH).
$ErrorActionPreference = "Stop"

function Initialize-NodeJsPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $merged = @($machine, $user) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd(";") }
    $env:Path = ($merged -join ";")

    foreach ($dir in @(
            (Join-Path $env:ProgramFiles "nodejs")
            (Join-Path ${env:ProgramFiles(x86)} "nodejs")
            (Join-Path $env:USERPROFILE ".volta\bin")
            (Join-Path $env:USERPROFILE "scoop\shims")
        )) {
        if ($dir -and (Test-Path (Join-Path $dir "node.exe"))) {
            $env:Path = "$dir;$env:Path"
            return
        }
    }
}

function Find-NodeExe {
    foreach ($hive in @("HKLM:\SOFTWARE\Node.js", "HKCU:\SOFTWARE\Node.js")) {
        try {
            $ip = (Get-ItemProperty -LiteralPath $hive -ErrorAction Stop).InstallPath
            if ($ip) {
                $exe = Join-Path $ip.TrimEnd("\") "node.exe"
                if (Test-Path $exe) { return $exe }
            }
        } catch {}
    }
    if ($env:NVM_SYMLINK) {
        $exe = Join-Path $env:NVM_SYMLINK.TrimEnd("\") "node.exe"
        if (Test-Path $exe) { return $exe }
    }
    foreach ($dir in @(
            (Join-Path $env:ProgramFiles "nodejs\node.exe")
            (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe")
        )) {
        if (Test-Path $dir) { return $dir }
    }
    return $null
}

Initialize-NodeJsPath

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

$nodeExe = $null
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeExe = (Get-Command node).Source
}
if (-not $nodeExe) {
    $nodeExe = Find-NodeExe
}

$prismaCli = Join-Path $repoRoot "node_modules\prisma\build\index.js"
if (-not (Test-Path $prismaCli)) {
    Write-Host "node_modules missing; running npm install in repo root..."
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install
    } elseif ($nodeExe) {
        $npmCmd = Join-Path (Split-Path $nodeExe -Parent) "npm.cmd"
        if (Test-Path $npmCmd) {
            & $npmCmd install
        } else {
            Write-Error "npm not found next to node.exe. Open a new terminal after Node install, cd repo root, run: npm install"
            exit 1
        }
    } else {
        Write-Error "Node.js/npm not found. Install Node LTS, reopen PowerShell, then run this script again."
        exit 1
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm install failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    if (-not (Test-Path $prismaCli)) {
        Write-Error "prisma still missing after npm install. Check package.json and network."
        exit 1
    }
}

function Invoke-Prisma {
    param(
        [ValidateSet("deploy", "seed")]
        [string]$Step
    )
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        if ($Step -eq "deploy") {
            npm run db:deploy
        } else {
            npm run db:seed
        }
        return $LASTEXITCODE
    }
    if (-not $nodeExe) {
        Write-Error "Node.js not found. Install from https://nodejs.org (LTS) or fix PATH, then run npm install in repo root."
        exit 1
    }
    if ($Step -eq "deploy") {
        & $nodeExe $prismaCli migrate deploy
    } else {
        & $nodeExe $prismaCli db seed
    }
    return $LASTEXITCODE
}

Write-Host "prisma migrate deploy..."
$code = Invoke-Prisma -Step deploy
if ($code -ne 0) { exit $code }

Write-Host "prisma db seed..."
$code = Invoke-Prisma -Step seed
if ($code -ne 0) { exit $code }

Write-Host "Done: migrations and seed applied to preview DB."
