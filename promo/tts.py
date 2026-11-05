"""Generate the narration with Chatterbox (local, open source) from promo/narration.json, and check every take with
faster-whisper before keeping it.

    ~/.venvs/chatterbox/bin/python promo/tts.py

Chatterbox reads kanji wrongly often enough (戸 → こ, 規格 → ひかく), so the `say` text is all kana and each take is
transcribed back: if what whisper hears matches the script `text` less than MATCH_MIN, the line is generated again
with another seed (up to TRIES), and the best take is kept.

Writes teardown-out/narration/line-NN.wav and teardown-out/narration/lines.json (start time, length, where the speech
starts and ends inside the clip, what whisper heard, the match).
"""
from __future__ import annotations

import difflib
import json
import re
import sys
from pathlib import Path

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "promo/narration.json").read_text())
OUT = ROOT / "teardown-out/narration"
MATCH_MIN = 0.6
TRIES = 4


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


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    whisper = WhisperModel("small", device="cpu", compute_type="int8")
    lines = SPEC["lines"]
    report = []
    for i, line in enumerate(lines):
        path = OUT / f"line-{i:02d}.wav"
        best = None
        for k in range(TRIES):
            torch.manual_seed(1000 + 37 * k + i)
            wav = model.generate(line["say"], language_id="ja").cpu()
            tmp = OUT / f"line-{i:02d}.try{k}.wav"
            ta.save(str(tmp), wav, model.sr)
            got = listen(whisper, tmp, line["text"]) | {"dur": round(wav.shape[-1] / model.sr, 2), "seed_try": k, "tmp": tmp}
            print(f"line {i} try {k}: match {got['match']:.2f} | {got['heard']}", flush=True)
            if best is None or got["match"] > best["match"]:
                best = got
            if got["match"] >= MATCH_MIN:
                break
        best["tmp"].replace(path)
        for f in OUT.glob(f"line-{i:02d}.try*.wav"):
            f.unlink()
        nxt = lines[i + 1]["t"] if i + 1 < len(lines) else None
        end = line["t"] + best["dur"]
        report.append({"i": i, "t": line["t"], "dur": best["dur"], "end": round(end, 2), "next": nxt,
                       "overlap": bool(nxt is not None and end > nxt - 0.3), "wav": str(path),
                       **{k: best[k] for k in ("heard", "match", "speech_start", "speech_end", "seed_try")}})
    (OUT / "lines.json").write_text(json.dumps({"sr": model.sr, "device": device, "lines": report}, ensure_ascii=False, indent=1))
    bad = [r for r in report if r["overlap"] or r["match"] < MATCH_MIN]
    for r in bad:
        print(f"** line {r['i']}: match {r['match']} overlap {r['overlap']}", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
