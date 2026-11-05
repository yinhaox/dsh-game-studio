#!/usr/bin/env python3
"""Extract frames from a recorded clip so a reviewer can read the timing.

    python scripts/clip-frames.py --clip evidence/attack.avi --out evidence/frames --fps 6
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clip", required=True, help="AVI or MP4 recorded with studio.py clip")
    parser.add_argument("--out", required=True, help="directory for the PNG frames")
    parser.add_argument("--fps", type=float, default=4.0, help="frames per second to keep (default: 4)")
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        print("ffmpeg is not on PATH; install it to extract frames", file=sys.stderr)
        return 2
    if not os.path.isfile(args.clip):
        print(f"clip not found: {args.clip}", file=sys.stderr)
        return 2
    os.makedirs(args.out, exist_ok=True)
    pattern = os.path.join(args.out, "frame-%03d.png")
    result = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", args.clip, "-vf", f"fps={args.fps}", pattern])
    if result.returncode != 0:
        print("ffmpeg failed", file=sys.stderr)
        return result.returncode
    frames = sorted(name for name in os.listdir(args.out) if name.startswith("frame-"))
    print(f"extracted {len(frames)} frames at {args.fps:g} fps into {args.out}")
    return 0 if frames else 1


if __name__ == "__main__":
    sys.exit(main())
