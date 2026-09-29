"""8비트 픽셀아트 게임 인트로 '민주주의와 선거' (20초).

480x270 저해상도 캔버스에 픽셀 단위로 그린 뒤 4배 nearest 업스케일 -> 1920x1080.
배경음(칩튠)도 numpy로 합성해 FFmpeg에서 함께 인코딩한다.

타임라인
  0.0~ 5.0  오프닝: GAME START 깜빡임 -> 평화로운 마을 -> 어두워짐(번개·비)
  5.0~12.0  전개: 기사가 투표함 획득 -> 빛이 퍼지며 마을 복구
 12.0~20.0  엔딩: 퀘스트 창 + 수업 제목
"""
import math
import os
import random
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

LW, LH, SCALE, FPS, DUR = 480, 270, 4, 30, 20.0
WW = 720          # 월드 너비
GROUND = 200      # 지면 y
BOX_X, BOX_Y = 470, 150   # 투표함 월드 좌표(중심)
HERE = os.path.dirname(os.path.abspath(__file__))


def F(name, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", name), size)


F12, F12B, F24B, F36B = F("Galmuri11.ttf", 12), F("Galmuri11-Bold.ttf", 12), F("Galmuri11-Bold.ttf", 24), F("Galmuri11-Bold.ttf", 36)

WHITE, YELLOW, GOLD, CYAN, BLACK = (255, 255, 255), (255, 224, 70), (250, 190, 50), (110, 220, 255), (0, 0, 0)
YY, XX = np.mgrid[0:LH, 0:LW].astype(np.float32)
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


# ---------------------------------------------------------------- 유틸
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def seg(t, s, d):
    return clamp((t - s) / d)


def ease_out(x):
    return 1 - (1 - clamp(x)) ** 3


def back_out(x):
    x = clamp(x)
    c = 1.9
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def pil(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def npf(img):
    return np.asarray(img, dtype=np.float32)[..., :3].copy()


def drw(img):
    d = ImageDraw.Draw(img)
    d.fontmode = "1"   # 안티앨리어싱 끔 -> 픽셀 폰트 그대로
    return d


def text(d, xy, s, font, fill, anchor="mm", shadow=(20, 12, 40), sh=1):
    if shadow is not None:
        d.text((xy[0] + sh, xy[1] + sh), s, font=font, fill=shadow, anchor=anchor)
    d.text(xy, s, font=font, fill=fill, anchor=anchor)


def dither_gradient(colors, h, w):
    """Bayer 디더링으로 계단식 그라데이션 (레트로 하늘)."""
    ys, xs = np.mgrid[0:h, 0:w]
    v = ys / (h - 1) * (len(colors) - 1)
    i = np.floor(v).astype(int)
    frac = v - i
    i2 = np.minimum(i + 1, len(colors) - 1)
    pick = np.where(frac > BAYER[ys % 4, xs % 4], i2, i)
    return np.array(colors, dtype=np.float32)[pick]


# ---------------------------------------------------------------- 스프라이트
PAL = {"K": (24, 20, 40), "B": (70, 110, 230), "b": (40, 60, 150), "L": (170, 210, 255),
       "R": (230, 50, 60), "r": (150, 25, 45), "G": (200, 200, 215), "Y": (250, 200, 60),
       "W": (255, 255, 255), "k": (40, 40, 60), "y": (255, 240, 150), "O": (200, 120, 30),
       "P": (180, 90, 230), "C": (80, 220, 255), "E": (90, 230, 120)}

TOP = [".....RR.......", "....RRr.......", "...KKKKKK.....", "..KLLBBBBK....", "..KLBBBBBBK...",
       "..KBBKKKKKK...", "..KBBBBBBBK...", "...KBBBBBK....", "..rKGYYYGK....", ".rRKBBLBBBK...",
       ".rRKBLBBBKGK..", ".rRKBBBBBKGK..", ".rRKbbbbbKK...", "..rKYYYYYK...."]
TOP_HOLD = [".G...RR....G..", ".KG.RRr...GK..", ".KBKKKKKK.BK..", "..KLLBBBBKBK..", "..KLBBBBBBK...",
            "..KBBKKKKKK...", "..KBBBBBBBK...", "...KBBBBBK....", "..rKGYYYGK....", ".rRKBBLBBK....",
            ".rRKBLBBBK....", ".rRKBBBBBK....", ".rRKbbbbbK....", "..rKYYYYYK...."]
LEG_A = ["...KBBKBBK....", "...KBK.KBK....", "..KBK...KBK...", ".KbbK...KbbK..", ".KKKK...KKKK.."]
LEG_B = ["...KBBBBK.....", "....KBBK......", "....KBBK......", "...KbbbbK.....", "...KKKKKK....."]
LEG_J = ["...KBBKBBK....", "..KBBK.KBBK...", "..KbbK.KbbK...", "..KKK...KKK...", ".............."]
BOX = ["......WWWW......", "......WkWW......", "......WWkW......", "KKKKKKKKKKKKKKKK",
       "KyyyyKKKKKKyyyyK", "KYYYYYYYYYYYYYOK", "KYYYYYYYYYYYYYOK", "KYYYYKKKKKKYYYOK",
       "KYYYYKWWWWKYYYOK", "KYYYYKKKKKKYYYOK", "KYYYYYYYYYYYYYOK", "KOOOOOOOOOOOOOOK",
       "KKKKKKKKKKKKKKKK"]
HEART = [".RR.RR.", "RWRRRRR", "RRRRRRR", ".RRRRR.", "..RRR..", "...R..."]
GEM = ["..XXX..", ".XWXXX.", "XWXXXXX", ".XXXXX.", "..XXX..", "...X..."]


def sprite(rows, scale=1, sub=None):
    h, w = len(rows), max(len(r) for r in rows)
    a = np.zeros((h, w, 4), np.float32)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == ".":
                continue
            c = sub if (ch == "X" and sub) else PAL[ch]
            a[y, x] = (*c, 255)
    return np.repeat(np.repeat(a, scale, 0), scale, 1)


KNIGHT = {"a": sprite(TOP + LEG_A, 2), "b": sprite(TOP + LEG_B, 2),
          "j": sprite(TOP + LEG_J, 2), "h": sprite(TOP_HOLD + LEG_B, 2)}
BOX_S = sprite(BOX, 2)
ICONS = [sprite(HEART, 2), sprite(GEM, 2, PAL["C"]), sprite(GEM, 2, PAL["E"]),
         sprite(GEM, 2, PAL["P"]), sprite(HEART, 1)]


def blit(arr, spr, x, y, flip=False):
    """좌상단 (x,y)에 RGBA 스프라이트 합성 (투명 픽셀 제외)."""
    if flip:
        spr = spr[:, ::-1]
    x, y = int(round(x)), int(round(y))
    h, w = spr.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, LW), min(y + h, LH)
    if x0 >= x1 or y0 >= y1:
        return
    s = spr[y0 - y:y1 - y, x0 - x:x1 - x]
    m = s[..., 3:4] > 0
    arr[y0:y1, x0:x1] = np.where(m, s[..., :3], arr[y0:y1, x0:x1])


def sparkle(arr, x, y, size, color=WHITE):
    x, y = int(x), int(y)
    for k in range(-size, size + 1):
        for px, py in ((x + k, y), (x, y + k)):
            if 0 <= px < LW and 0 <= py < LH:
                arr[py, px] = color if abs(k) < size else (255, 240, 160)


# ---------------------------------------------------------------- 월드(정적 레이어)
OUT = (30, 24, 40)


def build_layers():
    rnd = random.Random(7)
    # 하늘
    sky = dither_gradient([(40, 80, 210), (60, 120, 240), (90, 155, 250), (140, 190, 255), (190, 225, 255)], LH, LW)

    # 산 (패럴랙스 0.5)
    mnt = Image.new("RGBA", (LW + WW // 2, LH), (0, 0, 0, 0))
    d = ImageDraw.Draw(mnt)
    for i, (mx, mh, col) in enumerate([(40, 70, (70, 130, 150)), (150, 95, (60, 115, 140)), (270, 60, (80, 140, 150)),
                                       (380, 90, (60, 115, 140)), (500, 75, (70, 130, 150)), (620, 100, (60, 115, 140)),
                                       (740, 65, (80, 140, 150))]):
        top = GROUND - mh
        d.polygon([(mx - 90, GROUND), (mx, top), (mx + 90, GROUND)], fill=col)
        d.polygon([(mx - 16, top + 16), (mx, top), (mx + 16, top + 16), (mx + 6, top + 12), (mx, top + 18), (mx - 7, top + 12)],
                  fill=(235, 245, 255))
    # 언덕
    for hx in range(-40, LW + WW // 2 + 60, 70):
        d.ellipse([hx, GROUND - 28, hx + 110, GROUND + 30], fill=(60, 160, 80))

    wl = Image.new("RGBA", (WW, LH), (0, 0, 0, 0))
    d = ImageDraw.Draw(wl)
    # 성
    stone, stone_d = (170, 165, 185), (120, 115, 140)
    d.rectangle([570, 125, 690, GROUND], fill=stone, outline=OUT)
    for x in range(570, 690, 12):
        d.rectangle([x, 119, x + 6, 125], fill=stone, outline=OUT)
    for tx in (556, 676):
        d.rectangle([tx, 100, tx + 28, GROUND], fill=stone, outline=OUT)
        d.polygon([(tx - 4, 100), (tx + 14, 72), (tx + 32, 100)], fill=(60, 90, 200), outline=OUT)
        d.rectangle([tx + 11, 115, tx + 16, 125], fill=(255, 220, 100), outline=OUT)
    d.rectangle([612, 92, 648, 125], fill=stone, outline=OUT)
    d.polygon([(608, 92), (630, 62), (652, 92)], fill=(200, 50, 70), outline=OUT)
    d.rectangle([616, 150, 644, GROUND], fill=(70, 45, 35), outline=OUT)
    d.ellipse([616, 138, 644, 162], fill=(70, 45, 35), outline=OUT)
    d.rectangle([617, 150, 643, 199], fill=(70, 45, 35))
    for y in range(132, GROUND, 9):
        for x in range(572 + (y // 9 % 2) * 6, 688, 12):
            d.point((x, y), fill=stone_d)
    d.line([(630, 62), (630, 44)], fill=OUT)

    # 집
    def house(x, w, h, wall, roof):
        b = GROUND
        d.rectangle([x + w // 2 + 6, b - h - h * 0.55, x + w // 2 + 12, b - h], fill=(150, 80, 60), outline=OUT)
        d.rectangle([x, b - h, x + w, b - 1], fill=wall, outline=OUT)
        d.polygon([(x - 5, b - h), (x + w / 2, b - h - h * 0.6), (x + w + 5, b - h)], fill=roof, outline=OUT)
        d.rectangle([x + w // 2 - 5, b - 16, x + w // 2 + 5, b - 1], fill=(120, 70, 40), outline=OUT)
        for wx in (x + 6, x + w - 16):
            d.rectangle([wx, b - h + 8, wx + 10, b - h + 18], fill=(255, 220, 100), outline=OUT)
            d.line([(wx + 5, b - h + 8), (wx + 5, b - h + 18)], fill=OUT)
            d.line([(wx, b - h + 13), (wx + 10, b - h + 13)], fill=OUT)

    house(18, 52, 40, (245, 225, 190), (220, 70, 60))
    house(112, 44, 34, (200, 230, 250), (60, 110, 210))
    house(198, 56, 44, (250, 210, 220), (90, 170, 80))
    house(292, 46, 36, (255, 240, 170), (230, 130, 40))
    # 나무
    for tx in (86, 172, 270, 360, 530, 708):
        d.rectangle([tx - 2, GROUND - 16, tx + 2, GROUND], fill=(110, 70, 40), outline=OUT)
        d.ellipse([tx - 12, GROUND - 40, tx + 12, GROUND - 12], fill=(50, 150, 60), outline=OUT)
        d.ellipse([tx - 7, GROUND - 36, tx + 1, GROUND - 28], fill=(110, 210, 90))
    # 울타리
    for fx in range(372, 436, 8):
        d.rectangle([fx, GROUND - 12, fx + 3, GROUND], fill=(230, 200, 150), outline=OUT)
    d.line([(372, GROUND - 8), (436, GROUND - 8)], fill=OUT)
    # 제단
    d.rectangle([446, GROUND - 8, 494, GROUND], fill=(150, 150, 170), outline=OUT)
    d.rectangle([454, GROUND - 16, 486, GROUND - 8], fill=(175, 175, 195), outline=OUT)
    d.point([(460, GROUND - 12), (470, GROUND - 12), (480, GROUND - 12)], fill=(90, 230, 160))
    # 땅
    d.rectangle([0, GROUND, WW, GROUND + 4], fill=(90, 200, 70))
    d.rectangle([0, GROUND + 5, WW, LH], fill=(140, 90, 50))
    for _ in range(900):
        x, y = rnd.randrange(WW), rnd.randrange(GROUND + 6, LH)
        d.rectangle([x, y, x + 2, y + 1], fill=rnd.choice([(115, 72, 42), (160, 108, 62), (125, 80, 46)]))
    for x in range(0, WW, 3):
        if rnd.random() < 0.5:
            d.point((x, GROUND - 1), fill=(140, 230, 90))
    flowers = [(255, 90, 120), (255, 230, 80), (240, 240, 255), (180, 110, 255)]
    for _ in range(80):
        x = rnd.randrange(WW)
        c = rnd.choice(flowers)
        d.point([(x, GROUND - 2), (x - 1, GROUND - 3), (x + 1, GROUND - 3), (x, GROUND - 4)], fill=c)
        d.point((x, GROUND - 3), fill=(255, 250, 200))
    return sky, np.asarray(mnt, np.float32), np.asarray(wl, np.float32)


SKY, MNT, WORLD = build_layers()


def cloud_sprite(w, col, shade):
    img = Image.new("RGBA", (w, w // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    h = w // 2
    for cx, cy, r in ((w * .3, h * .62, h * .36), (w * .52, h * .45, h * .45), (w * .74, h * .62, h * .32)):
        d.ellipse([cx - r, cy - r + 2, cx + r, cy + r + 2], fill=shade)
    for cx, cy, r in ((w * .3, h * .62, h * .36), (w * .52, h * .45, h * .45), (w * .74, h * .62, h * .32)):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    d.rectangle([w * .2, h * .66, w * .82, h * .9], fill=col)
    return np.asarray(img, np.float32)


CLOUD = cloud_sprite(60, (255, 255, 255, 255), (200, 215, 240, 255))
STORM = cloud_sprite(110, (60, 55, 80, 255), (35, 30, 50, 255))


def comp_layer(arr, layer, ox):
    s = layer[:, ox:ox + LW]
    m = s[..., 3:4] > 0
    arr[:] = np.where(m, s[..., :3], arr)


def world_color(cam, t):
    a = SKY.copy()
    # 해
    d2 = (XX - 60) ** 2 + (YY - 44) ** 2
    a[d2 < 17 ** 2] = (255, 200, 70)
    a[d2 < 14 ** 2] = (255, 240, 120)
    for i, (x0, y0) in enumerate(((20, 30), (180, 55), (330, 25), (470, 60), (620, 35))):
        x = (x0 + t * (6 + i)) % (LW + 120) - 60 - cam * 0.2
        blit(a, CLOUD, x % (LW + 120) - 60, y0)
    comp_layer(a, MNT, int(cam * 0.5))
    comp_layer(a, WORLD, int(cam))
    # 깃발
    fx = 630 - cam
    for k in range(14):
        wy = int(round(math.sin(t * 8 - k * 0.6) * 1.5))
        for j in range(8):
            px, py = int(fx + 1 + k), 44 + j + wy
            if 0 <= px < LW:
                a[py, px] = (255, 220, 60) if 2 < j < 6 and 4 < k < 10 else (60, 110, 230)
    return a


def darkify(a):
    lum = a @ np.array([0.3, 0.59, 0.11], np.float32)
    out = np.stack([lum * 0.26 + 16, lum * 0.24 + 12, lum * 0.36 + 32], -1)
    return np.floor(out / 8) * 8


def storm(a, cam, t, mask=None):
    """어두운 하늘용 먹구름 + 비."""
    b = a.copy()
    for i, x0 in enumerate((-30, 70, 170, 270, 370, 470)):
        blit(b, STORM, x0 + math.sin(t * 0.7 + i) * 6 - (cam * 0.3) % 100, 4 + (i % 2) * 14)
    rnd = np.random.default_rng(3)
    xs, ys = rnd.uniform(0, LW, 220), rnd.uniform(0, LH, 220)
    for x, y in zip(xs, ys):
        yy = (y + t * 260) % LH
        xx = (x - t * 70) % LW
        for k in range(4):
            px, py = int(xx - k * 0.3), int(yy + k)
            if 0 <= px < LW and 0 <= py < GROUND + 40:
                b[py, px] = (130, 140, 200)
    if mask is not None:
        b = np.where(mask[..., None], a, b)
    return b


def glow(a, cx, cy, radius, inten, color=(255, 220, 120)):
    g = np.exp(-((XX - cx) ** 2 + (YY - cy) ** 2) / radius ** 2) * inten
    g = np.floor(g * 5) / 5            # 계단형(픽셀) 광
    a += g[..., None] * np.array(color, np.float32) * 0.5


def rays(a, cx, cy, rot, r0, r1, inten, n=10, color=(255, 230, 120)):
    ang = np.arctan2(YY - cy, XX - cx)
    d = np.hypot(XX - cx, YY - cy)
    m = (np.cos(n * (ang - rot)) > 0.82) & (d > r0) & (d < r1)
    f = np.where(m, (1 - d / r1) * inten, 0)
    f = np.floor(f * 4) / 4
    a += f[..., None] * np.array(color, np.float32)


def mosaic(a, b):
    if b <= 1:
        return a
    s = a[::b, ::b]
    return np.repeat(np.repeat(s, b, 0), b, 1)[:LH, :LW]


# ---------------------------------------------------------------- UI
def box_frame(d, x0, y0, x1, y1, fill=(12, 14, 36), border=WHITE, border2=None):
    d.rectangle([x0 + 2, y0, x1 - 2, y1], fill=fill)
    d.rectangle([x0, y0 + 2, x1, y1 - 2], fill=fill)
    d.line([(x0 + 2, y0), (x1 - 2, y0)], fill=border, width=1)
    d.line([(x0 + 2, y1), (x1 - 2, y1)], fill=border, width=1)
    d.line([(x0, y0 + 2), (x0, y1 - 2)], fill=border, width=1)
    d.line([(x1, y0 + 2), (x1, y1 - 2)], fill=border, width=1)
    d.point([(x0 + 1, y0 + 1), (x1 - 1, y0 + 1), (x0 + 1, y1 - 1), (x1 - 1, y1 - 1)], fill=border)
    if border2:
        d.rectangle([x0 + 3, y0 + 3, x1 - 3, y1 - 3], outline=border2)


def typed(segs, t, cps=18):
    """segs: [(start, text, color)] -> 지금 보이는 [(text, color)]"""
    out = []
    for s, txt, col in segs:
        n = int((t - s) * cps)
        if n > 0:
            out.append((txt[:n], col))
    return out


def seg_chars(segs, cps=18):
    return [s + (i + 1) / cps for s, txt, _ in segs for i, ch in enumerate(txt) if ch != " "]


def subtitle(a, segs, t, alpha=1.0):
    vis = typed(segs, t)
    img = pil(a)
    d = drw(img)
    box_frame(d, 24, 224, 456, 252)
    full = "".join(txt for _, txt, _ in segs)
    x = LW / 2 - F12.getlength(full) / 2
    for txt, col in vis:
        text(d, (x, 238), txt, F12, col, anchor="lm")
        x += F12.getlength(txt)
    if vis and int(t * 3) % 2 == 0 and len("".join(v for v, _ in vis)) == len(full):
        d.polygon([(446, 245), (452, 245), (449, 248)], fill=WHITE)
    return npf(img)


def hud(a, t, score, hp=3):
    img = pil(a)
    d = drw(img)
    d.rectangle([0, 0, LW, 15], fill=(8, 8, 20))
    d.line([(0, 16), (LW, 16)], fill=(60, 60, 110))
    text(d, (8, 8), "HP", F12B, WHITE, anchor="lm")
    arr = npf(img)
    for i in range(hp):
        blit(arr, ICONS[4], 26 + i * 9, 5)
    img = pil(arr)
    d = drw(img)
    text(d, (LW / 2, 8), f"SCORE {score:06d}", F12B, WHITE)
    text(d, (LW - 8, 8), "STAGE 1-1", F12B, CYAN, anchor="rm")
    return npf(img)


def knight(a, x, feet_y, frame, flip=False):
    spr = KNIGHT[frame]
    blit(a, spr, x - spr.shape[1] / 2, feet_y - spr.shape[0], flip)


# ---------------------------------------------------------------- 자막/이벤트 타이밍
SUB1 = [(3.0, "대표를 잘못 뽑아 혼란에 빠진 픽셀 왕국...!", WHITE)]
SUB2 = [(5.5, "세상을 바꾸는 단 하나의 아이템... ", WHITE), (8.6, "소중한 한 표!", YELLOW)]
MSG = [(15.3, "당신의 한 표로 왕국의 운명을 결정하세요!", YELLOW)]
TITLE = "민주주의와 선거"
PICK = 8.2            # 투표함 획득 시각
LIGHTNING = (3.35, 4.1)


# ---------------------------------------------------------------- 장면
STARS = np.random.default_rng(11).uniform(0, 1, (120, 3))


def starfield(a, t):
    for i, (x, y, ph) in enumerate(STARS):
        px, py = int(x * LW), int(y * LH)
        tw = math.sin(t * 4 + ph * 20)
        if i % 12 == 0:
            sparkle(a, px, py, 2 if tw > 0 else 1, (200, 220, 255))
        elif tw > -0.3:
            a[py, px] = (150, 160, 220) if tw < 0.5 else (240, 240, 255)


def title_screen(t):
    a = np.zeros((LH, LW, 3), np.float32)
    a[:] = (6, 6, 18)
    starfield(a, t)
    img = pil(a)
    d = drw(img)
    period = 0.4 if t < 1.1 else 0.1
    if int(t / period) % 2 == 0:
        text(d, (LW / 2, LH / 2 - 6), "GAME START", F36B, YELLOW, shadow=(150, 60, 20), sh=3)
    text(d, (LW / 2, LH / 2 + 30), "PLAYER 1", F12B, (180, 180, 220))
    text(d, (LW / 2, LH - 20), "(C) PIXEL KINGDOM  DEMOCRACY QUEST", F12, (110, 110, 160))
    return npf(img)


def scene1(t):
    cam = 0
    c = world_color(cam, t)
    dk = seg(t, 2.9, 1.0)
    dk = math.floor(dk * 5) / 5          # 팔레트 페이드처럼 단계적으로
    if dk > 0:
        dark = storm(darkify(c), cam, t)
        a = c * (1 - dk) + dark * dk
    else:
        a = c
        # 새
        for i in range(3):
            bx = 80 + i * 26 + (t - 1.6) * 60
            by = 70 + i * 6 + math.sin(t * 6 + i) * 3
            wing = int(t * 8 + i) % 2
            for dx, dy in ((-2, -wing), (-1, 0), (0, 1), (1, 0), (2, -wing)):
                a[int(by + dy), int(bx + dx)] = OUT
    for lt in LIGHTNING:
        if 0 <= t - lt < 0.15:
            rnd = random.Random(int(lt * 10))
            img = pil(a)
            d = drw(img)
            x, y = rnd.randint(160, 400), 0
            pts = [(x, y)]
            while y < 150:
                x += rnd.randint(-14, 14)
                y += rnd.randint(12, 22)
                pts.append((x, y))
            d.line(pts, fill=(255, 255, 220), width=2)
            a = npf(img)
            f = 0.55 if t - lt < 0.07 else 0.25
            a = a * (1 - f) + np.array([230, 230, 255]) * f
    if t > 2.4:
        a = hud(a, t, 0)
    if t >= 3.0:
        a = subtitle(a, SUB1, t)
    # 아이리스 인 (1.6~2.1)
    r = ease_out(seg(t, 1.6, 0.5)) * 300
    a = np.where((((XX - LW / 2) ** 2 + (YY - LH / 2) ** 2) < r * r)[..., None], a, 0)
    # 마지막 0.3초: 모자이크 전환 없이 이어짐
    return a


def player_state(tl):
    """scene2 로컬 시간 -> (x, feet_y, frame)"""
    if tl < 0.3:
        return -30, GROUND, "a"
    if tl < 3.0:
        p = (tl - 0.3) / 2.7
        x = -30 + (BOX_X - (-30)) * (1 - (1 - p) ** 1.6)
        return x, GROUND, "a" if int(tl / 0.12) % 2 == 0 else "b"
    jt = tl - 3.0
    if jt < 0.4:
        return BOX_X, GROUND - math.sin(jt / 0.4 * math.pi) * 34, "j"
    return BOX_X, GROUND, "h"


def scene2(tl):
    t = tl + 5.0
    px, py, fr = player_state(tl)
    cam = clamp(px - 220, 0, 240)
    c = world_color(cam, t)
    bx, by = BOX_X - cam, BOX_Y + math.sin(t * 3) * 3
    picked = t >= PICK
    # 빛의 확산
    r = 0 if not picked else ease_out(seg(t, PICK + 0.15, 2.2)) * 560
    cx, cy = bx, GROUND - 40
    inside = ((XX - cx) ** 2 + (YY - cy) ** 2) < r * r
    dark = darkify(c)
    if r < 560:
        dark = storm(dark, cam, t, inside)
        a = np.where(inside[..., None], c, dark)
        ring = np.abs(np.hypot(XX - cx, YY - cy) - r) < 2.5
        chk = ((XX.astype(int) + YY.astype(int)) % 2 == 0)
        a = np.where((ring & chk)[..., None], np.array([255, 245, 190], np.float32), a)
    else:
        a = c
    # 투표함 등장 빛기둥 (0~0.7s)
    if tl < 0.9:
        k = seg(tl, 0, 0.35) * (1 - seg(tl, 0.6, 0.3))
        col = np.abs(XX - bx) < (6 + 4 * k)
        a = np.where((col & (YY < by + 10))[..., None], a * (1 - k * 0.7) + np.array([255, 250, 200]) * k * 0.7, a)
    box_vis = tl > 0.35
    if not picked and box_vis:
        glow(a, bx, by, 34 + 4 * math.sin(t * 5), 1.0)
        rays(a, bx, by, t * 0.8, 16, 48, 0.9)
    if picked:
        hold = t < PICK + 3.2
        k = 1 - seg(t, PICK, 3.5) * 0.5
        glow(a, px - cam, py - 50, 40, k)
        rays(a, px - cam, py - 50, t * 1.2, 16, 70 * k, 0.8 * k, n=12)
    # 기사
    knight(a, px - cam, py, fr)
    if box_vis:
        if picked:
            blit(a, BOX_S, px - cam - 16, py - 38 - 30 + math.sin(t * 4) * 1.5)
        else:
            blit(a, BOX_S, bx - 16, by - 13)
    # 반짝이 + 아이템 아이콘 상승
    rnd = random.Random(5)
    if box_vis:
        for i in range(10):
            ang = rnd.uniform(0, 6.28)
            rr = 22 + rnd.uniform(0, 18)
            cxs, cys = (px - cam, py - 55) if picked else (bx, by)
            ph = t * 3 + i
            if math.sin(ph) > 0.3:
                sparkle(a, cxs + math.cos(ang + t * 0.5) * rr, cys + math.sin(ang + t * 0.5) * rr, 2 if math.sin(ph) > 0.8 else 1)
    if picked:
        for i in range(16):
            s0 = PICK + 0.4 + i * 0.16
            if t < s0:
                continue
            u = t - s0
            ix = BOX_X - cam + rnd.uniform(-150, 150) + math.sin(u * 3 + i) * 6
            iy = GROUND - 30 - u * rnd.uniform(35, 60)
            if iy > 20:
                blit(a, ICONS[i % 4], ix, iy)
    # 흰 섬광 + 화면 흔들림
    if picked and t - PICK < 0.12:
        a = a * 0.2 + 255 * 0.8
    if picked and t - PICK < 0.4:
        s = int(3 * (1 - (t - PICK) / 0.4))
        a = np.roll(a, (random.Random(int(t * 30)).randint(-s, s), random.Random(int(t * 31)).randint(-s, s)), (0, 1))
    score = int(1000 * ease_out(seg(t, PICK + 0.3, 0.8)))
    a = hud(a, t, score)
    img = pil(a)
    d = drw(img)
    if picked and t < PICK + 3.4:
        p = back_out(seg(t, PICK + 0.2, 0.3))
        if p > 0:
            w = max(4, int(66 * p))
            x0, y0 = int(px - cam), 34
            box_frame(d, x0 - w, y0, x0 + w, y0 + 34, border=YELLOW)
            if p > 0.95:
                text(d, (x0, y0 + 10), "ITEM GET!", F12B, YELLOW)
                text(d, (x0, y0 + 24), "소중한 한 표 x1", F12, WHITE)
        u = t - PICK - 0.3
        if 0 < u < 1.2:
            text(d, (px - cam + 30, py - 70 - u * 20), "+1000", F12B, (120, 255, 140))
    a = npf(img)
    if tl >= 0.5:
        a = subtitle(a, SUB2, t)
    # 장면 끝 모자이크 전환
    a = mosaic(a, 1 + int(seg(t, 11.6, 0.4) * 9))
    return a


FIREWORKS = [(12.9, 90, 60, (255, 90, 120)), (13.4, 400, 50, (110, 220, 255)), (14.2, 60, 150, (255, 224, 70)),
             (15.0, 430, 150, (140, 255, 140)), (16.0, 100, 50, (200, 120, 255)), (17.0, 390, 60, (255, 160, 60)),
             (18.0, 70, 140, (110, 220, 255)), (18.8, 420, 140, (255, 90, 120))]


def scene3(tl):
    t = tl + 12.0
    cam = 240
    a = world_color(cam, t) * 0.35 + np.array([10, 10, 40]) * 0.65
    rays(a, LW / 2, 120, t * 0.4, 0, 300, 0.35, n=14, color=(255, 200, 90))
    # 불꽃놀이
    for ft, fx, fy, col in FIREWORKS:
        u = t - ft
        if 0 <= u < 1.3:
            for k in range(24):
                ang = k / 24 * 6.283
                rr = 50 * ease_out(u / 0.9)
                x = fx + math.cos(ang) * rr
                y = fy + math.sin(ang) * rr + 14 * u * u
                if 0 <= x < LW - 1 and 0 <= y < LH - 1 and (u < 0.9 or k % 2 == int(u * 20) % 2):
                    a[int(y):int(y) + 2, int(x):int(x) + 2] = col if u < 0.8 else WHITE
    # 색종이
    rnd = random.Random(9)
    for i in range(60):
        s0 = 12.6 + rnd.uniform(0, 5)
        if t > s0:
            x = rnd.uniform(0, LW) + math.sin((t - s0) * 3 + i) * 8
            y = -4 + (t - s0) * rnd.uniform(30, 55)
            if 0 <= x < LW - 1 and 0 <= y < LH - 1:
                a[int(y):int(y) + 2, int(x):int(x) + 2] = rnd.choice([(255, 90, 120), (255, 224, 70), (110, 220, 255), (140, 255, 140)])

    # 퀘스트 창: 가로로 열린 뒤 세로로 열림
    X0, Y0, X1, Y1 = 46, 36, 434, 214
    cxw, cyw = (X0 + X1) / 2, (Y0 + Y1) / 2
    ow = ease_out(seg(t, 12.35, 0.25))
    oh = ease_out(seg(t, 12.6, 0.25))
    img = pil(a)
    d = drw(img)
    if ow > 0:
        hw = max(4, (X1 - X0) / 2 * ow)
        hh = max(3, (Y1 - Y0) / 2 * oh)
        box_frame(d, cxw - hw, cyw - hh, cxw + hw, cyw + hh, fill=(14, 16, 48), border=WHITE, border2=(250, 190, 50))
    a = npf(img)
    if oh >= 1:
        # 헤더 탭
        img = pil(a)
        d = drw(img)
        p = back_out(seg(t, 12.9, 0.3))
        if p > 0:
            tw = 78 * p
            box_frame(d, LW / 2 - tw, Y0 - 9, LW / 2 + tw, Y0 + 9, fill=(250, 190, 50), border=WHITE)
            if p > 0.9:
                text(d, (LW / 2, Y0), "★ DEMOCRACY QUEST ★", F12B, (40, 20, 10), shadow=None)
        # STAGE 1
        s = ease_out(seg(t, 13.2, 0.3))
        if s > 0:
            text(d, (LW / 2 + (1 - s) * 60, Y0 + 26), "- STAGE 1 -", F12B, CYAN)
        # 제목: 글자별로 튀어오름
        tx = LW / 2 - F36B.getlength(TITLE) / 2
        for i, ch in enumerate(TITLE):
            u = seg(t, 13.6 + i * 0.1, 0.3)
            if u > 0:
                dy = (1 - back_out(u)) * -16
                text(d, (tx, Y0 + 62 + dy), ch, F36B, WHITE, anchor="lm", shadow=(120, 60, 20), sh=2)
            tx += F36B.getlength(ch)
        if t > 14.7:
            text(d, (LW / 2, Y0 + 96), "주권 실현과 국민 참여의 길", F12B, (210, 215, 255))
            d.line([(X0 + 30, Y0 + 112), (X1 - 30, Y0 + 112)], fill=(80, 80, 150))
        vis = typed(MSG, t, 12)
        full = MSG[0][1]
        x = LW / 2 - F12B.getlength(full) / 2
        for txt, col in vis:
            text(d, (x, Y0 + 132), txt, F12B, col, anchor="lm")
        if t > 18.9 and int(t * 3) % 2 == 0:
            d.polygon([(X1 - 18, Y1 - 14), (X1 - 10, Y1 - 14), (X1 - 14, Y1 - 10)], fill=WHITE)
        a = npf(img)
        if t > 13.2:
            blit(a, BOX_S, LW / 2 - 90 - 16, Y0 + 14 + math.sin(t * 4) * 1.5)
            blit(a, BOX_S, LW / 2 + 90 - 16, Y0 + 14 + math.sin(t * 4 + 1) * 1.5)
            for i in range(6):
                if math.sin(t * 5 + i * 1.7) > 0.5:
                    sparkle(a, LW / 2 + (-1) ** i * (70 + i * 8), Y0 + 20 + (i % 3) * 8, 2)
    if t > 17.2 and int((t - 17.2) / 0.35) % 2 == 0:
        img = pil(a)
        text(drw(img), (LW / 2, 240), "[ PRESS START ]", F24B, YELLOW, shadow=(150, 60, 20), sh=2)
        a = npf(img)
    a = mosaic(a, 1 + int((1 - seg(t, 12.0, 0.35)) * 9))
    return a


def frame(t):
    if t < 1.6:
        a = title_screen(t)
    elif t < 5.0:
        a = scene1(t)
    elif t < 12.0:
        a = scene2(t - 5.0)
    else:
        a = scene3(t - 12.0)
    a = np.clip(a, 0, 255).astype(np.uint8)
    big = np.repeat(np.repeat(a, SCALE, 0), SCALE, 1)
    big[SCALE - 1::SCALE] = (big[SCALE - 1::SCALE] * 0.86).astype(np.uint8)   # 은은한 CRT 스캔라인
    return big


# ---------------------------------------------------------------- 칩튠 사운드
SR = 44100


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Mixer:
    def __init__(self, dur):
        self.buf = np.zeros(int(SR * (dur + 1)), np.float32)

    def add(self, t0, sig):
        i = int(t0 * SR)
        n = min(len(sig), len(self.buf) - i)
        if n > 0:
            self.buf[i:i + n] += sig[:n]

    @staticmethod
    def env(n, a=0.004, r=0.03, decay=0.0):
        e = np.ones(n, np.float32)
        na, nr = min(int(a * SR), n // 2), min(int(r * SR), n // 2)
        if na:
            e[:na] = np.linspace(0, 1, na)
        if nr:
            e[-nr:] *= np.linspace(1, 0, nr)
        if decay:
            e *= np.exp(-np.arange(n) / SR * decay)
        return e

    def tone(self, t0, freq, dur, vol=0.12, wave="sq", duty=0.5, decay=0.0, freq_end=None):
        n = int(dur * SR)
        f = np.full(n, freq, np.float32) if freq_end is None else np.geomspace(freq, freq_end, n).astype(np.float32)
        ph = np.cumsum(f) / SR % 1.0
        if wave == "sq":
            s = np.where(ph < duty, 1.0, -1.0)
        else:
            s = 2 * np.abs(2 * ph - 1) - 1
        self.add(t0, s * vol * self.env(n, decay=decay))

    def noise(self, t0, dur, vol=0.1, decay=8.0, smooth=1):
        n = int(dur * SR)
        s = np.random.default_rng(int(t0 * 100)).uniform(-1, 1, n).astype(np.float32)
        if smooth > 1:
            s = np.convolve(s, np.ones(smooth) / smooth, "same") * math.sqrt(smooth) * 0.7
        self.add(t0, s * vol * self.env(n, decay=decay))


def build_audio(path):
    m = Mixer(DUR)
    # 타이틀 비프 + 코인음
    for k in range(3):
        m.tone(k * 0.4, midi(84), 0.06, 0.07)
    for i, n in enumerate((76, 83, 88)):
        m.tone(1.1 + i * 0.07, midi(n), 0.09, 0.1)
    # 평화로운 징글 (1.8~2.9)
    for i, n in enumerate((72, 76, 79, 84, 79, 84)):
        m.tone(1.85 + i * 0.16, midi(n), 0.14, 0.09, duty=0.25)
    m.tone(1.85, midi(48), 0.95, 0.12, "tri")
    # 불길한 하강 + 천둥 + 비
    for i, n in enumerate((79, 75, 72, 67, 63, 60)):
        m.tone(2.9 + i * 0.16, midi(n), 0.16, 0.09, duty=0.25)
    m.tone(2.9, midi(36), 2.2, 0.16, "tri", decay=0.4)
    for lt in LIGHTNING:
        m.noise(lt, 1.4, 0.45, decay=3.0, smooth=8)
    rain = np.random.default_rng(1).uniform(-1, 1, int(5.6 * SR)).astype(np.float32) * 0.025
    rain *= m.env(len(rain), a=0.6, r=0.8)
    m.add(3.0, rain)
    # 긴장감 있는 행진 베이스 (5.0~8.2)
    bass = [36, 36, 43, 36, 39, 36, 43, 41]
    for i in range(16):
        t0 = 5.0 + i * 0.2
        m.tone(t0, midi(bass[i % 8]), 0.18, 0.16, "tri")
        m.noise(t0, 0.03, 0.08, decay=60)
        if i % 4 == 2:
            m.tone(t0, midi(bass[i % 8] + 24), 0.1, 0.05, duty=0.125)
    m.tone(5.0, midi(84), 0.6, 0.05, freq_end=midi(96))   # 아이템 출현
    # 점프 + 아이템 획득
    m.tone(PICK - 0.2, 300, 0.15, 0.1, freq_end=900, duty=0.25)
    for i, n in enumerate((72, 76, 79, 84, 88, 91, 96)):
        m.tone(PICK + i * 0.05, midi(n), 0.06, 0.11)
    for n in (84, 88, 91):
        m.tone(PICK + 0.35, midi(n), 0.7, 0.06, decay=2.5)
    m.noise(PICK, 0.3, 0.15, decay=12)
    # 승리의 멜로디 (8.9~12)
    lead = [72, 76, 79, 84, 83, 79, 76, 79, 81, 77, 72, 77, 79, 83, 86, 84]
    roots = [48, 52, 53, 55]
    for i, n in enumerate(lead):
        m.tone(8.9 + i * 0.18, midi(n), 0.16, 0.08, duty=0.25)
        m.tone(8.9 + i * 0.18, midi(roots[i // 4] + (12 if i % 2 else 0)), 0.16, 0.14, "tri")
    # 모자이크 전환 + 창 열림
    m.tone(11.6, 1200, 0.4, 0.05, freq_end=200, duty=0.125)
    m.tone(12.35, 220, 0.45, 0.09, freq_end=880, duty=0.25)
    m.tone(12.9, midi(91), 0.08, 0.08)
    m.tone(12.98, midi(96), 0.12, 0.08)
    for i in range(len(TITLE)):
        if TITLE[i] != " ":
            m.tone(13.6 + i * 0.1, midi(72 + i * 2), 0.08, 0.09, duty=0.25)
    # 팡파레
    fan = [(14.3, 67, .12), (14.45, 67, .12), (14.6, 67, .12), (14.75, 72, .5), (15.3, 76, .2), (15.55, 79, .8)]
    for t0, n, dd in fan:
        m.tone(t0, midi(n), dd, 0.1)
        m.tone(t0, midi(n - 12), dd, 0.1, "tri")
        m.tone(t0, midi(n + 4), dd, 0.05, duty=0.25)
    # 배경 아르페지오 루프 (16.4~20)
    arp = [60, 64, 67, 72, 65, 69, 72, 77, 67, 71, 74, 79, 64, 67, 72, 76]
    for i in range(24):
        t0 = 16.4 + i * 0.15
        m.tone(t0, midi(arp[i % 16]), 0.13, 0.05, duty=0.125)
        if i % 4 == 0:
            m.tone(t0, midi(arp[i % 16] - 24), 0.58, 0.12, "tri")
    # 불꽃놀이 펑
    for ft, *_ in FIREWORKS:
        m.noise(ft, 0.5, 0.12, decay=9, smooth=4)
    # 타자 소리 (자막 한 글자마다)
    for tt in seg_chars(SUB1) + seg_chars(SUB2) + seg_chars(MSG, 12):
        m.tone(tt, midi(88), 0.025, 0.035, duty=0.25)

    buf = m.buf[:int(SR * DUR)]
    fade = int(0.6 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)
    buf = buf / max(1e-6, np.abs(buf).max()) * 0.85
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- 렌더
def main(out):
    wav = os.path.splitext(out)[0] + "_audio.wav"
    build_audio(wav)
    W, H = LW * SCALE, LH * SCALE
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-tune", "animation",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(DUR * FPS)
    for i in range(n):
        p.stdin.write(frame(i / FPS).tobytes())
        if i % 60 == 0:
            print(f"  {i}/{n}", flush=True)
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError("ffmpeg 실패")
    os.remove(wav)
    print("완료:", out)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for ts in sys.argv[2:]:
            pil(frame(float(ts))[::2, ::2]).save(f"prev_{ts}.png")
    else:
        main(os.path.abspath(os.path.join(HERE, "..", "final.mp4")))
