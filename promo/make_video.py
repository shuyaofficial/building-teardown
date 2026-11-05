"""Finish the promo video: narration (Chatterbox clips) + score + subtitles timed by faster-whisper.

    ~/.venvs/chatterbox/bin/python promo/make_video.py                                 # promo/narration.json
    ~/.venvs/chatterbox/bin/python promo/make_video.py promo/narration-zundamon.json   # ずんだもん版

For promo/narration-<name>.json the narration is read from teardown-out/narration-<name>/ and the outputs get a
-<name> suffix. A script with a "credit" (VOICEVOX:ずんだもん) shows it in the corner of the subtitle band all the way
through, as the voice's terms require.

Inputs:  teardown-out/autodoor-silent.mp4, teardown-out/autodoor-score.wav,
         teardown-out/narration/lines.json (from promo/tts.py), promo/narration.json
Outputs: teardown-out/autodoor-promo.mp4 (1920x1260: the film on top, a subtitle band below),
         promo/autodoor.srt (also uploadable to X as a caption file),
         teardown-out/narration/check.json (what whisper heard vs. the script)

Subtitle timing and the misread check come from promo/tts.py, which transcribed every take with faster-whisper.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio.functional as AF
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "teardown-out"
SCRIPT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "promo/narration.json"
SUFFIX = SCRIPT.stem[len("narration"):] if SCRIPT.stem.startswith("narration") else "-" + SCRIPT.stem
NARR = OUT / f"narration{SUFFIX}"
SR = 48000
DURATION = 54.4
BAND_H = 180
BG = "#efe9df"
INK = (38, 36, 32, 255)
FONT = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
MATCH_MIN = 0.6


def build_narration(report: dict) -> Path:
    track = np.zeros(int(DURATION * SR) + SR, dtype=np.float32)
    for line in report["lines"]:
        wav, sr = sf.read(line["wav"], dtype="float32")
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        wav = AF.resample(torch.from_numpy(wav), sr, SR).numpy()
        start = int(line["t"] * SR)
        track[start:start + len(wav)] += wav[: len(track) - start]
    peak = float(np.abs(track).max()) or 1.0
    track = track * (0.7 / peak)
    path = NARR / "narration.wav"
    sf.write(path, track[: int(DURATION * SR)], SR)
    return path


def strip(s: str) -> str:
    return re.sub(r"[、。，．,.\s]", "", s)


def time_lines(script: list[dict], report: dict) -> list[dict]:
    """Each subtitle runs from where whisper heard the speech start in its clip to where it ended (tts.py measured
    both per clip), shifted to the clip's place on the timeline."""
    timed = []
    for line, rep in zip(script, report["lines"]):
        start = rep["t"] + rep.get("speech_start", 0.0)
        end = rep["t"] + (rep.get("speech_end") or rep["dur"])
        timed.append({"start": round(start, 2), "end": round(end + 0.25, 2), "text": line["text"],
                      "heard": rep.get("heard", ""), "match": rep.get("match", 0.0)})
    return timed


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_srt(timed: list[dict]) -> Path:
    path = ROOT / f"promo/autodoor{SUFFIX}.srt"
    body = "\n".join(f"{i + 1}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{c['text']}\n" for i, c in enumerate(timed))
    path.write_text(body)
    return path


def wrap(text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    if font.getlength(text) <= width:
        return [text]
    cut = max((m.end() for m in re.finditer("、|。", text) if m.end() < len(text) and font.getlength(text[: m.end()]) <= width), default=len(text) // 2)
    return [text[:cut], text[cut:]]


def band_images(timed: list[dict], width: int) -> list[Path]:
    font = ImageFont.truetype(FONT, 46)
    paths = []
    for i, cue in enumerate(timed):
        img = Image.new("RGBA", (1920, BAND_H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        rows = wrap(cue["text"], font, width)
        y = (BAND_H - 62 * len(rows)) // 2
        for row in rows:
            d.text(((1920 - font.getlength(row)) / 2, y), row, font=font, fill=INK)
            y += 62
        p = NARR / f"sub-{i:02d}.png"
        img.save(p)
        paths.append(p)
    return paths


def credit_image(text: str) -> Path:
    font = ImageFont.truetype(FONT, 24)
    img = Image.new("RGBA", (1920, BAND_H), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((1920 - 36 - font.getlength(text), BAND_H - 44), text, font=font, fill=(95, 88, 78, 255))
    p = NARR / "credit.png"
    img.save(p)
    return p


def compose(narr_wav: Path, timed: list[dict], subs: list[Path], credit: Path | None) -> Path:
    out = OUT / f"autodoor-promo{SUFFIX}.mp4"
    args = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(OUT / "autodoor-silent.mp4"),
            "-i", str(OUT / "autodoor-score.wav"), "-i", str(narr_wav)]
    for p in subs:
        args += ["-loop", "1", "-t", str(DURATION), "-i", str(p)]
    v = f"[0:v]pad=1920:{1080 + BAND_H}:0:0:color={BG}[v0]"
    for i, cue in enumerate(timed):
        v += f";[v{i}][{3 + i}:v]overlay=0:1080:enable='between(t,{cue['start']},{cue['end']})'[v{i + 1}]"
    last = f"v{len(timed)}"
    if credit is not None:
        args += ["-loop", "1", "-t", str(DURATION), "-i", str(credit)]
        v += f";[{last}][{3 + len(subs)}:v]overlay=0:1080[vc]"
        last = "vc"
    a = ("[2:a]asplit=2[n1][n2];[1:a][n1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];"
         "[duck][n2]amix=inputs=2:weights='1 1.6':normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    args += ["-filter_complex", v + ";" + a, "-map", f"[{last}]", "-map", "[a]",
             "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", "60",
             "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", "-t", str(DURATION), str(out)]
    subprocess.run(args, check=True)
    return out


def main() -> int:
    spec = json.loads(SCRIPT.read_text())
    script = spec["lines"]
    report = json.loads((NARR / "lines.json").read_text())
    narr = build_narration(report)
    timed = time_lines(script, report)
    (NARR / "check.json").write_text(json.dumps(timed, ensure_ascii=False, indent=1))
    for c in timed:
        flag = "" if c["match"] >= MATCH_MIN else "  ** whisper heard something else"
        print(f"{c['start']:5.2f}-{c['end']:5.2f} match {c['match']:.2f} | {c['heard']}{flag}", flush=True)
    srt = write_srt(timed)
    credit = spec.get("credit")
    subs = band_images(timed, 1500 if credit else 1760)
    out = compose(narr, timed, subs, credit_image(credit) if credit else None)
    print(f"→ {out}\n→ {srt}")
    return 0 if all(c["match"] >= MATCH_MIN for c in timed) else 2


if __name__ == "__main__":
    sys.exit(main())
