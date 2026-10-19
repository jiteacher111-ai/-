# Procedural fusion-gugak BGM: gayageum-like plucks (Karplus-Strong) on a pentatonic scale,
# janggu/buk style drums, low drone pad, taiko-ish hits at scene changes.
import sys
import numpy as np
from scipy.io import wavfile

SR = 44100
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 46.0
OUT = sys.argv[1]
BPM = 100
BEAT = 60 / BPM
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)


def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt((1 - pan) / 2)
    R[i:i + len(sig)] += sig * np.sqrt((1 + pan) / 2)


def pluck(freq, dur=1.6, bright=0.5):
    n = int(SR * dur)
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    out = np.empty(n)
    for k in range(n):
        out[k] = buf[k % p]
        nxt = buf[(k + 1) % p]
        buf[k % p] = 0.996 * (bright * buf[k % p] + (1 - bright) * nxt) if True else 0
    # bend-up at onset like nonghyeon
    env = np.exp(-np.arange(n) / (SR * 0.9))
    return out * env


def drum(kind):
    t = np.arange(int(SR * (0.9 if kind == "buk" else 0.25))) / SR
    if kind == "buk":  # deep barrel drum
        f = 55 + 70 * np.exp(-t * 25)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
        s += rng.normal(0, 1, len(t)) * np.exp(-t * 60) * 0.3
        return s
    if kind == "gung":  # janggu low side
        f = 110 + 60 * np.exp(-t * 40)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    # deok: janggu stick side, sharp crack
    n = rng.normal(0, 1, len(t))
    s = np.convolve(n, [1, -0.9], "same") * np.exp(-t * 45)
    return s * 0.6 + np.sin(2 * np.pi * 520 * t) * np.exp(-t * 50) * 0.4


def pad(freq, dur):
    t = np.arange(int(SR * dur)) / SR
    s = sum(np.sin(2 * np.pi * freq * m * t * (1 + 0.002 * d)) / m
            for m, d in [(1, 0), (1, 1), (2, -1), (3, 0)])
    a = np.minimum(1, t / 1.5) * np.minimum(1, (dur - t) / 1.5)
    return s * a * (0.8 + 0.2 * np.sin(2 * np.pi * 0.25 * t))


def boom(freq=45):
    t = np.arange(int(SR * 2.5)) / SR
    f = freq + 60 * np.exp(-t * 8)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.8)
    s += rng.normal(0, 1, len(t)) * np.exp(-t * 12) * 0.25
    return s


def riser(dur):
    t = np.arange(int(SR * dur)) / SR
    n = rng.normal(0, 1, len(t))
    n = np.convolve(n, np.ones(8) / 8, "same")
    return n * (t / dur) ** 2


# D minor pentatonic-ish (gyemyeonjo flavor): D F G A C
base = 146.83
scale = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5]
def note(deg, octv=0):
    return base * scale[deg % 5] * 2 ** (octv + deg // 5)

# drone pads per section (root changes with scenes)
sections = [(0, 2.5, 0), (2.5, 12.6, 0), (12.6, 23.1, 2), (23.1, 32.6, 3), (32.6, DUR, 0)]
for s, e, deg in sections:
    add(pad(note(deg, -2), e - s + 1.0), s, 0, 0.05)
    add(pad(note(deg + 2, -1), e - s + 1.0), s, 0.3, 0.025)

# rhythm: jajinmori-ish 12/8 feel compressed into 4/4 groove
t = 0.0
bar = 0
while t < DUR - 1.5:
    intensity = 0.6 if t < 8 else (0.8 if t < 30 else 1.0)
    add(drum("buk"), t, 0, 0.55 * intensity)
    add(drum("deok"), t + BEAT * 1.0, 0.4, 0.25 * intensity)
    add(drum("gung"), t + BEAT * 1.5, -0.3, 0.35 * intensity)
    add(drum("deok"), t + BEAT * 2.0, 0.4, 0.3 * intensity)
    add(drum("buk"), t + BEAT * 2.5, 0, 0.35 * intensity)
    add(drum("gung"), t + BEAT * 3.0, -0.3, 0.3 * intensity)
    add(drum("deok"), t + BEAT * 3.5, 0.4, 0.2 * intensity)
    t += BEAT * 4
    bar += 1

# gayageum melody motif, repeated with variation
motif = [(0, 0, 1), (2, 0, .5), (3, 0, .5), (4, 0, 1), (3, 0, .5), (2, 0, .5),
         (0, 0, 1), (4, -1, 1), (0, 0, 2)]
motif2 = [(3, 0, 1), (4, 0, .5), (0, 1, .5), (1, 1, 1), (0, 1, .5), (4, 0, .5),
          (3, 0, 1), (2, 0, 1), (3, 0, 2)]
t = BEAT * 4
i = 0
while t < DUR - 3:
    m = motif if (i % 2 == 0) else motif2
    for deg, o, ln in m:
        if t >= DUR - 3:
            break
        add(pluck(note(deg, o), 1.8, 0.5), t, -0.2, 0.35)
        if ln >= 1:  # octave doubling for weight
            add(pluck(note(deg, o + 1), 1.0, 0.6), t + 0.01, 0.25, 0.12)
        t += ln * BEAT
    i += 1

# impacts at scene changes, riser before each
for st in [0.0, 2.5, 12.6, 23.1, 32.6, 42.4]:
    if st > 1:
        add(riser(1.2), st - 1.2, 0, 0.12)
    add(boom(), st, 0, 0.9)

mix = np.stack([L, R], 1)
# fade in/out
fi = int(SR * 0.3); fo = int(SR * 2.0)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
mix = np.tanh(mix * 1.2)
mix /= np.abs(mix).max() / 0.9
wavfile.write(OUT, SR, (mix * 32767).astype(np.int16))
print("wrote", OUT, DUR)
