// character-crops-v1.json → 포즈·표정별 투명 PNG + contact sheet
//  - 웜 아이보리 배경 제거: 크롭 테두리에서 배경색을 추정하고, 테두리와 이어진 비슷한 색만 지운다(flood fill).
//    그래서 캐릭터 안쪽의 흰자·밝은 배 같은 색은 지워지지 않는다.
//  - 캐릭터가 크롭 경계에 닿으면(얼굴·뿔·꼬리·손발 잘림 의심) 그 방향으로 크롭을 자동 확장해 다시 시도한다.
//  - 조정값: preprocess.config.json (전역 기본값 + 크롭별 overrides)
// 사용법: node scripts/preprocess-characters.mjs [--only <cropId>]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {OUT_DIR, PROJECT_DIR, PUBLIC_CHAR_DIR, ensureDir, exists, readJson, sourcePath, writeJson} from './lib/paths.mjs';
import {extractCrops, slug, spriteKey} from './lib/normalize.mjs';
import {generateProjectData} from './lib/generate.mjs';

const CONFIG_FILE = path.join(PROJECT_DIR, 'preprocess.config.json');
const config = {
  threshold: 34, // 배경색과의 RGB 거리 — 이 값 이하이고 테두리와 이어져 있으면 투명
  feather: 18, // threshold ~ threshold+feather 구간은 반투명 처리(가장자리 부드럽게)
  margin: 12, // 크롭 사각형 바깥으로 더 가져올 여백(px)
  autoExpandStep: 0.06, // 경계에 닿았을 때 한 번에 늘릴 비율
  autoExpandMax: 3,
  removeEnclosed: false, // 팔과 몸 사이처럼 갇힌 배경도 지울지 (밝은 배 색이 지워질 위험)
  enclosedThreshold: 18,
  minComponentRatio: 0.03, // 가장 큰 덩어리 대비 이 비율 미만의 조각은 제거(옆 포즈 침범/먼지)
  outputPadding: 8,
  overrides: {},
  ...(exists(CONFIG_FILE) ? readJson(CONFIG_FILE) : {}),
};
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;

const cropsFile = sourcePath('data/character-crops-v1.json');
if (!exists(cropsFile)) {
  console.error(`✗ ${path.relative(PROJECT_DIR, cropsFile)} 없음 — 전처리를 건너뜀 (npm run sync 후 다시 실행)`);
  writeJson(path.join(OUT_DIR, 'preprocess-report.json'), {ok: false, reason: 'data/character-crops-v1.json 없음', results: []});
  process.exit(0);
}
const crops = extractCrops(readJson(cropsFile)).filter((c) => !only || c.id === only);
console.log(`크롭 ${crops.length}개 처리`);

const sheetCache = new Map();
const loadSheet = async (src) => {
  const rel = src.startsWith('assets/') ? src : `assets/${src.replace(/^\.?\//, '')}`;
  if (sheetCache.has(rel)) return sheetCache.get(rel);
  const file = sourcePath(rel);
  if (!exists(file)) {
    sheetCache.set(rel, null);
    return null;
  }
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const sheet = {rel, data, width: info.width, height: info.height};
  sheetCache.set(rel, sheet);
  return sheet;
};

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** 영역 하나를 처리해 RGBA 버퍼 + 경계 접촉 정보 반환 */
const cutout = (sheet, region, opts) => {
  const {x: rx, y: ry, w, h} = region;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcStart = ((ry + y) * sheet.width + rx) * 4;
    px.set(sheet.data.subarray(srcStart, srcStart + w * 4), y * w * 4);
  }
  // 배경색 추정: 테두리 픽셀의 중앙값
  const br = [], bg = [], bb = [];
  const pushBorder = (x, y) => {
    const i = (y * w + x) * 4;
    br.push(px[i]);
    bg.push(px[i + 1]);
    bb.push(px[i + 2]);
  };
  for (let x = 0; x < w; x++) (pushBorder(x, 0), pushBorder(x, h - 1));
  for (let y = 0; y < h; y++) (pushBorder(0, y), pushBorder(w - 1, y));
  const bgColor = opts.bgColor ?? [median(br), median(bg), median(bb)];
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3];
    const dr = px[i * 4] - bgColor[0], dg = px[i * 4 + 1] - bgColor[1], db = px[i * 4 + 2] - bgColor[2];
    dist[i] = a < 10 ? 0 : Math.sqrt(dr * dr + dg * dg + db * db);
  }
  // 테두리에서 flood fill
  const T = opts.threshold, F = opts.feather;
  const bgMask = new Uint8Array(w * h); // 1 = 배경
  const stack = [];
  const seed = (x, y) => {
    const i = y * w + x;
    if (!bgMask[i] && dist[i] <= T) (bgMask[i] = 1, stack.push(i));
  };
  for (let x = 0; x < w; x++) (seed(x, 0), seed(x, h - 1));
  for (let y = 0; y < h; y++) (seed(0, y), seed(w - 1, y));
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  let enclosedRemoved = 0;
  if (opts.removeEnclosed) {
    for (let i = 0; i < w * h; i++) if (!bgMask[i] && dist[i] <= opts.enclosedThreshold) (bgMask[i] = 1, enclosedRemoved++);
  }
  // 알파 + 가장자리 페더 + 배경색 번짐 제거
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (bgMask[i]) continue;
    const x = i % w, y = (i - x) / w;
    const nearBg = (x > 0 && bgMask[i - 1]) || (x < w - 1 && bgMask[i + 1]) || (y > 0 && bgMask[i - w]) || (y < h - 1 && bgMask[i + w]);
    let a = 255;
    if (nearBg && dist[i] < T + F) a = Math.round(Math.max(0, Math.min(1, (dist[i] - T) / F)) * 255);
    alpha[i] = Math.min(a, px[i * 4 + 3]);
    if (a > 0 && a < 255) {
      const k = a / 255;
      for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, (px[i * 4 + c] - (1 - k) * bgColor[c]) / k));
    }
  }
  // 연결 요소 — 큰 덩어리만 남김
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  for (let i = 0; i < w * h; i++) {
    if (alpha[i] < 24 || label[i] >= 0) continue;
    const id = comps.length;
    let area = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    const st = [i];
    label[i] = id;
    while (st.length) {
      const j = st.pop();
      area++;
      const x = j % w, y = (j - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const n of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) {
        if (n >= 0 && label[n] < 0 && alpha[n] >= 24) (label[n] = id, st.push(n));
      }
    }
    comps.push({id, area, minX, minY, maxX, maxY});
  }
  const largest = Math.max(0, ...comps.map((c) => c.area));
  const core = opts.coreRect; // 원래 크롭 사각형(영역 좌표)
  const keep = new Set(
    comps
      .filter((c) => c.area >= largest * opts.minComponentRatio)
      .filter((c) => !core || (c.maxX >= core.x && c.minX <= core.x + core.w && c.maxY >= core.y && c.minY <= core.y + core.h))
      .map((c) => c.id),
  );
  let minX = w, minY = h, maxX = -1, maxY = -1, opaque = 0;
  for (let i = 0; i < w * h; i++) {
    if (label[i] >= 0 && !keep.has(label[i])) alpha[i] = 0;
    if (alpha[i] < 24) {
      if (label[i] < 0 && alpha[i] > 0) alpha[i] = 0; // 아주 옅은 배경 잔여물
      continue;
    }
    if (label[i] >= 0 && !keep.has(label[i])) continue;
    opaque++;
    const x = i % w, y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = alpha[i];
  const touches = {left: minX <= 0, right: maxX >= w - 1, top: minY <= 0, bottom: maxY >= h - 1};
  return {px, w, h, bbox: maxX < 0 ? null : {minX, minY, maxX, maxY}, touches, bgColor, coverage: opaque / (w * h), enclosedRemoved, droppedComponents: comps.length - keep.size};
};

ensureDir(PUBLIC_CHAR_DIR);
const results = [];
const sprites = {};
const meta = {};
for (const crop of crops) {
  const o = {...config, ...(crop.threshold !== undefined ? {threshold: crop.threshold} : {}), ...(crop.margin !== undefined ? {margin: crop.margin} : {}), ...(crop.feather !== undefined ? {feather: crop.feather} : {}), ...(config.overrides[crop.id] ?? {})};
  const result = {id: crop.id, character: crop.character, pose: crop.pose, expression: crop.expression, source: crop.source, rect: crop.rect, settings: {threshold: o.threshold, feather: o.feather, margin: o.margin}, flags: []};
  results.push(result);
  const sheet = crop.source ? await loadSheet(crop.source) : null;
  if (!sheet) {
    result.flags.push('원본 시트 없음');
    continue;
  }
  const ext = {l: o.margin, r: o.margin, t: o.margin, b: o.margin};
  let out;
  let region;
  for (let attempt = 0; attempt <= o.autoExpandMax; attempt++) {
    const x0 = Math.max(0, crop.rect.x - ext.l), y0 = Math.max(0, crop.rect.y - ext.t);
    const x1 = Math.min(sheet.width, crop.rect.x + crop.rect.w + ext.r), y1 = Math.min(sheet.height, crop.rect.y + crop.rect.h + ext.b);
    region = {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
    out = cutout(sheet, region, {...o, coreRect: {x: crop.rect.x - x0, y: crop.rect.y - y0, w: crop.rect.w, h: crop.rect.h}});
    // 시트 가장자리에 붙은 쪽은 더 늘릴 수 없음
    const grow = {
      l: out.touches.left && x0 > 0,
      r: out.touches.right && x1 < sheet.width,
      t: out.touches.top && y0 > 0,
      b: out.touches.bottom && y1 < sheet.height,
    };
    if (!Object.values(grow).some(Boolean) || attempt === o.autoExpandMax) break;
    const sx = Math.ceil(crop.rect.w * o.autoExpandStep), sy = Math.ceil(crop.rect.h * o.autoExpandStep);
    if (grow.l) ext.l += sx;
    if (grow.r) ext.r += sx;
    if (grow.t) ext.t += sy;
    if (grow.b) ext.b += sy;
    result.autoExpanded = (result.autoExpanded ?? 0) + 1;
  }
  result.region = region;
  result.bgColor = out.bgColor;
  result.coverage = Number(out.coverage.toFixed(3));
  result.droppedComponents = out.droppedComponents;
  if (out.enclosedRemoved) result.enclosedRemoved = out.enclosedRemoved;
  const touching = Object.entries(out.touches).filter(([, v]) => v).map(([k]) => k);
  if (touching.length) result.flags.push(`경계 접촉(잘림 의심): ${touching.join(',')}`);
  if (!out.bbox) {
    result.flags.push('남은 픽셀 없음 — threshold 가 너무 큼');
    continue;
  }
  if (out.coverage < 0.08) result.flags.push('불투명 영역이 매우 작음 — threshold 확인');
  const bgL = (out.bgColor[0] + out.bgColor[1] + out.bgColor[2]) / 3;
  if (bgL < 170) result.flags.push(`추정 배경색이 아이보리가 아님 (${out.bgColor.join(',')}) — 크롭 테두리에 캐릭터가 걸쳐 있을 수 있음`);

  const pad = o.outputPadding;
  const {minX, minY, maxX, maxY} = out.bbox;
  const file = `${slug(crop.character)}__${slug(crop.pose)}__${slug(crop.expression)}${crops.filter((c) => spriteKey(c.character, c.pose, c.expression) === spriteKey(crop.character, crop.pose, crop.expression)).length > 1 ? '__' + slug(crop.id) : ''}.png`;
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  await sharp(Buffer.from(out.px.buffer), {raw: {width: out.w, height: out.h, channels: 4}})
    .extract({left: minX, top: minY, width: tw, height: th})
    .extend({top: pad, bottom: pad, left: pad, right: pad, background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png({compressionLevel: 9})
    .toFile(path.join(PUBLIC_CHAR_DIR, file));
  const rel = `characters/${file}`;
  result.output = rel;
  result.size = {width: tw + pad * 2, height: th + pad * 2};
  meta[rel] = {...result.size, padding: pad};
  sprites[spriteKey(crop.character, crop.pose, crop.expression)] ??= rel;
  sprites[`id:${slug(crop.id)}`] = rel;
}
writeJson(path.join(PUBLIC_CHAR_DIR, 'index.json'), {generatedAt: new Date().toISOString(), sprites, meta});

// ---------------------------------------------------------------- contact sheet
const TILE_W = 280, TILE_H = 330, IMG_H = 260, COLS = Math.min(6, Math.max(1, results.length));
const ok = results.filter((r) => r.output);
if (ok.length) {
  const rows = Math.ceil(results.length / COLS);
  const checker = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${IMG_H}"><defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#ffffff"/><rect width="10" height="10" fill="#d9d9d9"/><rect x="10" y="10" width="10" height="10" fill="#d9d9d9"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`),
  )
    .png()
    .toBuffer();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
  const layers = [];
  for (const [i, r] of results.entries()) {
    const left = (i % COLS) * TILE_W, top = Math.floor(i / COLS) * TILE_H;
    layers.push({input: checker, left, top});
    if (r.output) {
      const img = await sharp(path.join(PUBLIC_CHAR_DIR, path.basename(r.output))).resize({width: TILE_W - 16, height: IMG_H - 16, fit: 'inside'}).toBuffer({resolveWithObject: true});
      layers.push({input: img.data, left: left + Math.round((TILE_W - img.info.width) / 2), top: top + Math.round((IMG_H - img.info.height) / 2)});
    }
    const flagged = r.flags.length > 0;
    const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}"><rect x="1" y="1" width="${TILE_W - 2}" height="${TILE_H - 2}" fill="none" stroke="${flagged ? '#e0242b' : '#9a9a9a'}" stroke-width="${flagged ? 5 : 1}"/><rect y="${IMG_H}" width="${TILE_W}" height="${TILE_H - IMG_H}" fill="${flagged ? '#ffe3e3' : '#f4f4f4'}"/><text x="8" y="${IMG_H + 22}" font-family="WenQuanYi Zen Hei, sans-serif" font-size="15" fill="#222">${esc(r.id).slice(0, 34)}</text><text x="8" y="${IMG_H + 42}" font-family="WenQuanYi Zen Hei, sans-serif" font-size="12" fill="#555">${r.size ? `${r.size.width}×${r.size.height}` : '—'} t=${r.settings.threshold} m=${r.settings.margin}${r.autoExpanded ? ` +확장${r.autoExpanded}` : ''}</text><text x="8" y="${IMG_H + 60}" font-family="WenQuanYi Zen Hei, sans-serif" font-size="12" fill="#c01818">${esc(r.flags.join(' / ')).slice(0, 44)}</text></svg>`;
    layers.push({input: Buffer.from(label), left, top});
  }
  ensureDir(OUT_DIR);
  await sharp({create: {width: COLS * TILE_W, height: rows * TILE_H, channels: 4, background: '#ffffff'}})
    .composite(layers)
    .png()
    .toFile(path.join(OUT_DIR, 'contact-sheet.png'));
}
const flagged = results.filter((r) => r.flags.length);
writeJson(path.join(OUT_DIR, 'preprocess-report.json'), {generatedAt: new Date().toISOString(), config: {...config, overrides: undefined}, total: results.length, written: ok.length, flagged: flagged.length, results});
generateProjectData();
console.log(`완료: ${ok.length}/${results.length}개 PNG → public/characters, 검수 필요 ${flagged.length}개`);
flagged.forEach((r) => console.log(`  ! ${r.id}: ${r.flags.join(' / ')}`));
if (ok.length) console.log('contact sheet: out/contact-sheet.png');
