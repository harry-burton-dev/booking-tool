# pack-msapp.ps1 - packs a pac-canvas-unpacked Canvas App repo into a .msapp.
#
# A .msapp is a flat zip whose entry names use BACKSLASH separators
# (verified against a real reference .msapp on 2026-07-24). Standard zip
# tools write forward slashes and produce a broken .msapp, so entries are
# created with System.IO.Compression and explicit entry-name strings.
#
# PowerShell 5.1 compatible. Exit code 1 on any error.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [Parameter(Mandatory = $true)]
    [string]$OutFile,

    [string[]]$Members = @(
        'Controls', 'Components', 'References', 'Resources', 'Src',
        'Header.json', 'Properties.json', 'ComponentsMetadata.json',
        'AppCheckerResult.sarif'
    ),

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Get-NormalizedFullPath {
    param([string]$Path)

    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        $Path = Join-Path (Get-Location).Path $Path
    }
    return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Fail {
    param([string]$Message)

    Write-Error $Message
    exit 1
}

# ---- Validate inputs -------------------------------------------------------
if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    Fail "RepoRoot not found or not a directory: $RepoRoot"
}
$repoFull = Get-NormalizedFullPath (Resolve-Path -LiteralPath $RepoRoot).Path
$outFull = Get-NormalizedFullPath $OutFile

if (($outFull + '\').StartsWith($repoFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "OutFile must not be inside RepoRoot. OutFile: $outFull RepoRoot: $repoFull"
}
if (-not (Test-Path -LiteralPath (Join-Path $repoFull 'Src'))) {
    Fail "Required member 'Src' is missing from RepoRoot: $repoFull"
}
if (Test-Path -LiteralPath $outFull) {
    if (-not $Force) {
        Fail "OutFile already exists (use -Force to overwrite): $outFull"
    }
    Remove-Item -LiteralPath $outFull -Force
}
$outDir = Split-Path -Parent $outFull
if (($outDir -ne '') -and (-not (Test-Path -LiteralPath $outDir))) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

# ---- Collect files to pack -------------------------------------------------
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$filesToPack = New-Object System.Collections.Generic.List[string]
foreach ($member in $Members) {
    $memberPath = Join-Path $repoFull $member
    if (Test-Path -LiteralPath $memberPath -PathType Container) {
        $memberFiles = Get-ChildItem -LiteralPath $memberPath -Recurse -File
        foreach ($memberFile in $memberFiles) {
            $filesToPack.Add($memberFile.FullName)
        }
    } elseif (Test-Path -LiteralPath $memberPath -PathType Leaf) {
        $filesToPack.Add((Get-Item -LiteralPath $memberPath).FullName)
    } else {
        Write-Warning "Member not present, skipping: $member"
    }
}
if ($filesToPack.Count -eq 0) {
    Fail "No files found to pack under RepoRoot: $repoFull"
}

# ---- Write the zip with backslash entry names -------------------------------
$totalBytes = [long]0
$entryCount = 0
$zipStream = $null
$archive = $null
try {
    $zipStream = New-Object System.IO.FileStream(
        $outFull, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $archive = New-Object System.IO.Compression.ZipArchive(
        $zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

    foreach ($filePath in $filesToPack) {
        # RepoRoot-relative path with backslash separators, e.g. Src\App.pa.yaml
        $entryName = $filePath.Substring($repoFull.Length + 1)
        $entry = $archive.CreateEntry($entryName)
        $entryStream = $entry.Open()
        $fileStream = [System.IO.File]::OpenRead($filePath)
        try {
            $fileStream.CopyTo($entryStream)
        } finally {
            $fileStream.Dispose()
            $entryStream.Dispose()
        }
        $totalBytes += (Get-Item -LiteralPath $filePath).Length
        $entryCount++
    }
} catch {
    if ($null -ne $archive) { $archive.Dispose(); $archive = $null }
    if ($null -ne $zipStream) { $zipStream.Dispose(); $zipStream = $null }
    if (Test-Path -LiteralPath $outFull) {
        Remove-Item -LiteralPath $outFull -Force -ErrorAction SilentlyContinue
    }
    Fail "Failed to write ${outFull}: $($_.Exception.Message)"
} finally {
    if ($null -ne $archive) { $archive.Dispose() }
    if ($null -ne $zipStream) { $zipStream.Dispose() }
}

Write-Host "Packed $entryCount entries ($totalBytes bytes) -> $outFull"
exit 0
