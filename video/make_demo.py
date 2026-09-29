"""파이프라인 동작 확인용 데모 (약 8초)."""
import math
import os

from engine import (H, W, Scene, ease_in_out, ease_out, font, gradient_bg,
                    lerp, render, seg, text_center)

BG1, BG2 = (14, 18, 40), (40, 20, 70)
ACCENT = (255, 196, 60)
WHITE = (245, 245, 250)


def intro(img, d, t, p):
    img.paste(gradient_bg(BG1, BG2))
    d = __import__("PIL.ImageDraw", fromlist=["Draw"]).Draw(img)
    r = lerp(0, 260, ease_out(seg(t, 0, 1.0)))
    d.ellipse([W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r], outline=ACCENT, width=10)
    a = seg(t, 0.6, 0.6)
    y = lerp(H / 2 + 40, H / 2, ease_out(a))
    text_center(d, (W / 2, y), "영상 파이프라인", font(96), WHITE, a, bg=BG1)
    text_center(d, (W / 2, y + 110), "Python → Frames → FFmpeg → final.mp4",
                font(40, bold=False), ACCENT, seg(t, 1.2, 0.6), bg=BG1)


def shapes(img, d, t, p):
    img.paste(gradient_bg(BG1, BG2))
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    colors = [(255, 99, 99), (99, 200, 255), (140, 255, 140), (255, 196, 60)]
    for k, c in enumerate(colors):
        a = ease_out(seg(t, k * 0.25, 0.7))
        x = lerp(-200, 360 + k * 400, a)
        y = H / 2 + math.sin(t * 3 + k) * 60
        s = 90
        rot = t * 90 + k * 20
        pts = [(x + s * math.cos(math.radians(rot + 90 * j)), y + s * math.sin(math.radians(rot + 90 * j))) for j in range(4)]
        d.polygon(pts, fill=c)
    # 진행 바
    d.rounded_rectangle([200, H - 140, 200 + (W - 400) * ease_in_out(p), H - 110], 15, fill=ACCENT)
    text_center(d, (W / 2, 180), "도형 · 타이밍 · 이징", font(72), WHITE)


def outro(img, d, t, p):
    img.paste(gradient_bg(BG2, BG1))
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    a = 1 - seg(t, 1.5, 0.5)  # 페이드아웃
    text_center(d, (W / 2, H / 2), "준비 완료!", font(120), WHITE, a * ease_out(seg(t, 0, 0.5)), bg=BG2)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "final.mp4")
    render([Scene(3, intro), Scene(3, shapes), Scene(2, outro)], out=os.path.abspath(out))
