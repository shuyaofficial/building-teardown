"""Score for the automatic door film: a quiet bed under the narration, a soft motor whine for every stroke of the doors,
a short tone when the safety beam makes the door reverse, and a click on every button the operator presses.

    python ~/.claude/skills/teardown/run_sfx.py autodoor-shared/score.py

Every time comes from autodoor-film/timeline.json. Stroke lengths come from autodoor/refs.md
(full open 2.35 s at 500 mm/s, full close 3.13 s at 350 mm/s; the gentle mode is slower).
"""

import os

from sfx.score_kit import bed, chords, hz, motor
from sfx.synth import click

TIMELINE = "../autodoor-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "autodoor-score.wav")
TARGET_LUFS = -14.0
SEED = 23

CHORDS = chords("Fmaj9:F2 C3 E3 G3 A3/F1", "Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb2 F3 A3 D4/Bb1", "C6sus:C3 F3 G3 A3 D4/C2")
MOTIF = [(0.5, hz("A5")), (1.5, hz("C6")), (2.5, hz("G5"))]

OPENS = ("open", "open2", "open3", "open4")
CLOSES = ("close", "close2", "close3", "close4", "close5")
GENTLE_FROM = "mode_gentle"
PRESSES = ("iso_engine", "iso_belt", "iso_belt2", "iso_sensor", "slide_D", "iso_sensor2", "mode_gentle", "slide_D2")


def score(mix, tl):
    dur = tl["duration"]
    b = tl["beats"]
    left, right, low, drums = bed(dur, 92, CHORDS, MOTIF, motif_voice="epiano", kicks=(0,), snares=(), hats=8, swing=0.0, keys_vel=0.55, keys_lp=3200)
    mix.put_stereo(0, left, right, 0.08)
    mix.put(0, low, 0.08)
    mix.put(0, drums, 0.025)

    gentle = b.get(GENTLE_FROM, dur)
    for k in OPENS:
        if k in b:
            length = 2.35 if b[k] < gentle else 2.9
            mix.put(b[k], motor(length, 160, 1100, 12), 0.018)
    for k in CLOSES:
        if k in b and b[k] < dur - 0.5:
            length = 3.13 if b[k] < gentle else 4.3
            mix.put(b[k], motor(min(length, dur - b[k] - 0.2), 140, 950, 12), 0.015)
    if "reverse" in b:
        mix.put(b["reverse"], click(1800, 0.06), 0.07)
        mix.put(b["reverse"] + 0.12, click(2400, 0.05), 0.05)
    for k in PRESSES:
        if k in b:
            mix.put(b[k], click(2400, 0.025), 0.045)
