# run-tests.ps1 - self-contained tests for pack-msapp.ps1 (no framework).
# Builds a dummy canvas-app tree in $env:TEMP, packs it, and asserts on the
# resulting .msapp zip. Prints PASS/FAIL per assertion; exits 1 on any FAIL.

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$testDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packScript = Join-Path (Split-Path -Parent $testDir) 'pack-msapp.ps1'

$script:failCount = 0

function Assert {
    param([string]$Name, [bool]$Condition, [string]$Detail = '')

    if ($Condition) {
        Write-Host "PASS: $Name"
    } else {
        if ($Detail -ne '') {
            Write-Host "FAIL: $Name ($Detail)"
        } else {
            Write-Host "FAIL: $Name"
        }
        $script:failCount++
    }
}

function New-DummyRepo {
    param([string]$Root, [bool]$IncludeSrc = $true)

    New-Item -ItemType Directory -Force -Path $Root | Out-Null
    if ($IncludeSrc) {
        New-Item -ItemType Directory -Force -Path (Join-Path $Root 'Src\Screens') | Out-Null
        Set-Content -Path (Join-Path $Root 'Src\App.pa.yaml') -Value "App:`n  Properties:`n    Theme: =PowerAppsTheme" -Encoding utf8
        Set-Content -Path (Join-Path $Root 'Src\Screens\Home.pa.yaml') -Value "Screens:`n  Home:`n    Properties: {}" -Encoding utf8
    }
    Set-Content -Path (Join-Path $Root 'Header.json') -Value '{"DocVersion":"1.343"}' -Encoding utf8
    Set-Content -Path (Join-Path $Root 'Properties.json') -Value '{"Name":"TestApp"}' -Encoding utf8
    # Extraneous items that must NOT be packed.
    Set-Content -Path (Join-Path $Root 'README.md') -Value '# not packed' -Encoding utf8
    New-Item -ItemType Directory -Force -Path (Join-Path $Root 'docs') | Out-Null
    Set-Content -Path (Join-Path $Root 'docs\x.md') -Value 'not packed either' -Encoding utf8
}

function Invoke-Packer {
    param([string[]]$Arguments)

    $allArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $packScript) + $Arguments
    # In PS 5.1 with ErrorActionPreference=Stop, stderr from a native command
    # redirected via 2>&1 becomes a terminating NativeCommandError; relax the
    # preference around the child invocation only.
    $savedPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & powershell.exe @allArgs 2>&1 | ForEach-Object { "$_" }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedPreference
    }
    return @{ ExitCode = $exitCode; Output = ($output -join "`n") }
}

$workRoot = Join-Path $env:TEMP ("pack-msapp-tests-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

try {
    Assert 'pack-msapp.ps1 exists' (Test-Path $packScript) $packScript
    if (-not (Test-Path $packScript)) {
        Write-Host 'ABORT: cannot run remaining tests without pack-msapp.ps1'
        exit 1
    }

    # ---- Happy path -------------------------------------------------------
    $repoRoot = Join-Path $workRoot 'repo'
    New-DummyRepo -Root $repoRoot
    $outFile = Join-Path $workRoot 'out\app.msapp'
    New-Item -ItemType Directory -Force -Path (Join-Path $workRoot 'out') | Out-Null

    $result = Invoke-Packer @('-RepoRoot', $repoRoot, '-OutFile', $outFile)
    Assert 'packer exits 0 on happy path' ($result.ExitCode -eq 0) $result.Output
    Assert 'output .msapp file created' (Test-Path $outFile)

    if (Test-Path $outFile) {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($outFile)
        try {
            $names = @($zip.Entries | ForEach-Object { $_.FullName })

            # (a) Separator checks: no entry may contain '/'; every entry
            # with a directory component must use '\'. (Root-level entries
            # like Header.json legitimately contain no separator at all.)
            $withSlash = @($names | Where-Object { $_.Contains('/') })
            Assert 'no entry name contains forward slash' ($withSlash.Count -eq 0) ($withSlash -join ', ')

            $nested = @($names | Where-Object { $_ -ne [System.IO.Path]::GetFileName($_) })
            $nestedWithBackslash = @($nested | Where-Object { $_.Contains('\') })
            Assert 'all nested entry names use backslash' ($nested.Count -gt 0 -and $nestedWithBackslash.Count -eq $nested.Count) ($names -join ', ')

            # (b) Exact entry set: packable members only, extraneous files excluded.
            $expected = @('Header.json', 'Properties.json', 'Src\App.pa.yaml', 'Src\Screens\Home.pa.yaml')
            $sortedActual = ($names | Sort-Object) -join '|'
            $sortedExpected = ($expected | Sort-Object) -join '|'
            Assert 'entry set is exactly the expected packable files' ($sortedActual -eq $sortedExpected) "expected [$sortedExpected] got [$sortedActual]"

            # (c) Round-trip: extracted bytes match the source file byte-for-byte.
            $entry = $zip.GetEntry('Src\App.pa.yaml')
            Assert 'Src\App.pa.yaml entry retrievable by exact name' ($null -ne $entry)
            if ($null -ne $entry) {
                $memStream = New-Object System.IO.MemoryStream
                $entryStream = $entry.Open()
                try {
                    $entryStream.CopyTo($memStream)
                } finally {
                    $entryStream.Dispose()
                }
                $zipBytes = $memStream.ToArray()
                $memStream.Dispose()
                $srcBytes = [System.IO.File]::ReadAllBytes((Join-Path $repoRoot 'Src\App.pa.yaml'))
                $isSame = [System.Linq.Enumerable]::SequenceEqual([byte[]]$zipBytes, [byte[]]$srcBytes)
                Assert 'round-trip bytes match source file' $isSame "zip=$($zipBytes.Length)B src=$($srcBytes.Length)B"
            }
        } finally {
            $zip.Dispose()
        }
    } else {
        Assert 'zip content assertions (skipped: no output file)' $false
    }

    # ---- Overwrite guard ---------------------------------------------------
    $resultNoForce = Invoke-Packer @('-RepoRoot', $repoRoot, '-OutFile', $outFile)
    Assert 'existing OutFile without -Force errors' ($resultNoForce.ExitCode -ne 0) $resultNoForce.Output

    $resultForce = Invoke-Packer @('-RepoRoot', $repoRoot, '-OutFile', $outFile, '-Force')
    Assert 'existing OutFile with -Force succeeds' ($resultForce.ExitCode -eq 0) $resultForce.Output

    # (d) OutFile inside RepoRoot must error.
    $insideOut = Join-Path $repoRoot 'app.msapp'
    $resultInside = Invoke-Packer @('-RepoRoot', $repoRoot, '-OutFile', $insideOut)
    Assert 'OutFile inside RepoRoot errors' ($resultInside.ExitCode -ne 0) $resultInside.Output
    Assert 'OutFile inside RepoRoot creates no file' (-not (Test-Path $insideOut))

    # (e) Missing Src must error with exit 1.
    $repoNoSrc = Join-Path $workRoot 'repo-nosrc'
    New-DummyRepo -Root $repoNoSrc -IncludeSrc $false
    $outNoSrc = Join-Path $workRoot 'out\nosrc.msapp'
    $resultNoSrc = Invoke-Packer @('-RepoRoot', $repoNoSrc, '-OutFile', $outNoSrc)
    Assert 'missing Src exits 1' ($resultNoSrc.ExitCode -eq 1) "exit=$($resultNoSrc.ExitCode) $($resultNoSrc.Output)"
    Assert 'missing Src creates no file' (-not (Test-Path $outNoSrc))
} finally {
    try {
        Remove-Item -Recurse -Force -Path $workRoot -ErrorAction Stop
    } catch {
        Write-Host "WARN: could not clean up $workRoot"
    }
}

if ($script:failCount -gt 0) {
    Write-Host "RESULT: $script:failCount assertion(s) FAILED"
    exit 1
}
Write-Host 'RESULT: all assertions PASSED'
exit 0
