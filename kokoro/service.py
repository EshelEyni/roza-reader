"""Kokoro speech service for RozaReader.

Reads one JSON request per line on stdin and answers one JSON line on stdout:
  request:  {"id": "1", "text": "...", "words": ["Hello,", "world."], "voice": "af_heart", "out": "/abs/file.wav"}
  response: {"id": "1", "ok": true, "duration": 1.84, "words": [[0.05, 0.41], [0.45, 0.98]]}
The first line it prints is {"event": "ready"} once the model is loaded. Logs go to stderr.
"""

import json
import sys
import warnings

warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KModel, KPipeline  # noqa: E402

REPO_ID = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24000
# Kokoro pads each clip with ~0.3 s of silence before and ~0.5 s after. Sentences play back to back,
# so the clips keep only a short breath; together they make a natural pause between sentences.
LEAD_SECONDS = 0.04
TAIL_SECONDS = 0.16


def emit(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def log(text):
    sys.stderr.write(f"[kokoro] {text}\n")
    sys.stderr.flush()


model = KModel(repo_id=REPO_ID).eval()
pipelines = {}


def pipeline_for(voice):
    # The first letter of a voice id is its language: "a" American English, "b" British English.
    lang = voice[0]
    if lang not in pipelines:
        pipelines[lang] = KPipeline(lang_code=lang, repo_id=REPO_ID, model=model)
    return pipelines[lang]


def normalize(text):
    return "".join(char for char in text.lower() if char.isalnum())


def align(words, tokens, duration):
    """Gives each book word a [start, end] from Kokoro's tokens, matched by their letters and digits."""
    times = []
    index = 0
    carry = ""
    carry_start = None
    for word in words:
        target = normalize(word)
        if not target:
            times.append(None)
            continue
        letters, start, end = carry, carry_start, None
        while len(letters) < len(target) and index < len(tokens):
            text, token_start, token_end = tokens[index]
            index += 1
            if not normalize(text):
                continue
            letters += normalize(text)
            if start is None and token_start is not None:
                start = token_start
            if token_end is not None:
                end = token_end
        # A token can cover more than one book word ("cannot" vs "can not"); the rest carries over.
        carry = letters[len(target):]
        carry_start = start if carry else None
        times.append([start, end] if start is not None and end is not None and end >= start else None)
    return fill_gaps(times, duration)


def fill_gaps(times, duration):
    """Words Kokoro gave no time share the gap between their timed neighbours evenly."""
    filled = list(times)
    position = 0
    while position < len(filled):
        if filled[position] is not None:
            position += 1
            continue
        gap_end = position
        while gap_end < len(filled) and filled[gap_end] is None:
            gap_end += 1
        low = filled[position - 1][1] if position > 0 else 0.0
        high = filled[gap_end][0] if gap_end < len(filled) else duration
        step = max(high - low, 0.0) / (gap_end - position)
        for offset in range(gap_end - position):
            filled[position + offset] = [low + step * offset, low + step * (offset + 1)]
        position = gap_end
    return [[round(start, 3), round(end, 3)] for start, end in filled]


def trim_silence(audio, words):
    """Cuts the silence at both ends and shifts the word times to match."""
    level = np.abs(audio)
    loud = np.nonzero(level > max(level.max() * 0.02, 1e-4))[0]
    if not len(loud):
        return audio, words
    start = max(loud[0] - int(LEAD_SECONDS * SAMPLE_RATE), 0)
    end = min(loud[-1] + int(TAIL_SECONDS * SAMPLE_RATE), len(audio))
    shift = start / SAMPLE_RATE
    duration = (end - start) / SAMPLE_RATE
    shifted = [[round(max(0.0, s - shift), 3), round(min(duration, max(0.0, e - shift)), 3)] for s, e in words]
    return audio[start:end], shifted


def synthesize(request):
    pipeline = pipeline_for(request["voice"])
    chunks = []
    tokens = []
    offset = 0.0
    # The whole sentence is one chunk unless it is very long; timestamps restart per chunk.
    for result in pipeline(request["text"], voice=request["voice"], speed=1, split_pattern=None):
        if result.audio is None:
            continue
        audio = result.audio.cpu().numpy() if hasattr(result.audio, "cpu") else np.asarray(result.audio)
        for token in result.tokens or []:
            start = None if token.start_ts is None else token.start_ts + offset
            end = None if token.end_ts is None else token.end_ts + offset
            tokens.append((token.text, start, end))
        offset += len(audio) / SAMPLE_RATE
        chunks.append(audio)

    audio = np.concatenate(chunks) if chunks else np.zeros(int(SAMPLE_RATE * 0.3), dtype=np.float32)
    words = align(request["words"], tokens, len(audio) / SAMPLE_RATE)
    audio, words = trim_silence(audio, words)
    sf.write(request["out"], audio, SAMPLE_RATE)
    return {"duration": round(len(audio) / SAMPLE_RATE, 3), "words": words}


def main():
    emit({"event": "ready"})
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        try:
            emit({"id": request["id"], "ok": True, **synthesize(request)})
        except Exception as error:  # Reported back, so one bad sentence doesn't stop the service.
            log(f"failed: {error!r}")
            emit({"id": request["id"], "ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
