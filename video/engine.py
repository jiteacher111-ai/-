"""Python -> 프레임(도형/텍스트/타이밍) -> FFmpeg -> final.mp4 파이프라인.

프레임을 디스크에 저장하지 않고 raw RGB를 FFmpeg stdin으로 바로 넘긴다.
씬(Scene)은 duration(초)과 draw(img, draw, t, p) 함수로 구성된다.
  t: 씬 시작 후 경과 초, p: 0~1 진행률
"""
import glob
import subprocess
from dataclasses import dataclass
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30


def _find_font(bold=True):
    pats = ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold
            else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK*.ttc",
            "/usr/share/fonts/**/*.tt[fc]"]
    for p in pats:
        hits = glob.glob(p, recursive=True)
        if hits:
            return hits[0]
    return None


_FONT_PATH = {True: _find_font(True), False: _find_font(False)}


def font(size, bold=True):
    return ImageFont.truetype(_FONT_PATH[bold], size, index=1 if _FONT_PATH[bold].endswith(".ttc") else 0)  # index 1 = KR


# ---------- 이징 / 보간 ----------
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def seg(t, start, dur):
    """t가 [start, start+dur] 구간에서 0->1로 변하는 값."""
    return clamp((t - start) / dur) if dur > 0 else float(t >= start)


def lerp(a, b, x):
    return a + (b - a) * x


def mix(c1, c2, x):
    return tuple(int(lerp(a, b, x)) for a, b in zip(c1, c2))


# ---------- 그리기 도우미 ----------
def text_center(draw, xy, s, fnt, fill, alpha=1.0, bg=None):
    if alpha <= 0:
        return
    if bg is not None and alpha < 1:
        fill = mix(bg, fill, alpha)
    draw.text(xy, s, font=fnt, fill=fill, anchor="mm")


def gradient_bg(c1, c2):
    top = Image.new("RGB", (W, H), c1)
    bot = Image.new("RGB", (W, H), c2)
    mask = Image.linear_gradient("L").resize((W, H))
    return Image.composite(bot, top, mask)


@dataclass
class Scene:
    duration: float
    draw: Callable


def render(scenes, out="final.mp4", fps=FPS, size=(W, H), audio=None, crf=18):
    w, h = size
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-"]
    if audio:
        cmd += ["-i", audio, "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = 0
    for sc in scenes:
        n = max(1, round(sc.duration * fps))
        for i in range(n):
            t = i / fps
            img = Image.new("RGB", (w, h), (0, 0, 0))
            sc.draw(img, ImageDraw.Draw(img), t, i / max(1, n - 1))
            proc.stdin.write(img.tobytes())
        total += n
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg 실패")
    print(f"완료: {out} ({total} frames, {total / fps:.1f}s @ {fps}fps)")
