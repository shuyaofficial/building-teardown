"""Generate the narration from a script file and check every take with faster-whisper before keeping it.

    ~/.venvs/chatterbox/bin/python promo/tts.py                                      # Chatterbox, promo/narration.json
    ~/.venvs/chatterbox/bin/python promo/tts.py promo/narration-zundamon.json        # ずんだもん (VOICEVOX ENGINE)

The script's "engine" picks the voice:
- "chatterbox" (default): local Chatterbox Multilingual. It misreads kanji often (戸 → こ, 規格 → ひかく), so `say` is all
  kana, and a take that whisper does not match to the script is generated again with another seed.
- "voicevox": a VOICEVOX ENGINE on http://127.0.0.1:50021 (VOICEVOX_URL overrides), speaker id from "speaker". It reads
  kanji with its own dictionary and gives the same audio every time, so there is one take per line.
  Credit "VOICEVOX:ずんだもん" is required by the character's terms; make_video.py puts the script's "credit" on screen.

Writes <out>/line-NN.wav and <out>/lines.json (start time, length, where the speech starts and ends inside the clip,
what whisper heard, the match). <out> is teardown-out/narration for the default script, teardown-out/narration-<name>
for promo/narration-<name>.json.
"""
from __future__ import annotations

import difflib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
MATCH_MIN = 0.6
TRIES = 4
VOICEVOX = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")


def out_dir(script_path: Path) -> Path:
    stem = script_path.stem
    suffix = stem[len("narration"):] if stem.startswith("narration") else "-" + stem
    return ROOT / "teardown-out" / f"narration{suffix}"


def strip(s: str) -> str:
    return re.sub(r"[、。，．,.\s]", "", s)


def listen(whisper: WhisperModel, path: Path, text: str) -> dict:
    segs = list(whisper.transcribe(str(path), language="ja", vad_filter=True)[0])
    heard = "".join(s.text for s in segs)
    return {
        "heard": heard,
        "match": round(difflib.SequenceMatcher(None, strip(heard), strip(text)).ratio(), 2),
        "speech_start": round(min((s.start for s in segs), default=0.0), 2),
        "speech_end": round(max((s.end for s in segs), default=0.0), 2),
    }


def wav_seconds(path: Path) -> float:
    import soundfile as sf

    info = sf.info(str(path))
    return info.frames / info.samplerate


def voicevox_take(text: str, speaker: int, path: Path, speed: float, pause: float) -> None:
    q = urllib.parse.urlencode({"text": text, "speaker": speaker})
    with urllib.request.urlopen(urllib.request.Request(f"{VOICEVOX}/audio_query?{q}", method="POST"), timeout=60) as r:
        query = json.loads(r.read())
    query["speedScale"] = speed
    query["pauseLengthScale"] = pause
    query["prePhonemeLength"] = 0.05
    query["postPhonemeLength"] = 0.05
    body = json.dumps(query).encode()
    req = urllib.request.Request(f"{VOICEVOX}/synthesis?speaker={speaker}", data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())


def chatterbox_engine():
    import torch
    import torchaudio as ta
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)

    def take(text: str, path: Path, seed: int) -> None:
        torch.manual_seed(seed)
        ta.save(str(path), model.generate(text, language_id="ja").cpu(), model.sr)

    return take


def main() -> int:
    script_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "promo/narration.json"
    spec = json.loads(script_path.read_text())
    engine = spec.get("engine", "chatterbox")
    out = out_dir(script_path)
    out.mkdir(parents=True, exist_ok=True)
    whisper = WhisperModel("small", device="cpu", compute_type="int8")
    tries = TRIES if engine == "chatterbox" else 1
    cb_take = chatterbox_engine() if engine == "chatterbox" else None

    lines = spec["lines"]
    report = []
    for i, line in enumerate(lines):
        path = out / f"line-{i:02d}.wav"
        best = None
        for k in range(tries):
            tmp = out / f"line-{i:02d}.try{k}.wav"
            if engine == "voicevox":
                voicevox_take(line["say"], int(spec.get("speaker", 3)), tmp, float(spec.get("speed", 1.0)), float(spec.get("pause", 1.0)))
            else:
                cb_take(line["say"], tmp, 1000 + 37 * k + i)
            got = listen(whisper, tmp, line["text"]) | {"dur": round(wav_seconds(tmp), 2), "seed_try": k, "tmp": tmp}
            print(f"line {i} try {k}: match {got['match']:.2f} dur {got['dur']}s | {got['heard']}", flush=True)
            if best is None or got["match"] > best["match"]:
                best = got
            if got["match"] >= MATCH_MIN:
                break
        best["tmp"].replace(path)
        for f in out.glob(f"line-{i:02d}.try*.wav"):
            f.unlink()
        nxt = lines[i + 1]["t"] if i + 1 < len(lines) else None
        end = line["t"] + best["dur"]
        report.append({"i": i, "t": line["t"], "dur": best["dur"], "end": round(end, 2), "next": nxt,
                       "overlap": bool(nxt is not None and end > nxt - 0.3), "wav": str(path),
                       **{k: best[k] for k in ("heard", "match", "speech_start", "speech_end", "seed_try")}})
    (out / "lines.json").write_text(json.dumps({"engine": engine, "lines": report}, ensure_ascii=False, indent=1))
    bad = [r for r in report if r["overlap"] or r["match"] < MATCH_MIN]
    for r in bad:
        print(f"** line {r['i']}: match {r['match']} overlap {r['overlap']} (ends {r['end']}, next {r['next']})", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
