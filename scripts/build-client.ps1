param(
    [string]$CreatorPath = '',
    [string]$StageRoot = '',
    [switch]$DebugBuild,
    [switch]$KeepOutputInStage
)

$ErrorActionPreference = 'Stop'
$demoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$clientRoot = Join-Path $demoRoot 'client'
$webRoot = Join-Path $demoRoot 'web'
if (-not $CreatorPath) {
    $creatorCandidates = Get-ChildItem -LiteralPath (Join-Path $demoRoot 'tooling\CocosCreator-3.8.8') -Filter 'CocosCreator.exe' -Recurse -File -ErrorAction SilentlyContinue
    if (-not $creatorCandidates) { throw 'Cocos Creator 3.8.8 not found. Supply -CreatorPath with the editor executable.' }
    $CreatorPath = $creatorCandidates[0].FullName
}
if (-not (Test-Path -LiteralPath $CreatorPath -PathType Leaf)) { throw "Editor not found: $CreatorPath" }
if (-not $StageRoot) { $StageRoot = Join-Path $env:TEMP 'chenghuang-cocos-388' }
$StageRoot = [System.IO.Path]::GetFullPath($StageRoot)
if ($StageRoot -match '[^\x00-\x7f]|\s') { throw 'Cocos staging path must use ASCII characters without spaces. Supply -StageRoot.' }
$stageClient = Join-Path $StageRoot 'client'
$stageOutput = Join-Path $stageClient 'build'
$stageLogs = Join-Path $StageRoot 'logs'
New-Item -ItemType Directory -Path $stageClient,$stageOutput,$stageLogs,$webRoot -Force | Out-Null

# shared/scene.json is the single editable source for gameplay coordinates.
$sharedScenePath = Join-Path $demoRoot 'shared\scene.json'
if (Test-Path -LiteralPath $sharedScenePath) {
    $resourceRoot = Join-Path $clientRoot 'assets\resources'
    New-Item -ItemType Directory -Path $resourceRoot -Force | Out-Null
    Copy-Item -LiteralPath $sharedScenePath -Destination (Join-Path $resourceRoot 'scene.json') -Force
}

# Build an ASCII-path staging copy, retaining the original source in the workspace.
foreach ($sourceName in @('package.json','tsconfig.json','assets','settings','profiles')) {
    $sourcePath = Join-Path $clientRoot $sourceName
    if (Test-Path -LiteralPath $sourcePath) { Copy-Item -LiteralPath $sourcePath -Destination $stageClient -Recurse -Force }
}
if ($CreatorPath -match '[^\x00-\x7f]') {
    $editorAlias = Join-Path $StageRoot 'editor'
    if (-not (Test-Path -LiteralPath $editorAlias)) {
        New-Item -ItemType Junction -Path $editorAlias -Target (Split-Path -Parent $CreatorPath) | Out-Null
    }
    $CreatorPath = Join-Path $editorAlias 'CocosCreator.exe'
}

$buildLogPath = Join-Path $stageLogs 'creator.build.log'
$jobStatusPath = Join-Path $stageLogs 'creator.job.json'
$buildStarted = Get-Date
$debugText = if ($DebugBuild) { 'true' } else { 'false' }
$buildParameters = "platform=web-mobile;debug=$debugText;showFPS=false;md5Cache=false;startScene=d287a97f-c56c-45ad-950c-a12cc05a287e"
[System.IO.File]::WriteAllText($jobStatusPath,'{"status":"starting"}')
Write-Host "Building Cocos client from $stageClient"
# The job hosts Creator's documented build-only command (no main editor UI).
# The main script monitors the job and can end its exact PID tree if a leftover
# renderer keeps stdout open after a successful build. No WMI/CIM access is needed.
$buildJob = Start-Job -ArgumentList $CreatorPath,$stageClient,$buildParameters,$buildLogPath,$jobStatusPath -ScriptBlock {
    param($creatorExecutable,$projectPath,$parameters,$logPath,$statusPath)
    $ErrorActionPreference = 'Continue'
    $env:ELECTRON_ENABLE_LOGGING='1'
    $env:ELECTRON_ENABLE_STACK_DUMPING='1'
    [System.IO.File]::WriteAllText($statusPath,(@{status='building';hostPid=$PID}|ConvertTo-Json -Compress))
    & $creatorExecutable --project $projectPath --build $parameters --no-sandbox --disable-gpu 2>&1 | Out-File -LiteralPath $logPath -Encoding utf8
    $creatorExit = $LASTEXITCODE
    [System.IO.File]::WriteAllText($statusPath,(@{status='exited';hostPid=$PID;exitCode=$creatorExit}|ConvertTo-Json -Compress))
}
$buildExitCode = $null
$finishedByLog = $false
$finishedAt = $null
$jobHostPid = $null
$timedOut = $false
try {
    while ($true) {
        try {
            $jobStatus = Get-Content -LiteralPath $jobStatusPath -Raw | ConvertFrom-Json
            if ($jobStatus.hostPid) { $jobHostPid=[int]$jobStatus.hostPid }
            if ($jobStatus.status -eq 'exited') { $buildExitCode=$jobStatus.exitCode }
        } catch { }
        $tail = Get-Content -LiteralPath $buildLogPath -Tail 35 -ErrorAction SilentlyContinue
        if ($tail -match 'build Task.*Finished') {
            $freshIndex = Get-ChildItem -LiteralPath $stageOutput -Filter 'index.html' -Recurse -File | Where-Object { $_.LastWriteTime -ge $buildStarted.AddSeconds(-2) } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($freshIndex) {
                $finishedByLog=$true
                if ($null -eq $finishedAt) { $finishedAt=Get-Date }
                if (((Get-Date)-$finishedAt).TotalSeconds -ge 3) { break }
            }
        }
        if ($buildJob.State -notin @('Running','NotStarted')) { break }
        if (((Get-Date)-$buildStarted).TotalMinutes -gt 12) { $timedOut=$true;break }
        Start-Sleep -Milliseconds 200
    }
} finally {
    if ($buildJob.State -eq 'Running' -and $jobHostPid) {
        # This PID was reported by our own job before launching Creator.
        & taskkill.exe /PID $jobHostPid /T /F 2>&1 | Out-Null
    }
    if ($buildJob.State -eq 'Running') { $buildJob | Stop-Job }
    $buildJob | Receive-Job -ErrorAction SilentlyContinue | Out-Null
    $buildJob | Remove-Job -Force
}
$tail = Get-Content -LiteralPath $buildLogPath -Tail 80 -ErrorAction SilentlyContinue
$builtIndex = Get-ChildItem -LiteralPath $stageOutput -Filter 'index.html' -Recurse -File | Where-Object { $_.DirectoryName -notmatch '[\\/]assets[\\/]' -and $_.LastWriteTime -ge $buildStarted.AddSeconds(-2) } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($timedOut -or -not $builtIndex -or ($buildExitCode -ne 36 -and -not $finishedByLog)) {
    $tail
    throw "Cocos build failed (exit $buildExitCode, timeout $timedOut). Logs: $stageLogs"
}
$runtimeSettings = Join-Path $builtIndex.DirectoryName 'src\settings.json'
if (Test-Path -LiteralPath $runtimeSettings) {
    $settingsText = Get-Content -LiteralPath $runtimeSettings -Raw
    $settingsText = $settingsText -replace '"showFPS"\s*:\s*true','"showFPS":false'
    [System.IO.File]::WriteAllText($runtimeSettings,$settingsText,[System.Text.UTF8Encoding]::new($false))
}
if ($KeepOutputInStage) { Write-Host "Cocos build ready in $($builtIndex.DirectoryName)"; exit 0 }
Get-ChildItem -LiteralPath $builtIndex.DirectoryName -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $webRoot -Recurse -Force }
Write-Host "Cocos web files copied to $webRoot"
Write-Host 'Run the delivery post-processing script before packaging.'
exit 0
