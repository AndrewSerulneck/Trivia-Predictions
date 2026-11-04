#!/usr/bin/env python3
"""Share to social sounds: trim an original and convert it to the small AAC file the website serves.

    python3 scripts/convert-promo-sound.py <original> <start-seconds> <length-seconds> <id>

Writes public/promo/sounds/<id>-v1.m4a (AAC 160 kbps, 48 kHz stereo) from <start> for <length> seconds.
Uses macOS `afconvert` (no ffmpeg on Andrew's Mac) plus Python's own `wave` module for the trim.

Files under /promo are cached forever by name (next.config.ts): a changed sound needs a NEW file name
(bump -v1 to -v2 and update lib/promo/promoSounds.ts). Record the licence in that registry
(docs/partner-social-promo-plan.md §4.2, §6). Originals stay in data/promo-sounds/originals/.
"""

import os
import subprocess
import sys
import tempfile
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "promo", "sounds")


def main() -> None:
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    original, start, length, sound_id = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"{sound_id}-v1.m4a")
    if os.path.exists(out):
        sys.exit(f"{out} already exists. A changed sound needs a new file name (-v2).")
    with tempfile.TemporaryDirectory() as tmp:
        full = os.path.join(tmp, "full.wav")
        cut = os.path.join(tmp, "cut.wav")
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@48000", "-c", "2", original, full], check=True)
        with wave.open(full, "rb") as src:
            rate = src.getframerate()
            src.setpos(min(src.getnframes(), int(start * rate)))
            frames = src.readframes(int(length * rate))
            with wave.open(cut, "wb") as dst:
                dst.setnchannels(src.getnchannels())
                dst.setsampwidth(src.getsampwidth())
                dst.setframerate(rate)
                dst.writeframes(frames)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "160000", cut, out], check=True)
    print(out)


if __name__ == "__main__":
    main()
