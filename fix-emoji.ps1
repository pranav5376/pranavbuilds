$ErrorActionPreference = "Stop"
$targetFile = "public\index.html"

if (-not (Test-Path $targetFile)) {
    Write-Host "ERROR: $targetFile not found. Run this from D:\Protofolio\pranavbuilds" -ForegroundColor Red
    exit 1
}

$content = Get-Content -Path $targetFile -Raw -Encoding UTF8

$fixes = @(
    @{ Name = "NCC 'C' Certificate";          Emoji = "🎖️" },
    @{ Name = "Bharat Certificate";            Emoji = "📜" },
    @{ Name = "Cybersecurity Certificate";     Emoji = "🛡️" },
    @{ Name = "ISRO AI Certificate";           Emoji = "🛰️" },
    @{ Name = "Java Certificate";              Emoji = "☕" },
    @{ Name = "Python Certificate";            Emoji = "🐍" },
    @{ Name = "District-Level Table Tennis";   Emoji = "🏓" },
    @{ Name = "Taluk-Level Throwball";         Emoji = "🏐" }
)

$fixedCount = 0
foreach ($fix in $fixes) {
    $pattern = '(award-badge">)[^<]*(</div><h3>' + [regex]::Escape($fix.Name) + '</h3>)'
    $replacement = '${1}' + $fix.Emoji + '${2}'
    $before = $content
    $content = $content -replace $pattern, $replacement
    if ($content -ne $before) {
        $fixedCount++
        Write-Host "Fixed badge for: $($fix.Name)" -ForegroundColor Green
    } else {
        Write-Host "No match found for: $($fix.Name) (already correct, or text differs)" -ForegroundColor Yellow
    }
}

[System.IO.File]::WriteAllText((Resolve-Path $targetFile), $content, [System.Text.UTF8Encoding]::new($true))

Write-Host ""
Write-Host "Done. $fixedCount badge(s) updated." -ForegroundColor Cyan
Select-String -Path $targetFile -Pattern "award-badge\">" -Encoding UTF8
