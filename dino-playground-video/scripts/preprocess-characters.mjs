// character-crops-v1.json → 포즈·표정별 투명 PNG + contact sheet
//  1) grids.xBoundaries 로 셀 크롭 (표정 행은 포즈 행 시작 y 에서 자름)
//  2) 네 모서리에서 웜 아이보리 배경색 샘플링
//  3) 모서리·테두리와 이어진 배경만 flood fill 로 제거 → 캐릭터 안쪽의 밝은 배·흰자는 보존
//  4) 경계 띠에서 colorDistanceSoftStart~FullAlpha(18~42) 로 부드러운 알파 + edge decontamination
//  5) 바닥 그림자(배경과 같은 색조로 어두워진 영역) 제거
//  6) 이웃 셀 조각 제거, 캐릭터가 셀 경계에 닿으면 그 방향으로 조금씩 확장해 재시도 (흉상 아래쪽 제외)
//  조정값: preprocess.config.json (전역 + 크롭별 overrides)
// 사용법: node scripts/preprocess-characters.mjs [--only <cropId>]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {OUT_DIR, PROJECT_DIR, PUBLIC_DIR, ensureDir, exists, readJson, sourcePath, writeJson} from './lib/paths.mjs';
import {cropSettings, extractCrops} from './lib/normalize.mjs';
import {CUTOUT_INDEX, generateProjectData} from './lib/generate.mjs';

const cropsFile = sourcePath('data/character-crops-v1.json');
if (!exists(cropsFile)) {
  console.error('✗ data/character-crops-v1.json 없음 — 전처리를 건너뜀 (npm run sync 후 다시 실행)');
  writeJson(path.join(OUT_DIR, 'preprocess-report.json'), {ok: false, reason: 'data/character-crops-v1.json 없음', results: []});
  process.exit(0);
}
const cropsJson = readJson(cropsFile);
const fromJson = cropSettings(cropsJson);
const CONFIG_FILE = path.join(PROJECT_DIR, 'preprocess.config.json');
const config = {
  softStart: fromJson.softStart, // 이 거리 이하 = 완전 투명 (경계 띠 안에서)
  fullAlpha: fromJson.fullAlpha, // 이 거리 이상 = 완전 불투명 (crops json 값)
  edgeFullAlpha: 72, // 경계 띠 안에서만 쓰는 불투명 기준 — 머리카락 끝 아이보리 섞임을 반투명+탈색 처리
  floodThreshold: 24, // 테두리에서 번져 나갈 배경 판정 거리 (fullAlpha 보다 작게 → 밝은 몸 색 보호)
  edgeBand: 2, // 부드러운 알파를 적용할 경계 띠 두께(px)
  enclosedMinArea: 120, // 갇힌 배경으로 볼 최소 넓이(px)
  enclosedMeanDist: 10, // 갇힌 배경으로 볼 배경색과의 평균 거리 (크림색 배 보호)
  edgeDecontaminate: fromJson.edgeDecontaminate,
  removeShadow: !fromJson.preserveContactShadow,
  shadowRG: [-4, 18], // 그림자 판정: (r-g) 가 배경 대비 이 범위
  shadowGB: [-6, 12], // 그림자 판정: (g-b) 가 배경 대비 이 범위
  shadowMinLuma: 0.62, // 그림자 판정: 배경 밝기 대비 최소 비율
  shadowRegion: 0.3, // 포즈 크롭의 아래쪽 이 비율 안에서만 그림자 제거
  autoExpandStep: 0.05,
  autoExpandMax: 3,
  inset: 0, // 이웃 셀이 섞이면 8~14 로 (crops notes 참고)
  minComponentRatio: 0.02,
  outputPadding: 6,
  overrides: {},
  ...(exists(CONFIG_FILE) ? readJson(CONFIG_FILE) : {}),
};
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;
const crops = extractCrops(cropsJson).filter((c) => !only || c.id === only);
const CUTOUT_DIR = path.join(PUBLIC_DIR, 'assets', 'characters', 'cutouts');
console.log(`크롭 ${crops.length}개 처리 (soft ${config.softStart} → full ${config.fullAlpha}, flood ${config.floodThreshold})`);

const sheetCache = new Map();
const loadSheet = async (rel) => {
  if (sheetCache.has(rel)) return sheetCache.get(rel);
  const file = sourcePath(rel);
  const sheet = exists(file) ? await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true}).then(({data, info}) => ({data, width: info.width, height: info.height})) : null;
  sheetCache.set(rel, sheet);
  return sheet;
};

/** 네 모서리 8×8 평균 중 밝은(배경으로 보이는) 것들의 중앙값 */
const cornerBg = (px, w, h) => {
  const patch = (x0, y0) => {
    const acc = [0, 0, 0];
    let n = 0;
    for (let y = y0; y < y0 + 8 && y < h; y++)
      for (let x = x0; x < x0 + 8 && x < w; x++) {
        const i = (y * w + x) * 3;
        acc[0] += px[i];
        acc[1] += px[i + 1];
        acc[2] += px[i + 2];
        n++;
      }
    return acc.map((v) => v / n);
  };
  const corners = [patch(0, 0), patch(w - 8, 0), patch(0, h - 8), patch(w - 8, h - 8)];
  const bright = corners.filter((c) => (c[0] + c[1] + c[2]) / 3 > 215 && Math.abs(c[0] - c[2]) < 40);
  const use = bright.length ? bright : corners;
  return [0, 1, 2].map((k) => use.map((c) => c[k]).sort((a, b) => a - b)[Math.floor(use.length / 2)]);
};

const cutout = (sheet, region, core, o, crop) => {
  const {x: rx, y: ry, w, h} = region;
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const s = ((ry + y) * sheet.width + rx) * 3;
    px.set(sheet.data.subarray(s, s + w * 3), y * w * 3);
  }
  const bg = cornerBg(px, w, h);
  const N = w * h;
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dr = px[i * 3] - bg[0], dg = px[i * 3 + 1] - bg[1], db = px[i * 3 + 2] - bg[2];
    dist[i] = Math.sqrt(dr * dr + dg * dg + db * db);
  }
  // 1) 배경 flood fill
  const bgMask = new Uint8Array(N);
  const stack = [];
  const T = o.floodThreshold;
  const seed = (i) => {
    if (!bgMask[i] && dist[i] <= T) (bgMask[i] = 1, stack.push(i));
  };
  const floodFrom = (test) => {
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i - x) / w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (n >= 0 && !bgMask[n] && test(n)) (bgMask[n] = 1, stack.push(n));
    }
  };
  for (let x = 0; x < w; x++) (seed(x), seed((h - 1) * w + x));
  for (let y = 0; y < h; y++) (seed(y * w), seed(y * w + w - 1));
  floodFrom((n) => dist[n] <= T);
  // 1-b) 갇힌 배경: 다리 사이·팔 안쪽처럼 테두리와 끊긴 배경. 배경색과 거의 같은(평균 거리 ≤ enclosedMeanDist) 큰 영역만 제거
  let enclosedRemoved = 0;
  {
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i] || bgMask[i] || dist[i] > T) continue;
      const region = [i];
      seen[i] = 1;
      let sum = 0;
      for (let k = 0; k < region.length; k++) {
        const j = region[k];
        sum += dist[j];
        const x = j % w, y = (j - x) / w;
        for (const n of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (n >= 0 && !seen[n] && !bgMask[n] && dist[n] <= T) (seen[n] = 1, region.push(n));
      }
      if (region.length >= o.enclosedMinArea && sum / region.length <= o.enclosedMeanDist) {
        for (const j of region) bgMask[j] = 1;
        enclosedRemoved += region.length;
      }
    }
  }
  // 2) 바닥 그림자: 배경과 같은 색조로 어두워진 픽셀을 배경에서 이어서 제거 (포즈 아래쪽만)
  let shadowRemoved = 0;
  if (o.removeShadow && crop.kind === 'pose') {
    const bgRG = bg[0] - bg[1], bgGB = bg[1] - bg[2], bgL = (bg[0] + bg[1] + bg[2]) / 3;
    const yMin = Math.floor(h * (1 - o.shadowRegion));
    const isShadow = (i) => {
      if (Math.floor(i / w) < yMin) return false;
      const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
      const L = (r + g + b) / 3;
      // 바닥 그림자는 배경보다 약간 따뜻하고 어둡다 (r-g, g-b 가 배경보다 조금 큼). 흰 양말·크림색 배·발톱은 범위 밖.
      const dRG = r - g - bgRG, dGB = g - b - bgGB;
      return L <= bgL + 2 && L >= bgL * o.shadowMinLuma && dRG >= o.shadowRG[0] && dRG <= o.shadowRG[1] && dGB >= o.shadowGB[0] && dGB <= o.shadowGB[1];
    };
    for (let i = yMin * w; i < N; i++) if (bgMask[i]) stack.push(i); // 갇힌 배경에서도 이어서 번짐
    const before = bgMask.reduce((a, v) => a + v, 0);
    floodFrom(isShadow);
    shadowRemoved = bgMask.reduce((a, v) => a + v, 0) - before;
  }
  // 3) 경계 띠 거리 계산 (BFS, edgeBand px)
  const band = new Uint8Array(N).fill(255);
  const q = [];
  for (let i = 0; i < N; i++) if (bgMask[i]) (band[i] = 0, q.push(i));
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    if (band[i] >= o.edgeBand) continue;
    const x = i % w, y = (i - x) / w;
    for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (n >= 0 && band[n] === 255) (band[n] = band[i] + 1, q.push(n));
  }
  const alpha = new Uint8Array(N);
  const rgba = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    let a = 255;
    if (bgMask[i]) a = 0;
    else if (band[i] <= o.edgeBand) a = Math.round(Math.max(0, Math.min(1, (dist[i] - o.softStart) / (Math.max(o.fullAlpha, o.edgeFullAlpha) - o.softStart))) * 255);
    alpha[i] = a;
    for (let c = 0; c < 3; c++) {
      let v = px[i * 3 + c];
      // edge decontamination: 반투명 가장자리에서 배경색 성분을 빼서 아이보리 테두리 제거
      if (o.edgeDecontaminate && a > 0 && a < 255) v = (v - (1 - a / 255) * bg[c]) / (a / 255);
      rgba[i * 4 + c] = v;
    }
  }
  // 4) 연결 요소 — 셀 core 와 겹치는 큰 덩어리만
  const label = new Int32Array(N).fill(-1);
  const comps = [];
  for (let i = 0; i < N; i++) {
    if (alpha[i] < 32 || label[i] >= 0) continue;
    const id = comps.length;
    const c = {id, area: 0, minX: w, minY: h, maxX: 0, maxY: 0};
    const st = [i];
    label[i] = id;
    while (st.length) {
      const j = st.pop();
      c.area++;
      const x = j % w, y = (j - x) / w;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      for (const n of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (n >= 0 && label[n] < 0 && alpha[n] >= 32) (label[n] = id, st.push(n));
    }
    comps.push(c);
  }
  const largest = Math.max(0, ...comps.map((c) => c.area));
  const big = comps.find((c) => c.area === largest);
  const overlapsCore = (c) => c.maxX >= core.x && c.minX < core.x + core.w && c.maxY >= core.y && c.minY < core.y + core.h;
  // 이웃 셀 조각: 주 덩어리가 아니면서 크롭 경계에 붙은 조각은 이웃 셀(옆 포즈, 겹친 행의 머리·몸통)로 보고 제거
  const touchesEdge = (c) => c.minX <= 0 || c.minY <= 0 || c.maxX >= w - 1 || c.maxY >= h - 1;
  const keep = new Set(comps.filter((c) => c === big || (c.area >= largest * o.minComponentRatio && overlapsCore(c) && !touchesEdge(c))).map((c) => c.id));
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < N; i++) {
    if (alpha[i] > 0 && (label[i] < 0 ? true : !keep.has(label[i]))) {
      // 옅은 잔여물(라벨 없음)은 주변이 유지 덩어리일 때만 남긴다
      if (label[i] < 0) {
        const x = i % w, y = (i - x) / w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        if (nb.some((n) => n >= 0 && label[n] >= 0 && keep.has(label[n]))) {
          /* 유지 */
        } else alpha[i] = 0;
      } else alpha[i] = 0;
    }
    rgba[i * 4 + 3] = alpha[i];
    if (alpha[i] >= 32) {
      const x = i % w, y = (i - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {rgba, w, h, bbox: maxX < 0 ? null : {minX, minY, maxX, maxY}, touches: {left: minX <= 0, right: maxX >= w - 1, top: minY <= 0, bottom: maxY >= h - 1}, bg: bg.map(Math.round), shadowRemoved, enclosedRemoved, dropped: comps.length - keep.size};
};

ensureDir(CUTOUT_DIR);
const index = exists(CUTOUT_INDEX) && only ? readJson(CUTOUT_INDEX) : {sprites: {}, meta: {}};
const prevReport = only && exists(path.join(OUT_DIR, 'preprocess-report.json')) ? readJson(path.join(OUT_DIR, 'preprocess-report.json')).results ?? [] : [];
const results = [];
for (const crop of crops) {
  const o = {...config, ...(config.overrides[crop.id] ?? {})};
  const r = {id: crop.id, character: crop.character, kind: crop.kind, name: crop.name, source: crop.source, cell: crop.rect, settings: {floodThreshold: o.floodThreshold, softStart: o.softStart, fullAlpha: o.fullAlpha, edgeFullAlpha: o.edgeFullAlpha, inset: o.inset}, flags: []};
  results.push(r);
  const sheet = await loadSheet(crop.source);
  if (!sheet) {
    r.flags.push(`원본 시트 없음: ${crop.source}`);
    continue;
  }
  const cell = {x: crop.rect.x + o.inset, y: crop.rect.y + (crop.kind === 'pose' ? o.inset : 0), w: crop.rect.w - o.inset * 2, h: crop.rect.h - o.inset * (crop.kind === 'pose' ? 2 : 0)};
  const ext = {l: 0, r: 0, t: 0, b: 0};
  let out, region;
  for (let attempt = 0; ; attempt++) {
    const x0 = Math.max(0, cell.x - ext.l), y0 = Math.max(0, cell.y - ext.t);
    const x1 = Math.min(sheet.width, cell.x + cell.w + ext.r), y1 = Math.min(sheet.height, cell.y + cell.h + ext.b);
    region = {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
    out = cutout(sheet, region, {x: cell.x - x0, y: cell.y - y0, w: cell.w, h: cell.h}, o, crop);
    const grow = {l: out.touches.left && x0 > 0, r: out.touches.right && x1 < sheet.width, t: out.touches.top && y0 > 0, b: out.touches.bottom && y1 < sheet.height && !crop.openBottom};
    if (!Object.values(grow).some(Boolean) || attempt >= o.autoExpandMax) break;
    const sx = Math.ceil(cell.w * o.autoExpandStep), sy = Math.ceil(cell.h * o.autoExpandStep);
    if (grow.l) ext.l += sx;
    if (grow.r) ext.r += sx;
    if (grow.t) ext.t += sy;
    if (grow.b) ext.b += sy;
    r.autoExpanded = {...ext};
  }
  r.region = region;
  r.bg = out.bg;
  r.shadowRemovedPx = out.shadowRemoved;
  r.enclosedRemovedPx = out.enclosedRemoved;
  r.droppedFragments = out.dropped;
  const touching = Object.entries(out.touches).filter(([k, v]) => v && !(k === 'bottom' && crop.openBottom)).map(([k]) => k);
  if (touching.length) r.flags.push(`경계 접촉(잘림 의심): ${touching.join(',')}`);
  if (!out.bbox) {
    r.flags.push('남은 픽셀 없음');
    continue;
  }
  const pad = o.outputPadding;
  const {minX, minY, maxX, maxY} = out.bbox;
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const rel = `assets/characters/cutouts/${crop.character}/${crop.kind}-${crop.name}.png`;
  ensureDir(path.dirname(path.join(PUBLIC_DIR, rel)));
  await sharp(Buffer.from(out.rgba.buffer), {raw: {width: out.w, height: out.h, channels: 4}})
    .extract({left: minX, top: minY, width: tw, height: th})
    .extend({top: pad, bottom: crop.openBottom ? 0 : pad, left: pad, right: pad, background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png({compressionLevel: 9})
    .toFile(path.join(PUBLIC_DIR, rel));
  const size = {width: tw + pad * 2, height: th + pad + (crop.openBottom ? 0 : pad)};
  r.output = rel;
  r.size = size;
  if (th < crop.rect.h * 0.45) r.flags.push('캐릭터가 셀에 비해 너무 작음 — 배경 제거 과다 의심');
  index.sprites[`${crop.character}/${crop.kind}-${crop.name}`] = rel;
  index.meta[rel] = {...size, padTop: pad, padBottom: crop.openBottom ? 0 : pad, kind: crop.kind};
}
index.generatedAt = new Date().toISOString();
writeJson(CUTOUT_INDEX, index);

// ---------------------------------------------------------------- contact sheet
const allResults = only ? [...prevReport.filter((p) => !results.some((r) => r.id === p.id)), ...results] : results;
const order = (r) => `${r.character}|${r.kind === 'expression' ? 0 : 1}`;
const sorted = [...allResults].sort((a, b) => order(a).localeCompare(order(b)));
const TILE_W = 240, IMG_H = 300, TILE_H = 360, COLS = 13;
const rows = Math.ceil(sorted.length / COLS);
const checker = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${IMG_H}"><defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#5f6b73"/><rect width="8" height="8" fill="#7d8a93"/><rect x="8" y="8" width="8" height="8" fill="#7d8a93"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`))
  .png()
  .toBuffer();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const layers = [];
for (const [i, r] of sorted.entries()) {
  const left = (i % COLS) * TILE_W, top = Math.floor(i / COLS) * TILE_H;
  layers.push({input: checker, left, top});
  if (r.output && exists(path.join(PUBLIC_DIR, r.output))) {
    const img = await sharp(path.join(PUBLIC_DIR, r.output)).resize({width: TILE_W - 12, height: IMG_H - 12, fit: 'inside'}).toBuffer({resolveWithObject: true});
    layers.push({input: img.data, left: left + Math.round((TILE_W - img.info.width) / 2), top: top + IMG_H - 6 - img.info.height});
  }
  const bad = r.flags.length > 0;
  layers.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}"><rect x="1" y="1" width="${TILE_W - 2}" height="${TILE_H - 2}" fill="none" stroke="${bad ? '#e0242b' : '#9a9a9a'}" stroke-width="${bad ? 6 : 1}"/><rect y="${IMG_H}" width="${TILE_W}" height="${TILE_H - IMG_H}" fill="${bad ? '#ffe3e3' : '#f4f4f4'}"/><text x="8" y="${IMG_H + 22}" font-family="WenQuanYi Zen Hei, sans-serif" font-size="16" fill="#222">${esc(`${r.character} ${r.kind === 'pose' ? '포즈' : '표정'} ${r.name}`)}</text><text x="8" y="${IMG_H + 40}" font-family="WenQuanYi Zen Hei, sans-serif" font-size="12" fill="#555">${r.size ? `${r.size.width}×${r.size.height}` : '—'}${r.autoExpanded ? ' 확장' : ''}${r.shadowRemovedPx ? ` 그림자-${r.shadowRemovedPx}` : ''}</text><text x="8" y="${IMG_H + 55}" font-family="WenQuanYi Zen Hei, sans-serif" font-size="11" fill="#c01818">${esc(r.flags.join(' / ')).slice(0, 40)}</text></svg>`,
    ),
    left,
    top,
  });
}
ensureDir(path.join(OUT_DIR, 'contact-sheets'));
await sharp({create: {width: COLS * TILE_W, height: rows * TILE_H, channels: 4, background: '#ffffff'}}).composite(layers).png().toFile(path.join(OUT_DIR, 'contact-sheets', 'character-cutouts.png'));

const flagged = allResults.filter((r) => r.flags.length);
writeJson(path.join(OUT_DIR, 'preprocess-report.json'), {generatedAt: index.generatedAt, config: {...config, overrides: config.overrides}, total: allResults.length, written: allResults.filter((r) => r.output).length, flagged: flagged.length, results: allResults});
generateProjectData();
console.log(`완료: ${results.filter((r) => r.output).length}/${results.length}개 → public/assets/characters/cutouts, 검수 필요 ${flagged.length}개`);
flagged.forEach((r) => console.log(`  ! ${r.id}: ${r.flags.join(' / ')}`));
console.log('contact sheet: out/contact-sheets/character-cutouts.png');
void fs;
