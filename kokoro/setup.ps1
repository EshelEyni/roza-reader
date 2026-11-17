$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
py -3.11 -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 is required' }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install 'kokoro>=0.9' soundfile
if ($LASTEXITCODE -ne 0) { throw 'Kokoro installation failed' }
Write-Host 'Install espeak-ng and ffmpeg on PATH. The voice model downloads on first use.'
