"""Cut a vertical short (1080x1920, about 20 s) for X, YouTube Shorts, Instagram Reels, Threads and TikTok from the
horizontal tour recording.

    ~/.venvs/chatterbox/bin/python promo/tts.py promo/narration-elevator-vertical.json
    ~/.venvs/chatterbox/bin/python promo/make_vertical.py promo/narration-elevator-vertical.json

The script's "segments" pick parts of teardown-out/<name>-silent.mp4 ("src": [start, end] in seconds) or a still image
("still", "dur"), in order. Every recorded segment shows two crops of the 1600x900 console (rendered at 1920x1080):
the 3D area in the middle, and the motor-torque row of the gauges (where 力行 / 回生 shows), drawn larger above it.
The layout keeps text out of the zones the apps cover (top 288, bottom 672, right 192 px) and uses the subtitle style
of the account's other shorts: 56 px white with a black outline, 13 characters a line (or the line breaks given in a
line's "sub"), bottom edge at y = 1245. Loudness lands near -15 LUFS (loudnorm aims at -13 because one pass falls short).

The crops default to the elevator's. A script can move them for another machine:
- "main_crop": {"crop": [w, h, x, y], "y": top} — the 3D area (w x h at x, y of the 1920x1080 recording), scaled to
  1080 wide and placed at y = top.
- "gauge_crop": {"crop": [w, h, x, y], "scale": s, "y": top} — the gauge drawn s times larger, centred, at y = top;
  null leaves the gauge out. A segment can carry its own "gauge_crop" (or null) to show a different gauge in that part,
  and its own "main_crop" {"crop": [...]} to frame the 3D closer (keep h / w near the default's so the height matches).
The credit sits under the tallest gauge (or under the headline when there is none).

Outputs: teardown-out/<name>-vertical.mp4 (h264, 30 fps, under 10 MB) and teardown-out/<name>-vertical-cover.jpg
(the first frame, for TikTok and Instagram covers). A second argument renames the outputs:
`make_vertical.py promo/narration-elevator-vertical.json elevator-vertical-check` writes elevator-vertical-check.mp4.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio.functional as AF
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "teardown-out"
W, H, FPS, SR = 1080, 1920, 30, 48000
BG = (239, 233, 223)
INK = (38, 36, 32)
FONT = "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc"
FONT_SUB = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
CX = 504  # text centre: the right 192 px are covered by the apps' buttons
MAIN = {"crop": (1100, 720, 400, 160), "y": 690}  # 3D area of the 1920x1080 recording → 1080 wide
GAUGE = {"crop": (380, 80, 1515, 400), "scale": 1.5, "y": 505}  # motor torque row with the 力行 / 回生 badge
SUB_BOTTOM, SUB_PX, SUB_CHARS = 1245, 56, 13
CREDIT_NO_GAUGE_Y = 520  # under the two-line headline


def layout(spec: dict) -> tuple[dict, dict | None]:
    """The script's main / gauge crops over the defaults above (new dicts; the defaults stay as they are)."""
    main = {**MAIN, **spec.get("main_crop", {})}
    gauge = spec.get("gauge_crop", GAUGE)
    return main, (None if gauge is None else {**GAUGE, **gauge})


def seg_gauge(seg: dict, gauge: dict | None) -> dict | None:
    if "gauge_crop" not in seg:
        return gauge
    return None if seg["gauge_crop"] is None else {**GAUGE, **seg["gauge_crop"]}


def gauge_bottom(g: dict) -> int:
    gw, gh = g["crop"][:2]
    return g["y"] + round(gh * int(gw * g["scale"]) / gw)


def run(args: list[str]) -> None:
    subprocess.run(args, check=True)


def text_png(path: Path, lines: list[str], px: int, font_path: str, y0: int, fill, stroke=0, stroke_fill=None,
             line_h: float = 1.3, anchor_bottom: bool = False) -> None:
    font = ImageFont.truetype(font_path, px)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    step = int(px * line_h)
    y = y0 - step * len(lines) if anchor_bottom else y0
    for line in lines:
        d.text((CX - font.getlength(line) / 2, y), line, font=font, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
        y += step
    img.save(path)


def wrap13(text: str) -> list[str]:
    text = text.rstrip("。")
    out, cur = [], ""
    for part in text.replace("、", "、\n").split("\n"):
        if len(cur) + len(part) <= SUB_CHARS:
            cur += part
        else:
            if cur:
                out.append(cur)
            while len(part) > SUB_CHARS:
                out.append(part[:SUB_CHARS])
                part = part[SUB_CHARS:]
            cur = part
    if cur:
        out.append(cur)
    return out


def segment_clip(seg: dict, src: Path, tmp: Path, i: int, main: dict, gauge: dict | None) -> tuple[Path, float]:
    out = tmp / f"seg{i}.mp4"
    if "still" in seg:
        cw, ch = MAIN["crop"][:2]  # the end card keeps the elevator's framing of the hub screenshot
        dur = float(seg["dur"])
        fc = (f"color=c=0x{bytes(BG).hex()}:s={W}x{H}:r={FPS}:d={dur}[bg];"
              f"[0:v]scale=1600:900,crop={cw}:{ch}:250:90,scale={W}:-2[m];[bg][m]overlay=0:{main['y']}[v]")
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", str(dur), "-i", str(ROOT / seg["still"]),
             "-filter_complex", fc, "-map", "[v]", "-r", str(FPS), "-t", str(dur), "-c:v", "libx264", "-crf", "16",
             "-pix_fmt", "yuv420p", str(out)])
        return out, dur
    a, b = seg["src"]
    dur = b - a
    cw, ch, cx, cy = {**main, **seg.get("main_crop", {})}["crop"]
    g = seg_gauge(seg, gauge)
    fc = (f"color=c=0x{bytes(BG).hex()}:s={W}x{H}:r={FPS}:d={dur}[bg];"
          f"[0:v]split=2[s1][s2];[s1]crop={cw}:{ch}:{cx}:{cy},scale={W}:-2[m];")
    if g is None:
        fc += f"[s2]nullsink;[bg][m]overlay=0:{main['y']}[v]"
    else:
        gw, gh, gx, gy = g["crop"]
        gs = g["scale"]
        fc += (f"[s2]crop={gw}:{gh}:{gx}:{gy},scale={int(gw * gs)}:-2[g];"
               f"[bg][m]overlay=0:{main['y']}[t1];[t1][g]overlay={CX - int(gw * gs) // 2}:{g['y']}[v]")
    run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-t", str(dur), "-i", str(src), "-filter_complex", fc,
         "-map", "[v]", "-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(out)])
    return out, dur


def narration(report: dict, total: float, tmp: Path) -> Path:
    track = np.zeros(int(total * SR) + SR, dtype=np.float32)
    for line in report["lines"]:
        wav, sr = sf.read(line["wav"], dtype="float32")
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        wav = AF.resample(torch.from_numpy(wav), sr, SR).numpy()
        s = int(line["t"] * SR)
        track[s:s + len(wav)] += wav[: len(track) - s]
    track *= 0.7 / (float(np.abs(track).max()) or 1.0)
    path = tmp / "narration.wav"
    sf.write(path, track[: int(total * SR)], SR)
    return path


def main() -> int:
    script = Path(sys.argv[1]).resolve()
    spec = json.loads(script.read_text())
    name = spec.get("name", "elevator")
    out_name = sys.argv[2] if len(sys.argv) > 2 else f"{name}-vertical"
    main_box, gauge = layout(spec)
    shown = [g for g in (seg_gauge(seg, gauge) for seg in spec["segments"] if "src" in seg) if g is not None]
    credit_y = max(gauge_bottom(g) for g in shown) + 8 if shown else CREDIT_NO_GAUGE_Y
    stem = script.stem[len("narration"):]
    report = json.loads((OUT / f"narration{stem}" / "lines.json").read_text())
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        clips = [segment_clip(seg, OUT / f"{name}-silent.mp4", tmp, i, main_box, gauge)
                 for i, seg in enumerate(spec["segments"])]
        total = sum(d for _, d in clips)
        (tmp / "list.txt").write_text("".join(f"file '{p}'\n" for p, _ in clips))
        body = tmp / "body.mp4"
        run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"), "-c", "copy", str(body)])

        head = tmp / "head.png"
        text_png(head, spec["headline"], 76, FONT, 310, INK)
        credit = tmp / "credit.png"
        text_png(credit, [spec["credit"]], 24, FONT_SUB, credit_y, (95, 88, 78))
        subs = []
        for i, (line, rep) in enumerate(zip(spec["lines"], report["lines"])):
            p = tmp / f"sub{i}.png"
            text_png(p, line.get("sub") or wrap13(line["text"]), SUB_PX, FONT_SUB, SUB_BOTTOM, (255, 255, 255), stroke=5,
                     stroke_fill=(0, 0, 0), line_h=1.25, anchor_bottom=True)
            start = rep["t"] + rep.get("speech_start", 0.0)
            end = min(rep["t"] + (rep.get("speech_end") or rep["dur"]) + 0.25, total)
            subs.append((p, start, end))
        narr = narration(report, total, tmp)

        out = OUT / f"{out_name}.mp4"
        args = ["ffmpeg", "-v", "error", "-y", "-i", str(body), "-stream_loop", "-1", "-i", str(ROOT / "promo/bgm" / spec["bgm"]),
                "-i", str(narr), "-loop", "1", "-i", str(head), "-loop", "1", "-i", str(credit)]
        for p, _, _ in subs:
            args += ["-loop", "1", "-i", str(p)]
        v = "[0:v][3:v]overlay=0:0:shortest=1[h];[h][4:v]overlay=0:0:shortest=1[v0]"
        for i, (_, s, e) in enumerate(subs):
            v += f";[v{i}][{5 + i}:v]overlay=0:0:shortest=1:enable='between(t,{s:.2f},{e:.2f})'[v{i + 1}]"
        gain = float(spec.get("bgm_gain_db", -15))
        a = (f"[1:a]volume={gain}dB,afade=t=in:d=0.5,afade=t=out:st={total - 1.5:.2f}:d=1.5,aresample={SR},atrim=0:{total}[m];"
             "[2:a]asplit=2[n1][n2];[m][n1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];"
             "[duck][n2]amix=inputs=2:weights='1 1.6':normalize=0,loudnorm=I=-13:TP=-1.5:LRA=11[a]")
        args += ["-filter_complex", v + ";" + a, "-map", f"[v{len(subs)}]", "-map", "[a]", "-r", str(FPS),
                 "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-maxrate", "3M", "-bufsize", "6M",
                 "-c:a", "aac", "-b:a", "160k", "-ar", str(SR), "-movflags", "+faststart", "-t", f"{total:.2f}", str(out)]
        run(args)
        cover = OUT / f"{out_name}-cover.jpg"
        run(["ffmpeg", "-v", "error", "-y", "-ss", "1.2", "-i", str(out), "-frames:v", "1", "-q:v", "2", str(cover)])
    print(f"→ {out} ({total:.2f} s)\n→ {cover}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
