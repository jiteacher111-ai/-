# Renders the intro video frames (1920x1080, 30fps) from the PDF illustrations.
# usage: python3 render.py <frames_dir> [start_frame end_frame]
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops, ImageEnhance

W, H, FPS = 1920, 1080, 30
D = os.path.dirname(os.path.abspath(__file__))
PAGES = os.path.join(D, "pages")
F_TITLE = os.path.join(D, "fonts/BlackHanSans.ttf")
F_BODY = os.path.join(D, "fonts/NotoKR900.ttf")
SCALE = 2867 / 1912  # page px per "display" px used when picking crop boxes

NARR = 2.5            # narration offset in the video
T_S1, T_S2, T_S3, T_S4, T_END = 2.5, 12.6, 23.1, 32.6, 42.4
TOTAL = 46.0


def font(path, size, _c={}):
    k = (path, size)
    if k not in _c:
        _c[k] = ImageFont.truetype(path, size)
    return _c[k]


def page(n, _c={}):
    if n not in _c:
        _c[n] = Image.open(os.path.join(PAGES, f"p-{n:02d}.png")).convert("RGB")
    return _c[n]


def crop(n, box):
    x0, y0, x1, y1 = [int(v * SCALE) for v in box]
    return page(n).crop((x0, y0, x1, y1))


def key_black(img, lo=18, hi=60):
    """Make near-black background transparent (for sprites on black pages)."""
    a = np.asarray(img.convert("RGB")).astype(np.float32).max(2)
    alpha = np.clip((a - lo) / (hi - lo), 0, 1) * 255
    out = img.convert("RGBA")
    out.putalpha(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1)))
    return out


# ---------- easing ----------
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out_back(x, s=1.7):
    x = clamp(x) - 1
    return x * x * ((s + 1) * x + s) + 1


def prog(t, a, b):
    return clamp((t - a) / (b - a))


# ---------- primitives ----------
def cover(img, t, z0, z1, c0, c1, dur):
    """Ken Burns: scale image to cover the frame, zoom z0->z1, center c0->c1 (0..1 coords)."""
    p = ease(t / dur) if dur > 0 else 1
    z = z0 + (z1 - z0) * p
    cx = c0[0] + (c1[0] - c0[0]) * p
    cy = c0[1] + (c1[1] - c0[1]) * p
    iw, ih = img.size
    base = max(W / iw, H / ih)
    s = base * z
    vw, vh = W / s, H / s
    x0 = clamp(cx * iw - vw / 2, 0, iw - vw)
    y0 = clamp(cy * ih - vh / 2, 0, ih - vh)
    return img.crop((int(x0), int(y0), int(x0 + vw), int(y0 + vh))).resize((W, H), Image.LANCZOS)


def paste(canvas, img, cx, cy, scale=1.0, alpha=1.0, rot=0.0):
    if alpha <= 0.01 or scale <= 0.01:
        return
    im = img.convert("RGBA")
    w, h = int(im.width * scale), int(im.height * scale)
    if w < 2 or h < 2:
        return
    im = im.resize((w, h), Image.LANCZOS)
    if rot:
        im = im.rotate(rot, Image.BICUBIC, expand=True)
    if alpha < 1:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im.putalpha(a)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def text_img(s, path, size, fill=(255, 255, 255), stroke=0, stroke_fill=(0, 0, 0), glow=None, shadow=True):
    f = font(path, size)
    bb = f.getbbox(s, stroke_width=stroke)
    pad = 40
    w, h = bb[2] - bb[0] + pad * 2, bb[3] - bb[1] + pad * 2
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    org = (pad - bb[0], pad - bb[1])
    if glow:
        g = Image.new("RGBA", (w, h))
        ImageDraw.Draw(g).text(org, s, font=f, fill=glow, stroke_width=stroke + 6, stroke_fill=glow)
        g = g.filter(ImageFilter.GaussianBlur(14))
        im.alpha_composite(g)
    if shadow:
        sh = Image.new("RGBA", (w, h))
        ImageDraw.Draw(sh).text((org[0] + 5, org[1] + 7), s, font=f, fill=(0, 0, 0, 170),
                                stroke_width=stroke, stroke_fill=(0, 0, 0, 170))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(3)))
    d.text(org, s, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return im


def gold_text(s, size, path=F_TITLE, stroke=8):
    """Text with vertical gold gradient, dark stroke and warm glow."""
    base = text_img(s, path, size, fill=(255, 255, 255), stroke=stroke, stroke_fill=(60, 20, 0),
                    glow=(255, 170, 40, 200))
    w, h = base.size
    grad = np.zeros((h, w, 3), np.float32)
    y = np.linspace(0, 1, h)[:, None]
    top, mid, bot = np.array([255, 250, 200]), np.array([255, 200, 60]), np.array([200, 110, 10])
    g = np.where((y < 0.5)[..., None], top + (mid - top) * (y / 0.5)[..., None], mid + (bot - mid) * ((y - 0.5) / 0.5)[..., None])
    grad[:] = g
    arr = np.asarray(base).astype(np.float32)
    white = (arr[..., 0] > 240) & (arr[..., 1] > 240) & (arr[..., 2] > 240)
    arr[..., :3][white] = grad[white]
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def rays(size=1500, n=18, color=(255, 210, 120)):
    im = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(im)
    c = size / 2
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = a0 + math.pi / n * 0.55
        d.polygon([(c, c), (c + c * 1.5 * math.cos(a0), c + c * 1.5 * math.sin(a0)),
                   (c + c * 1.5 * math.cos(a1), c + c * 1.5 * math.sin(a1))], fill=color + (90,))
    # radial falloff
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.sqrt((xx - c) ** 2 + (yy - c) ** 2) / c
    fall = np.clip(1 - r, 0, 1) ** 1.3
    a = np.asarray(im.getchannel("A")).astype(np.float32) * fall
    im.putalpha(Image.fromarray(a.astype(np.uint8)))
    return im.filter(ImageFilter.GaussianBlur(6))


def radial_glow(size, color, strength=255):
    yy, xx = np.mgrid[0:size, 0:size]
    c = size / 2
    r = np.sqrt((xx - c) ** 2 + (yy - c) ** 2) / c
    a = (np.clip(1 - r, 0, 1) ** 2 * strength).astype(np.uint8)
    im = Image.new("RGBA", (size, size), color + (0,))
    im.putalpha(Image.fromarray(a))
    return im


def vignette():
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    a = (np.clip((r - 0.65) / 0.75, 0, 1) ** 1.6 * 210).astype(np.uint8)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    im.putalpha(Image.fromarray(a))
    return im


def glitch(img, t, amt):
    """RGB split + horizontal slice displacement (Goryeo system error look)."""
    if amt <= 0:
        return img
    rng = np.random.default_rng(int(t * 30))
    arr = np.asarray(img.convert("RGB")).copy()
    sh = int(10 * amt)
    out = arr.copy()
    out[..., 0] = np.roll(arr[..., 0], sh, 1)
    out[..., 2] = np.roll(arr[..., 2], -sh, 1)
    for _ in range(int(8 * amt)):
        y = rng.integers(0, H - 40)
        h = rng.integers(6, 50)
        out[y:y + h] = np.roll(out[y:y + h], rng.integers(-80, 80) * amt, 1)
    return Image.fromarray(out).convert("RGBA")


def caption(canvas, s, t0, t, hi=None):
    """Scene caption: dark panel with gold frame, typewriter reveal."""
    if t < t0:
        return
    p = prog(t, t0, t0 + 0.35)
    n = int(len(s) * prog(t, t0 + 0.1, t0 + 0.9)) or 0
    f = font(F_BODY, 58)
    full_w = f.getbbox(s)[2]
    bw, bh = full_w + 120, 112
    x0 = (W - bw) / 2
    y0 = H - 170 + (1 - ease_out_back(p)) * 60
    panel = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(panel)
    a = int(225 * p)
    d.rounded_rectangle((x0 + 6, y0 + 8, x0 + bw + 6, y0 + bh + 8), 18, fill=(0, 0, 0, int(120 * p)))
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), 18, fill=(14, 20, 48, a), outline=(255, 196, 60, a), width=5)
    d.rounded_rectangle((x0 + 10, y0 + 10, x0 + bw - 10, y0 + bh - 10), 12, outline=(255, 196, 60, int(90 * p)), width=2)
    # text, highlighting quoted keyword in yellow
    x = x0 + 60
    shown = s[:n]
    inq = False
    for ch in shown:
        if ch in "'‘’":
            inq = not inq
        col = (255, 220, 70, 255) if (inq or ch in "'‘’") else (255, 255, 255, 255)
        d.text((x + 2, y0 + 22 + 3), ch, font=f, fill=(0, 0, 0, 200))
        d.text((x, y0 + 22), ch, font=f, fill=col)
        x += f.getlength(ch)
    if n < len(s) and int(t * 6) % 2 == 0:
        d.rectangle((x + 4, y0 + 30, x + 12, y0 + 88), fill=(255, 220, 70, 255))
    canvas.alpha_composite(panel)


def case_tag(canvas, label, t0, t):
    """Detective case-file tag in the top-left corner."""
    if t < t0:
        return
    p = ease(prog(t, t0, t0 + 0.4))
    f = font(F_BODY, 34)
    w = f.getbbox(label)[2] + 70
    tag = Image.new("RGBA", (w, 70))
    d = ImageDraw.Draw(tag)
    d.rectangle((0, 0, w, 70), fill=(150, 20, 20, 230))
    d.rectangle((6, 6, w - 6, 64), outline=(255, 230, 200, 220), width=2)
    d.text((35, 10), label, font=f, fill=(255, 245, 230))
    canvas.alpha_composite(tag, (int(40 - (1 - p) * (w + 60)), 40))


def sparkles(canvas, t, cx, cy, spread, n=40, seed=1, color=(255, 230, 140)):
    rng = np.random.default_rng(seed)
    d = ImageDraw.Draw(canvas)
    for i in range(n):
        ph = rng.uniform(0, 1)
        sp = rng.uniform(0.3, 1.0)
        ang = rng.uniform(0, 2 * math.pi)
        life = (t * sp + ph) % 1
        r = spread * life
        x = cx + r * math.cos(ang)
        y = cy + r * math.sin(ang) - 60 * life
        s = 2 + 5 * (1 - life)
        a = int(255 * (1 - life))
        d.ellipse((x - s, y - s, x + s, y + s), fill=color + (a,))


def magnifier(canvas, cx, cy, r, alpha=1.0):
    ov = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(ov)
    a = int(255 * alpha)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(250, 235, 200, a), width=14)
    d.ellipse((cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8), outline=(120, 80, 30, a), width=6)
    ang = math.radians(45)
    x1, y1 = cx + r * math.cos(ang), cy + r * math.sin(ang)
    x2, y2 = cx + (r + 150) * math.cos(ang), cy + (r + 150) * math.sin(ang)
    d.line((x1, y1, x2, y2), fill=(110, 60, 20, a), width=34)
    d.line((x1, y1, x2, y2), fill=(170, 100, 40, a), width=20)
    d.arc((cx - r * 0.7, cy - r * 0.7, cx + r * 0.2, cy + r * 0.2), 200, 260, fill=(255, 255, 255, int(a * 0.7)), width=10)
    canvas.alpha_composite(ov)


# ---------- assets ----------
print("loading assets", flush=True)
A = {}
A["goryeo"] = crop(2, (55, 255, 575, 875))
A["handshake"] = crop(2, (650, 290, 1262, 800))
A["joseon"] = crop(2, (1340, 258, 1855, 875))
A["map"] = crop(3, (430, 100, 1480, 985))
A["gate_e"] = key_black(crop(4, (1277, 418, 1494, 572)))
_gs = crop(4, (813, 686, 1097, 834))
_d = ImageDraw.Draw(_gs)
_d.rectangle((0, 0, 92, 153), fill=(0, 0, 0))      # hide D-pad outline beside the gate
_d.rectangle((342, 0, _gs.width, 153), fill=(0, 0, 0))
A["gate_s"] = key_black(_gs)
A["gate_w"] = key_black(crop(4, (416, 418, 633, 572)))
A["palace"] = crop(5, (60, 20, 1900, 820))
A["sgk"] = crop(7, (782, 42, 1130, 312))
A["seodang"] = crop(7, (652, 828, 813, 990))
A["hyanggyo"] = crop(7, (326, 486, 490, 648))
A["bus"] = crop(15, (685, 345, 1228, 700))
A["bow"] = crop(9, (1108, 700, 1432, 985))
A["logo"] = crop(1, (140, 88, 1775, 340))
A["rays"] = rays()
A["rays_blue"] = rays(color=(140, 220, 255))
A["vig"] = vignette()
A["glow_gold"] = radial_glow(900, (255, 200, 90), 230)
A["glow_white"] = radial_glow(1400, (255, 255, 255), 255)
rng0 = np.random.default_rng(3)
A["grain"] = [Image.fromarray(rng0.integers(0, 255, (H // 2, W // 2), dtype=np.uint8)).resize((W, H)) for _ in range(6)]
TXT = {
    "title1": gold_text("600년 전 한양의", 96),
    "title2": gold_text("비밀 코드를 풀어라!", 150),
    "1392": gold_text("1392", 230),
    "joseon": text_img("조선 건국", F_TITLE, 110, fill=(255, 255, 255), stroke=6, stroke_fill=(10, 40, 90), glow=(80, 200, 255, 220)),
    "goryeo": text_img("고려 말 · 혼란", F_BODY, 72, fill=(255, 90, 80), stroke=4, stroke_fill=(40, 0, 0), glow=(255, 0, 0, 160)),
    "warn": text_img("외적의 침입 · 부패", F_BODY, 52, fill=(255, 200, 190), stroke=4, stroke_fill=(40, 0, 0)),
    "in": text_img("仁 어짊", F_BODY, 70, fill=(255, 230, 120), stroke=5, stroke_fill=(60, 30, 0), glow=(255, 180, 40, 200)),
    "ye": text_img("禮 예의", F_BODY, 70, fill=(255, 230, 120), stroke=5, stroke_fill=(60, 30, 0), glow=(255, 180, 40, 200)),
    "ui": text_img("義 의로움", F_BODY, 70, fill=(255, 230, 120), stroke=5, stroke_fill=(60, 30, 0), glow=(255, 180, 40, 200)),
    "g_in": text_img("흥인지문 (동)", F_BODY, 44, stroke=4, stroke_fill=(0, 0, 0)),
    "g_ye": text_img("숭례문 (남)", F_BODY, 44, stroke=4, stroke_fill=(0, 0, 0)),
    "g_ui": text_img("돈의문 (서)", F_BODY, 44, stroke=4, stroke_fill=(0, 0, 0)),
    "code": text_img("SECRET CODE", F_TITLE, 70, fill=(120, 255, 200), stroke=3, stroke_fill=(0, 40, 30), glow=(0, 255, 160, 150)),
    "geun": text_img("勤", F_BODY, 260, fill=(255, 225, 120), stroke=8, stroke_fill=(70, 30, 0), glow=(255, 180, 40, 230)),
    "geun_sub": text_img("근정전 = 부지런할 근(勤) + 다스릴 정(政)", F_BODY, 48, stroke=4, stroke_fill=(0, 0, 0)),
    "bakseok": text_img("박석", F_TITLE, 90, fill=(255, 255, 255), stroke=6, stroke_fill=(30, 30, 30), glow=(255, 255, 255, 120)),
    "then": text_img("조선", F_TITLE, 64, fill=(255, 220, 120), stroke=5, stroke_fill=(50, 25, 0)),
    "now": text_img("오늘날", F_TITLE, 64, fill=(140, 220, 255), stroke=5, stroke_fill=(0, 30, 60)),
    "l_sgk": text_img("성균관", F_BODY, 44, stroke=4, stroke_fill=(0, 0, 0)),
    "l_sd": text_img("서당", F_BODY, 44, stroke=4, stroke_fill=(0, 0, 0)),
    "l_bus": text_img("웃어른 공경", F_BODY, 44, stroke=4, stroke_fill=(0, 0, 0)),
    "l_bow": text_img("인사 예절", F_BODY, 44, stroke=4, stroke_fill=(0, 0, 0)),
    "q": text_img("?", F_TITLE, 330, fill=(255, 215, 70), stroke=10, stroke_fill=(70, 30, 0), glow=(255, 180, 40, 220)),
    "start": text_img("지금 탐구를 시작합니다!", F_TITLE, 96, fill=(255, 255, 255), stroke=6, stroke_fill=(20, 30, 80), glow=(90, 180, 255, 200)),
    "press": text_img("PRESS START ▶", F_TITLE, 60, fill=(255, 230, 60), stroke=4, stroke_fill=(60, 30, 0)),
}
TXT["b1"] = text_img("눈부심 막기", F_BODY, 50, fill=(255, 240, 160), stroke=4, stroke_fill=(0, 0, 0))
TXT["b2"] = text_img("미끄럼 막기", F_BODY, 50, fill=(170, 230, 255), stroke=4, stroke_fill=(0, 0, 0))
print("assets ready", flush=True)


def framed(img, w, label, border=(255, 210, 90), bw=8):
    """Resize to width w, add a pixel-game style frame with a name strip at the bottom."""
    h = int(img.height * w / img.width)
    im = img.resize((w, h), Image.LANCZOS).convert("RGBA")
    out = Image.new("RGBA", (w + bw * 2 + 12, h + bw * 2 + 12))
    d = ImageDraw.Draw(out)
    d.rectangle((6, 6, out.width - 1, out.height - 1), fill=(0, 0, 0, 140))
    d.rectangle((0, 0, out.width - 7, out.height - 7), fill=border + (255,))
    out.alpha_composite(im, (bw, bw))
    f = font(F_BODY, 38)
    tw = f.getlength(label)
    x0 = (out.width - 7 - tw) / 2 - 22
    d.rectangle((x0, bw + h - 62, x0 + tw + 44, bw + h - 8), fill=(10, 14, 34, 230), outline=border + (255,), width=3)
    d.text((x0 + 22, bw + h - 63), label, font=f, fill=(255, 255, 255))
    return out


FR = {
    "sgk": framed(A["sgk"], 520, "성균관"),
    "seodang": framed(A["seodang"], 380, "서당"),
    "bus": framed(A["bus"], 600, "웃어른 공경", border=(120, 210, 255)),
    "bow": framed(A["bow"], 440, "인사 예절", border=(120, 210, 255)),
}


def bg_dark(t, tint=(10, 12, 30)):
    return Image.new("RGBA", (W, H), tint + (255,))


# ---------- scenes ----------
def scene_title(t):
    c = bg_dark(t, (6, 8, 20))
    # faint map in background
    m = cover(A["map"], t, 1.25, 1.1, (0.5, 0.5), (0.5, 0.5), 2.5).convert("RGBA")
    m = ImageEnhance.Brightness(m).enhance(0.25)
    c.alpha_composite(m)
    paste(c, A["rays"].rotate(t * 12, Image.BICUBIC), W / 2, H / 2 - 40, 1.1, 0.6 * ease(prog(t, 0.2, 1.0)))
    p1 = ease_out_back(prog(t, 0.15, 0.7))
    p2 = ease_out_back(prog(t, 0.45, 1.05))
    paste(c, TXT["title1"], W / 2, 380, 0.6 + 0.4 * p1, prog(t, 0.15, 0.4))
    paste(c, TXT["title2"], W / 2, 560, 1.6 - 0.6 * p2, prog(t, 0.45, 0.65))
    sparkles(c, t, W / 2, 520, 700, 50, 2)
    magnifier(c, 1500 - 300 * ease(prog(t, 0.6, 2.2)), 760 - 40 * math.sin(t * 2), 90, prog(t, 0.6, 1.0))
    return c


def scene1(t):  # 고려 말 혼란 -> 결탁 -> 조선 건국 (1392)
    c = bg_dark(t, (12, 4, 6))
    n = NARR
    tA, tB = 3.3, 6.5  # narration: 이성계와(3.6) / 1392(5.7) -> scene-local
    if t < tA + 0.3:
        shake = 10 * math.sin(t * 47) * (0.5 + 0.5 * math.sin(t * 3))
        red = Image.new("RGBA", (W, H), (120, 0, 0, int(40 + 30 * math.sin(t * 9))))
        c.alpha_composite(red)
        sc = 0.95 + 0.06 * t / tA
        paste(c, A["goryeo"], W * 0.36 + shake, H / 2 + 20, sc, 1.0, 2 * math.sin(t * 2))
        c = glitch(c, t, 0.4 + 0.6 * (0.5 + 0.5 * math.sin(t * 5)))
        paste(c, TXT["goryeo"], W * 0.75, H / 2 - 60, 1.0 + 0.04 * math.sin(t * 8), prog(t, 0.3, 0.6))
        paste(c, TXT["warn"], W * 0.75, H / 2 + 50, 1.0, prog(t, 0.9, 1.2))
    if tA - 0.2 < t < tB + 0.3:
        lt = t - tA
        img = cover(A["handshake"], lt, 1.0, 1.12, (0.5, 0.5), (0.5, 0.45), tB - tA)
        a = prog(t, tA - 0.2, tA + 0.2) * (1 - prog(t, tB, tB + 0.3))
        img = img.convert("RGBA")
        img.putalpha(int(255 * a))
        c.alpha_composite(img)
        paste(c, A["rays"].rotate(lt * 25, Image.BICUBIC), W / 2 + 40, H / 2 - 20, 1.0, 0.7 * a)
        sparkles(c, lt, W / 2 + 40, H / 2, 600, 40, 5)
    if t > tB:
        lt = t - tB
        sky = Image.new("RGBA", (W, H), (6, 18, 50, 255))
        c.alpha_composite(sky)
        paste(c, A["rays_blue"].rotate(lt * 10, Image.BICUBIC), W * 0.29, H / 2 - 40, 1.0, 0.8 * ease(prog(lt, 0, 0.6)))
        paste(c, A["joseon"], W * 0.29, H / 2 - 50, 0.82 + 0.03 * lt, ease(prog(lt, 0, 0.5)))
        paste(c, A["glow_gold"], W * 0.68, 380, 1.0, 0.7 * ease(prog(lt, 0.2, 0.8)))
        paste(c, TXT["1392"], W * 0.68, 360, 0.6 + 0.4 * ease_out_back(prog(lt, 0.15, 0.7)), prog(lt, 0.15, 0.4))
        paste(c, TXT["joseon"], W * 0.68, 580, 0.6 + 0.4 * ease_out_back(prog(lt, 0.5, 1.0)), prog(lt, 0.5, 0.7))
        sparkles(c, lt, W * 0.68, 420, 520, 45, 7)
    # flash on the handshake & at founding
    for ft in (tA, tB):
        f = 1 - prog(t, ft, ft + 0.35)
        if 0 < f < 1:
            c.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 240, int(230 * f))))
    case_tag(c, "CASE 01 · 새 나라의 탄생", 0.2, t)
    caption(c, "1392년, 유교로 새로워진 나라 '조선'!", 6.9, t)
    return c


def scene2(t):  # 한양 도성 지도 + 사대문
    dur = T_S3 - T_S2
    img = cover(A["map"], t, 1.5, 1.05, (0.5, 0.35), (0.5, 0.5), dur * 0.6).convert("RGBA")
    dim = 0.35 + 0.65 * (1 - ease(prog(t, 3.7, 4.6)))
    img = ImageEnhance.Brightness(img).enhance(dim)
    c = img
    # scanning "secret code" pulse over the map while narration poses the question
    if 0.5 < t < 5.0:
        sy = (t * 420) % H
        ov = Image.new("RGBA", (W, H))
        d = ImageDraw.Draw(ov)
        for k in range(30):
            d.line((0, sy - k * 3, W, sy - k * 3), fill=(0, 255, 170, int(90 * (1 - k / 30))), width=3)
        c.alpha_composite(ov)
        paste(c, TXT["code"], W / 2, 160 + 6 * math.sin(t * 8), 1.0, prog(t, 1.2, 1.6) * (1 - prog(t, 4.4, 4.9)))
        magnifier(c, 700 + 500 * ease(prog(t, 0.8, 4.0)), 520 + 120 * math.sin(t * 1.6), 120, prog(t, 0.6, 1.0) * (1 - prog(t, 4.2, 4.8)))
    # gates rise in 3D-ish (scale + vertical rise + shadow) on cue words
    # narration cues (video-local): 흥인지문 16.32, 숭례문 17.84, 돈의문 19.2 (narr) -> minus 10.1
    gates = [("gate_e", "in", "g_in", 6.15, W * 0.79, 1.0),
             ("gate_s", "ye", "g_ye", 7.65, W * 0.50, 1.0),
             ("gate_w", "ui", "g_ui", 9.0, W * 0.21, 1.0)]
    for key, lab, name, gt, gx, _ in gates:
        p = prog(t, gt - 0.2, gt + 0.5)
        if p <= 0:
            continue
        s = ease_out_back(p)
        gy = 560 + (1 - ease(p)) * 220
        paste(c, A["glow_gold"], gx, gy, 0.9, 0.55 * ease(p))
        # shadow
        sh = A[key].copy()
        sh = Image.merge("RGBA", (*[Image.new("L", sh.size, 0)] * 3, sh.getchannel("A").point(lambda v: v // 2)))
        paste(c, sh.filter(ImageFilter.GaussianBlur(10)), gx + 14, gy + 30, 1.3 * s)
        paste(c, A[key], gx, gy, 1.3 * s, ease(p))
        paste(c, TXT[name], gx, gy + 165, 1.0, prog(t, gt + 0.2, gt + 0.5))
        paste(c, TXT[lab], gx, gy - 210, 0.5 + 0.5 * ease_out_back(prog(t, gt + 0.15, gt + 0.6)), prog(t, gt + 0.15, gt + 0.35))
        sparkles(c, t - gt, gx, gy - 40, 300, 25, int(gt * 10))
    case_tag(c, "CASE 02 · 사대문의 비밀 코드", 0.2, t)
    caption(c, "한양 도성에 숨겨진 비밀 덕목 '인·의·예'!", 6.0, t)
    return c


def scene3(t):  # 근정전 & 박석
    dur = T_S4 - T_S3
    # palace shot: start wide high, push in on 근정전, then tilt down to the 박석 courtyard
    pal = A["palace"]
    tP = 3.4  # 박석 cue (narr 24.08 눈부심 -> local ~3.5)
    if t < tP:
        img = cover(pal, t, 1.45, 1.9, (0.55, 0.4), (0.6, 0.3), tP)
    else:
        img = cover(pal, t - tP, 1.9, 1.95, (0.6, 0.3), (0.5, 0.72), 1.6)
    img = img.convert("RGBA")
    warm = Image.new("RGBA", (W, H), (255, 150, 40, 40))  # golden-hour grade
    img.alpha_composite(warm)
    c = img
    if t < tP + 0.3:
        a = prog(t, 0.6, 1.2) * (1 - prog(t, tP - 0.2, tP + 0.2))
        paste(c, A["glow_gold"], W * 0.5, 430, 1.2, 0.8 * a)
        paste(c, TXT["geun"], W * 0.5, 400, 0.7 + 0.3 * ease_out_back(prog(t, 0.6, 1.2)), a)
        paste(c, TXT["geun_sub"], W * 0.5, 640, 1.0, a * prog(t, 1.0, 1.4))
    else:
        lt = t - tP
        magnifier(c, 760 + 120 * math.sin(lt * 1.2), 560 + 50 * math.cos(lt * 1.5), 170, prog(lt, 0, 0.5))
        paste(c, TXT["bakseok"], 760, 300, 0.6 + 0.4 * ease_out_back(prog(lt, 0.2, 0.7)), prog(lt, 0.2, 0.4))
        paste(c, TXT["b1"], 1450, 380, 0.6 + 0.4 * ease_out_back(prog(lt, 0.6, 1.1)), prog(lt, 0.6, 0.8))
        paste(c, TXT["b2"], 1450, 500, 0.6 + 0.4 * ease_out_back(prog(lt, 1.6, 2.1)), prog(lt, 1.6, 1.8))
        sparkles(c, lt, 760, 560, 260, 25, 11, (255, 255, 255))
    case_tag(c, "CASE 03 · 근정전의 지혜", 0.2, t)
    caption(c, "근정전에 새겨진 임금의 덕목과 박석의 지혜!", 5.4, t)
    return c


def scene4(t):  # 교육 기관 / 예절 교차 -> 질문
    c = bg_dark(t, (10, 14, 34))
    # split background: warm left (Joseon) / cool right (today)
    ov = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(ov)
    d.polygon([(0, 0), (W * 0.54, 0), (W * 0.46, H), (0, H)], fill=(70, 40, 10, 150))
    d.polygon([(W * 0.54, 0), (W, 0), (W, H), (W * 0.46, H)], fill=(10, 50, 90, 150))
    d.line((W * 0.54, 0, W * 0.46, H), fill=(255, 255, 255, 200), width=6)
    c.alpha_composite(ov)
    paste(c, TXT["then"], W * 0.36, 95, 1.0, prog(t, 0.1, 0.4))
    paste(c, TXT["now"], W * 0.66, 95, 1.0, prog(t, 1.2, 1.5))
    # left: 성균관 then 서당 (narr 30.4 교육 기관)
    p = ease_out_back(prog(t, 0.1, 0.6))
    paste(c, FR["sgk"], W * 0.17 - (1 - p) * 500, 370 + 6 * math.sin(t * 2), 1.0, prog(t, 0.1, 0.3), -3)
    p = ease_out_back(prog(t, 0.6, 1.1))
    paste(c, FR["seodang"], W * 0.31 - (1 - p) * 600, 700 + 6 * math.cos(t * 2), 1.0, prog(t, 0.6, 0.8), 4)
    # right: modern manners (narr 31.68 우리가 지키는 예절)
    p = ease_out_back(prog(t, 1.4, 1.9))
    paste(c, FR["bus"], W * 0.80 + (1 - p) * 600, 320 + 6 * math.sin(t * 2.2), 1.0, prog(t, 1.4, 1.6), 3)
    p = ease_out_back(prog(t, 2.0, 2.5))
    paste(c, FR["bow"], W * 0.63 + (1 - p) * 700, 745 + 6 * math.cos(t * 2.2), 1.0, prog(t, 2.0, 2.2), -4)
    # question mark (narr 33.6 유교는 어떻게... -> local 3.5)
    q = prog(t, 3.4, 3.9)
    if q > 0:
        dim = Image.new("RGBA", (W, H), (0, 0, 0, int(120 * ease(q))))
        c.alpha_composite(dim)
        paste(c, A["glow_gold"], W / 2, H / 2 - 60, 1.1, 0.7 * q)
        paste(c, TXT["q"], W / 2, H / 2 - 60 + 12 * math.sin(t * 4), 0.4 + 0.6 * ease_out_back(q), q, 8 * math.sin(t * 2))
        sparkles(c, t, W / 2, H / 2 - 60, 450, 40, 21)
    case_tag(c, "CASE 04 · 유교가 바꾼 삶", 0.2, t)
    caption(c, "유교 문화가 바꾼 조선, 지금 탐구를 시작합니다!", 4.6, t)
    return c


def scene_end(t):
    c = bg_dark(t, (4, 6, 16))
    paste(c, A["rays"].rotate(t * 15, Image.BICUBIC), W / 2, 380, 1.2, 0.55 * ease(prog(t, 0, 0.6)))
    paste(c, key_logo, W / 2, 380, 0.5 + 0.22 * ease_out_back(prog(t, 0.0, 0.6)), prog(t, 0, 0.3))
    paste(c, TXT["start"], W / 2, 650, 0.6 + 0.4 * ease_out_back(prog(t, 0.5, 1.0)), prog(t, 0.5, 0.7))
    if t > 1.2 and int(t * 2.5) % 2 == 0:
        paste(c, TXT["press"], W / 2, 830, 1.0, 1.0)
    sparkles(c, t, W / 2, 400, 800, 60, 31)
    fade = prog(t, TOTAL - T_END - 0.8, TOTAL - T_END)
    if fade > 0:
        c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * fade))))
    return c


key_logo = key_black(A["logo"], 10, 40)

SCENES = [(0, T_S1, scene_title), (T_S1, T_S2, scene1), (T_S2, T_S3, scene2),
          (T_S3, T_S4, scene3), (T_S4, T_END, scene4), (T_END, TOTAL, scene_end)]
XF = 0.35  # crossfade length


def render(t):
    for i, (a, b, fn) in enumerate(SCENES):
        if a <= t < b:
            fr = fn(t - a)
            # crossfade from the previous scene with a short whip-zoom feel
            if i > 0 and t - a < XF:
                pa, pb, pfn = SCENES[i - 1]
                prev = pfn(t - pa)
                k = ease((t - a) / XF)
                fr = Image.blend(prev, fr, k)
            break
    else:
        fr = scene_end(TOTAL - T_END - 0.01)
    fr.alpha_composite(A["vig"])
    g = A["grain"][int(t * FPS) % 6]
    fr = Image.blend(fr.convert("RGB"), Image.merge("RGB", (g, g, g)), 0.035)
    return fr


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    n = int(TOTAL * FPS)
    a = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    b = int(sys.argv[3]) if len(sys.argv) > 3 else n
    for f in range(a, min(b, n)):
        render(f / FPS).save(os.path.join(out, f"f{f:05d}.jpg"), quality=92)
        if f % 60 == 0:
            print("frame", f, flush=True)
