#!/bin/sh
# Installs the Kokoro speech service for RozaReader into kokoro/.venv.
# Needs Homebrew's python@3.11 (Kokoro supports Python 3.10 to 3.12) and espeak-ng.
set -e
cd "$(dirname "$0")"

brew list espeak-ng >/dev/null 2>&1 || brew install espeak-ng
brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg

/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install "kokoro>=0.9" soundfile

echo "Kokoro is installed. The model (~330 MB) downloads from Hugging Face on first use."
