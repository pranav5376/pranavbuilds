$ErrorActionPreference = "Stop"
$targetFile = "public\index.html"
$newEndpointFragment = "AKfycbyqA_H2kNXbRLnachHeAb6nuw_h0NRSjNkMy-0ey9x0u0tFj5ff09-TobGh-mecT-wZ"

Write-Host "== Checking repo folder ==" -ForegroundColor Cyan
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: No .git folder here. cd into D:\Protofolio\pranavbuilds first." -ForegroundColor Red
    exit 1
}

Write-Host "== Checking $targetFile exists ==" -ForegroundColor Cyan
if (-not (Test-Path $targetFile)) {
    Write-Host "ERROR: $targetFile not found." -ForegroundColor Red
    exit 1
}

Write-Host "== Verifying the new endpoint is actually in the file ==" -ForegroundColor Cyan
$content = Get-Content -Path $targetFile -Raw -Encoding UTF8
if ($content -notmatch [regex]::Escape($newEndpointFragment)) {
    Write-Host "ERROR: $targetFile does NOT contain the new endpoint yet." -ForegroundColor Red
    Write-Host "You still need to overwrite $targetFile with the corrected file before running this script." -ForegroundColor Yellow
    exit 1
}
Write-Host "OK: new endpoint found in $targetFile." -ForegroundColor Green

Write-Host "== git status ==" -ForegroundColor Cyan
git status

Write-Host "== Staging $targetFile ==" -ForegroundColor Cyan
git add $targetFile

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing staged  the working copy already matches the last commit." -ForegroundColor Yellow
    git log -1 --stat
    exit 0
}

Write-Host "== Committing ==" -ForegroundColor Cyan
git commit -m "Fix contact form endpoint and restore certificate emoji"

Write-Host "== Pushing to origin ==" -ForegroundColor Cyan
git push

Write-Host "== Done. Check GitHub and Vercel Deployments tab. ==" -ForegroundColor Green
