param([string]$RuntimeDir = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$RuntimeDir = [System.IO.Path]::GetFullPath($RuntimeDir)
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
$venvDir = Join-Path $RuntimeDir '.venv'
$pythonExe = Join-Path $venvDir 'Scripts\python.exe'
if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv venv --python 3.11 $venvDir
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed' }
    uv pip install --python $pythonExe 'kokoro>=0.9' soundfile
} else {
    py -3.11 -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or uv is required' }
    & $pythonExe -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw 'pip installation failed' }
    & $pythonExe -m pip install 'kokoro>=0.9' soundfile
}
if ($LASTEXITCODE -ne 0) { throw 'Kokoro installation failed' }
$env:VIRTUAL_ENV = $venvDir
& $pythonExe -m spacy download en_core_web_sm
if ($LASTEXITCODE -ne 0) { throw 'English language model installation failed' }
if ($RuntimeDir -ne $PSScriptRoot) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'service.py') -Destination $RuntimeDir -Force
}
Write-Host "Kokoro installed in $RuntimeDir. The voice model downloads on first use."
Write-Host 'Audio export also requires ffmpeg on PATH.'
