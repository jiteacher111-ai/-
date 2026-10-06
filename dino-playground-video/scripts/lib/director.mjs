// 멀티샷 연출: timeline 숏 하나를 여러 컷(설정 와이드 → 화자 미디엄 → 합창 그룹 → 리액션)으로 나눈다.
// 숏의 시작·끝 프레임, 대사 시간은 그대로 두고 "카메라만" 바꾼다. 컷 카메라는 timeline camera 와 같은 형식.
//  - wide     : timeline camera 를 그 구간만큼 그대로
//  - speaker  : 말하는 캐릭터 미디엄 (교육용 소품이 있는 숏은 소품까지 함께 담는 투샷)
//  - group    : 합창(all) 대사 — 등장 캐릭터 전체
//  - reaction : 화자가 화면에 없거나 대사 뒤 — 듣는 캐릭터
//  - subject  : 대사 없는 긴 숏의 후반 — 주인공(움직이는 캐릭터) 미디엄

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** src/animation/motion.ts 의 위치 진행도와 같은 규칙 */
export const moveProgress = (c, f, D) => {
  const t = f - c.animation.delay;
  const b = c.animation.base;
  if (/freeze|one-step|eager-step|step-to-mark/.test(b)) return easeOutCubic(clamp(t / Math.min(D * 0.55, 54), 0, 1));
  if (/slide-ease-out/.test(b)) return easeOutCubic(clamp(t / (D - 10), 0, 1));
  return easeInOutSine(clamp(t / (D - 10), 0, 1));
};

/** 캐릭터 세계 좌표 상자 (0~1): 발밑 중앙 기준, 높이 = scale(서 있는 키), 너비 = 스프라이트 비율 */
export const charBox = (c, f, D, spriteMeta, W, H) => {
  const p = moveProgress(c, f, D);
  const x = lerp(c.xFrom, c.xTo, p), y = lerp(c.yFrom, c.yTo, p), sc = lerp(c.scaleFrom, c.scaleTo, p);
  const m = spriteMeta[c.sprite];
  const ref = m?.refHeight ?? (m ? m.height - m.padTop - m.padBottom : 1);
  const hPx = m ? ((m.height - m.padTop - m.padBottom) / ref) * sc * H : sc * H;
  const wPx = m ? ((m.width - m.padTop - m.padBottom) / ref) * sc * H : sc * H * 0.6;
  return {x, y, l: x - wPx / W / 2, r: x + wPx / W / 2, t: y - hPx / H, b: y, h: hPx / H, w: wPx / W};
};

const propBox = (p, propMeta, W, H, config) => {
  const size = propMeta[p.asset] ?? {width: 1, height: 1};
  if (p.kind === 'board') {
    const h = p.scale, w = (h * H * size.width) / size.height / W;
    return {l: p.x - w / 2, r: p.x + w / 2, t: p.y - h, b: p.y};
  }
  const w = p.scale, h = ((w * W * size.height) / size.width / H) * (config.propOverrides?.[p.id]?.groundSquash ?? 1);
  return {l: p.x - w / 2, r: p.x + w / 2, t: p.y - h, b: p.y};
};

const union = (boxes) => ({l: Math.min(...boxes.map((b) => b.l)), r: Math.max(...boxes.map((b) => b.r)), t: Math.min(...boxes.map((b) => b.t)), b: Math.max(...boxes.map((b) => b.b))});

/** 상자들을 담는 카메라 (focus 점 + scale). headroom: 머리 위 여백(화면 비율) */
const frame = (u, d, {sMin, sMax, fill = 0.82, headroom = 0.1}) => {
  const hU = u.b - u.t, wU = u.r - u.l;
  const s = clamp(Math.min(fill / hU, (fill + 0.06) / wU), sMin, sMax);
  const cx = (u.l + u.r) / 2;
  // 머리(상자 위)가 화면 위에서 headroom 지점에 오도록. 상자가 화면보다 짧으면 세로 중앙
  const cy = hU * s < 1 - headroom * 2 ? (u.t + u.b) / 2 - 0.04 / s : u.t + (0.5 - headroom) / s;
  return {s, cx, cy};
};

/**
 * @returns cuts [{from, to, kind, label, subjects:[id], camera}]  from/to 는 숏 기준 프레임
 */
export const directShot = (shot, lines, {spriteMeta, propMeta, config, W, H}) => {
  const D = shot.durationInFrames;
  const opt = config.multiShot ?? {};
  const MIN = opt.minCutFrames ?? 24;
  const S_MED = [opt.mediumScaleMin ?? 1.18, opt.mediumScaleMax ?? 1.45];
  const cam = shot.camera;
  const wideCam = (a, b) => ({
    type: cam.type,
    scaleFrom: lerp(cam.scaleFrom, cam.scaleTo, a / D),
    scaleTo: lerp(cam.scaleFrom, cam.scaleTo, b / D),
    xFrom: lerp(cam.xFrom, cam.xTo, a / D),
    xTo: lerp(cam.xFrom, cam.xTo, b / D),
    yFrom: lerp(cam.yFrom, cam.yTo, a / D),
    yTo: lerp(cam.yFrom, cam.yTo, b / D),
  });
  const single = (kind, label) => [{from: 0, to: D, kind, label, subjects: shot.characters.map((c) => c.id), camera: wideCam(0, D)}];
  // 표지판 패널 강조 숏(glow-panel-N): 화자+표지판 → 빛나는 패널 인서트 클로즈업
  const glow = shot.props.find((p) => p.kind === 'board' && /^glow-panel-\d$/.test(p.animation.base));
  if (opt.enabled && glow && D >= 72) {
    const PANELS = [[0.094, 0.293, 0.255, 0.4], [0.359, 0.293, 0.279, 0.4], [0.648, 0.297, 0.263, 0.402]];
    const [px, py, pw, ph] = PANELS[Number(glow.animation.base.slice(-1)) - 1];
    const size = propMeta[glow.asset] ?? {width: 1536, height: 1024};
    const bh = glow.scale, bw = (bh * H * size.width) / size.height / W;
    const cx = glow.x - bw / 2 + (px + pw / 2) * bw, cy = glow.y - bh + (py + ph / 2) * bh;
    const sIns = Math.min(opt.insertScale ?? 1.6, 0.62 / (ph * bh));
    const a = Math.round(D * 0.42);
    return [
      {from: 0, to: a, kind: 'wide', label: '화자와 표지판', subjects: shot.characters.map((c) => c.id), camera: wideCam(0, a)},
      {from: a, to: D, kind: 'subject', label: `표지판 패널 ${glow.animation.base.slice(-1)} 인서트`, subjects: [], camera: {type: 'insert', scaleFrom: sIns, scaleTo: sIns * 1.03, xFrom: cx, xTo: cx, yFrom: cy, yTo: cy}},
    ];
  }
  if (!opt.enabled || !shot.characters.length || (opt.keepTimelineCameraFor ?? ['close-up']).includes(cam.type)) return single('wide', '타임라인 카메라');

  const focal = shot.props.filter((p) => ['footprints', 'arrows', 'boundary', 'board'].includes(p.kind) && p.exists && Math.max(p.opacityFrom, p.opacityTo) > 0.05).map((p) => propBox(p, propMeta, W, H, config));
  const boxAt = (ids, f) => shot.characters.filter((c) => ids.includes(c.id)).map((c) => charBox(c, f, D, spriteMeta, W, H));
  const closeCam = (ids, a, b, {withProps, group} = {}) => {
    const at = (f) => {
      const bx = boxAt(ids, f);
      if (!bx.length) return null;
      const u = union(withProps && focal.length ? [...bx, ...focal] : bx);
      return frame(u, D, group || (withProps && focal.length) ? {sMin: 1.0, sMax: S_MED[1], fill: 0.86, headroom: 0.08} : {sMin: S_MED[0], sMax: S_MED[1], fill: opt.mediumFill ?? 0.8, headroom: 0.09});
    };
    const A = at(a), B = at(Math.max(a, b - 1));
    if (!A) return wideCam(a, b);
    const drift = opt.drift ?? 0.025; // 컷 안의 아주 느린 푸시인
    return {type: 'cut', scaleFrom: A.s, scaleTo: Math.min(A.s * (1 + drift), S_MED[1] + 0.03), xFrom: A.cx, xTo: B.cx, yFrom: A.cy, yTo: B.cy};
  };
  const present = new Set(shot.characters.map((c) => c.id));
  const events = lines
    .filter((l) => l.to > shot.from && l.from < shot.from + D)
    .map((l) => ({line: l, a: clamp(l.from - shot.from - 3, 0, D), b: clamp(l.to - shot.from + 6, 0, D)}))
    .sort((x, y) => x.a - y.a);

  const cuts = [];
  const push = (from, to, kind, label, subjects, camera) => {
    if (to - from <= 0) return;
    const last = cuts.at(-1);
    if (last && last.kind === kind && last.label === label) {
      last.to = to;
      last.camera = {...last.camera, scaleTo: camera.scaleTo, xTo: camera.xTo, yTo: camera.yTo};
      return;
    }
    cuts.push({from, to, kind, label, subjects, camera});
  };
  let t = 0;
  for (const e of events) {
    let a = Math.max(e.a, t);
    if (!cuts.length && t === 0 && e.a >= (opt.establishMinGap ?? 12)) {
      // 숏 첫 컷은 설정 와이드 (장소가 바뀌면 더 길게). 대사가 와이드 끝에 살짝 걸쳐 시작해도 된다(J-컷)
      a = Math.min(Math.max(e.a, shot.transitionIn === 'dissolve' ? opt.establishNewLocationFrames ?? 40 : opt.establishFrames ?? 30), D - MIN);
      push(0, a, 'wide', '설정 와이드', [...present], wideCam(0, a));
    } else if (a - t < MIN) a = t; // 앞 컷이 너무 짧으면 대사 컷을 당긴다
    else push(t, a, 'wide', '와이드', [...present], wideCam(t, a));
    const b = Math.max(e.b, a + MIN) > D - MIN ? D : Math.max(e.b, a + MIN);
    const speakers = e.line.speakers.filter((id) => present.has(id));
    if (e.line.speakers.length > 1) {
      push(a, b, 'group', `합창 ${e.line.id}`, [...present], closeCam([...present], a, b, {group: true, withProps: true}));
    } else if (speakers.length) {
      push(a, b, 'speaker', `${speakers[0]} ${e.line.id}`, speakers, closeCam(speakers, a, b, {withProps: true}));
    } else {
      // 화자가 화면에 없음 → 화면에 있는 캐릭터의 리액션
      // 가장 크게 잡힌(주인공) 캐릭터가 듣는 사람
      const listener = [...shot.characters].sort((x, y) => y.scaleFrom - x.scaleFrom)[0].id;
      push(a, b, 'reaction', `${listener} 리액션 (${e.line.speaker} ${e.line.id} 화면 밖)`, [listener], closeCam([listener], a, b, {withProps: true}));
    }
    t = b;
    if (t >= D) break;
  }
  if (t < D) {
    const rest = D - t;
    const lastSpeaker = cuts.at(-1)?.kind === 'speaker' ? cuts.at(-1).subjects[0] : null;
    const listener = lastSpeaker ? [...present].find((id) => id !== lastSpeaker) : null;
    if (rest < MIN && cuts.length) cuts.at(-1).to = D;
    else if (!events.length && D >= (opt.splitSilentShotsFrom ?? 96)) {
      // 대사 없는 긴 숏: 와이드 → 주인공 미디엄 (움직이는 캐릭터 우선)
      const mover = shot.characters.find((c) => c.xFrom !== c.xTo || c.yFrom !== c.yTo) ?? shot.characters[0];
      const mid = Math.round(D * 0.5);
      push(0, mid, 'wide', '설정 와이드', [...present], wideCam(0, mid));
      push(mid, D, 'subject', `${mover.id} 미디엄`, [mover.id], closeCam([mover.id], mid, D, {withProps: true}));
    } else if (listener && rest <= 60) push(t, D, 'reaction', `${listener} 리액션`, [listener], closeCam([listener], t, D, {withProps: true}));
    else push(t, D, 'wide', '와이드', [...present], wideCam(t, D));
  }
  // 등장(pop-in)이 있는 숏: 모두 착지할 때까지는 화자 컷 대신 전원 그룹 컷 (등장을 놓치지 않게)
  const pops = shot.characters.filter((c) => /^pop-in/.test(c.animation.base));
  if (pops.length) {
    const landed = Math.max(...pops.map((c) => c.animation.delay)) + (config.acting?.popInFrames ?? 20) + 6;
    for (const c of cuts)
      if (c.from < landed && c.kind !== 'wide') Object.assign(c, {kind: 'group', label: `등장 그룹 (${c.label})`, subjects: [...present], camera: closeCam([...present], c.from, c.to, {group: true, withProps: true})});
  }
  // 거의 같은 구도의 연속 컷은 합친다 (점프 컷 방지)
  for (let i = cuts.length - 1; i > 0; i--) {
    const A = cuts[i - 1].camera, B = cuts[i].camera;
    if (Math.abs(A.scaleTo - B.scaleFrom) < 0.06 && Math.abs(A.xTo - B.xFrom) < 0.04 && Math.abs(A.yTo - B.yFrom) < 0.04) {
      cuts[i - 1].to = cuts[i].to;
      cuts[i - 1].camera = {...A, scaleTo: B.scaleTo, xTo: B.xTo, yTo: B.yTo};
      cuts.splice(i, 1);
    }
  }
  // 짧은 컷 병합
  for (let i = cuts.length - 1; i > 0; i--) if (cuts[i].to - cuts[i].from < MIN) (cuts[i - 1].to = cuts[i].to), cuts.splice(i, 1);
  if (cuts.length > 1 && cuts[0].to - cuts[0].from < MIN) (cuts[1].from = 0), cuts.shift();
  return cuts.length ? cuts : single('wide', '타임라인 카메라');
};
