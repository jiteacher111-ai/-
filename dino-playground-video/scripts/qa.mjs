// 최종 QA: 타임라인 연속성, 자산 존재, 120초 길이, 출력 파일, 레이아웃(잘림·겹침·빈 프레임·안전선·자막 충돌)
// 결과: out/qa-report.json
import fs from 'node:fs';
import path from 'node:path';
import {EXPECTED, OUT_DIR, REQUIRED_FILES, exists, readJson, sourcePath, writeJson} from './lib/paths.mjs';
import {computeMissingAudio, generateProjectData} from './lib/generate.mjs';
import {probe} from './lib/probe.mjs';

const data = generateProjectData();
const checks = [];
const add = (name, status, detail = {}) => checks.push({name, status, ...detail}); // status: pass | fail | warn | skip

// 입력 -------------------------------------------------------------------------
const missingReq = REQUIRED_FILES.filter((f) => !exists(sourcePath(f)));
add('required-inputs', missingReq.length ? 'fail' : 'pass', {missing: missingReq});

// 타임라인 ---------------------------------------------------------------------
if (!data.available) {
  add('timeline-continuity', 'skip', {reason: 'data/timeline-v1.json 없음'});
} else {
  const {shots, meta} = data;
  const gaps = shots.map((s, i) => ({s, expected: i ? shots[i - 1].from + shots[i - 1].durationInFrames : 0})).filter(({s, expected}) => s.from !== expected).map(({s, expected}) => ({shot: s.id, from: s.from, expected}));
  const end = shots.at(-1) ? shots.at(-1).from + shots.at(-1).durationInFrames : 0;
  add('timeline-continuity', gaps.length || shots.some((s) => s.durationInFrames <= 0) ? 'fail' : 'pass', {gaps});
  add('shot-count', shots.length === EXPECTED.shotCount ? 'pass' : 'fail', {actual: shots.length, expected: EXPECTED.shotCount});
  add('total-frames', meta.durationInFrames === EXPECTED.durationInFrames && end === EXPECTED.durationInFrames ? 'pass' : 'fail', {declared: meta.durationInFrames, lastShotEnd: end, expected: EXPECTED.durationInFrames, fps: meta.fps});
  const srtEnd = Math.max(0, ...data.subtitles.map((c) => c.to));
  add('subtitles-within-120s', srtEnd <= EXPECTED.durationInFrames ? 'pass' : 'fail', {lastCueEndFrame: srtEnd, cues: data.subtitles.length});
}

// 자산 -------------------------------------------------------------------------
const missingBg = data.shots.filter((s) => s.background && !s.backgroundExists).map((s) => ({shot: s.id, path: s.background}));
add('backgrounds-exist', !data.available ? 'skip' : missingBg.length ? 'fail' : 'pass', {missing: missingBg});
const neededSprites = [];
for (const s of data.shots)
  for (const c of s.characters)
    for (const e of [c.expression, ...c.expressions.map((x) => x.expression)]) {
      const key = c.sprite ? `id:${c.sprite.toLowerCase()}` : [c.character, c.pose, e].map((v) => v.trim().replace(/[\\/\s]+/g, '_').replace(/[^\p{L}\p{N}_.-]/gu, '').toLowerCase()).join('|');
      if (!data.sprites[key]) neededSprites.push({shot: s.id, key});
    }
add('character-sprites-exist', !data.available ? 'skip' : neededSprites.length ? 'fail' : 'pass', {missing: neededSprites});
const pre = exists(path.join(OUT_DIR, 'preprocess-report.json')) ? readJson(path.join(OUT_DIR, 'preprocess-report.json')) : null;
add('cutouts-reviewed', !pre || !pre.total ? 'skip' : pre.flagged ? 'warn' : 'pass', {total: pre?.total ?? 0, flagged: (pre?.results ?? []).filter((r) => r.flags.length).map((r) => ({id: r.id, flags: r.flags})), contactSheet: exists(path.join(OUT_DIR, 'contact-sheet.png')) ? 'out/contact-sheet.png' : null});
const missingAssets = exists(path.join(OUT_DIR, 'missing-assets.json')) ? readJson(path.join(OUT_DIR, 'missing-assets.json')) : null;
const audio = computeMissingAudio(data);
add('audio-exists', audio.allAudioPresent ? 'pass' : 'warn', {voiceMissing: audio.voice.length, musicSfxMissing: audio.musicAndSfx.length, report: missingAssets ? 'out/missing-assets.json' : null});

// 레이아웃 (데이터 기반 기하 검사) --------------------------------------------------
const layout = [];
if (data.available) {
  const SAFE = 0.05, SUB_TOP = 1 - 0.06 - 0.17;
  for (const s of data.shots) {
    if (!s.background && !s.characters.length) layout.push({shot: s.id, kind: 'empty-frame', detail: '배경·캐릭터 모두 없음'});
    for (const c of s.characters) {
      const key = [c.character, c.pose, c.expression].map((v) => v.toLowerCase()).join('|');
      const file = c.sprite ? data.sprites[`id:${c.sprite.toLowerCase()}`] : data.sprites[key];
      const m = file ? data.spriteMeta[file] : null;
      const hRatio = c.scale;
      const wRatio = m ? (hRatio * (m.width / m.height) * data.meta.height) / data.meta.width : hRatio * 0.45;
      for (const [label, x, y] of [['rest', c.x, c.y], ...(c.move ? [['move-end', c.move.x, c.move.y]] : [])]) {
        const box = {l: x - wRatio / 2, r: x + wRatio / 2, t: y - hRatio, b: y};
        if (box.l < 0 || box.r > 1 || box.t < 0) layout.push({shot: s.id, kind: 'clipping', character: c.character, at: label, box});
        if (s.promiseBoard && box.r > 1 - SAFE - 0.4) layout.push({shot: s.id, kind: 'overlap-promise-board', character: c.character, at: label});
        if (box.t < SAFE) layout.push({shot: s.id, kind: 'head-outside-title-safe', character: c.character, at: label});
        for (const o of s.overlays.filter((o) => /zone|line|area/.test(o.type) && o.rect)) {
          const r = o.rect;
          if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) layout.push({shot: s.id, kind: 'inside-safety-zone', character: c.character, at: label, overlay: o.type, note: '의도된 장면이 아니라면 위치 조정'});
        }
      }
    }
    for (const o of s.overlays.filter((o) => o.rect)) {
      const r = o.rect;
      if (r.x < 0 || r.y < 0 || r.x + r.w > 1 || r.y + r.h > 1) layout.push({shot: s.id, kind: 'overlay-outside-frame', overlay: o.type});
      if (/check|stop|wait|caution|label/.test(o.type) && r.y + r.h > SUB_TOP) {
        const cue = data.subtitles.find((c) => c.from < s.from + s.durationInFrames && c.to > s.from);
        if (cue) layout.push({shot: s.id, kind: 'subtitle-collision', overlay: o.type});
      }
    }
  }
}
add('layout', !data.available ? 'skip' : layout.some((l) => /clipping|empty|collision|outside-frame/.test(l.kind)) ? 'fail' : layout.length ? 'warn' : 'pass', {issues: layout});

// 출력 -------------------------------------------------------------------------
const outputs = {};
for (const [key, file, w, h] of [
  ['preview', 'dino-playground-preview-silent.mp4', 960, 540],
  ['final', 'dino-playground-final.mp4', 1920, 1080],
]) {
  const p = path.join(OUT_DIR, file);
  if (!exists(p)) {
    outputs[key] = {file: `out/${file}`, exists: false};
    add(`output-${key}`, (key === 'final' && !audio.allAudioPresent) || !data.available ? 'skip' : 'fail', {file: `out/${file}`, reason: 'not rendered'});
    continue;
  }
  const info = probe(p);
  const durOk = info && Math.abs(info.duration - EXPECTED.durationInFrames / EXPECTED.fps) <= 1 / EXPECTED.fps;
  const resOk = info?.video && info.video.width === w && info.video.height === h;
  outputs[key] = {file: `out/${file}`, exists: true, sizeBytes: fs.statSync(p).size, ...info};
  add(`output-${key}`, durOk && resOk && (key === 'preview' ? !info.hasAudio : info.hasAudio) ? 'pass' : 'fail', {duration: info?.duration, expectedDuration: 120, resolution: info?.video ? `${info.video.width}x${info.video.height}` : null, hasAudio: info?.hasAudio});
}
const stills = exists(path.join(OUT_DIR, 'stills', 'stills.json')) ? readJson(path.join(OUT_DIR, 'stills', 'stills.json')) : null;
add('layout-stills', stills?.rendered?.length >= 8 ? 'pass' : data.available ? 'fail' : 'skip', {count: stills?.rendered?.length ?? 0});
add('srt-copied', exists(path.join(OUT_DIR, 'subtitles.ko.srt')) ? 'pass' : data.subtitles.length ? 'fail' : 'skip');

const summary = {pass: 0, fail: 0, warn: 0, skip: 0};
checks.forEach((c) => summary[c.status]++);
writeJson(path.join(OUT_DIR, 'qa-report.json'), {generatedAt: new Date().toISOString(), ok: summary.fail === 0 && data.available, summary, checks, outputs});
console.log(`QA: pass ${summary.pass} / fail ${summary.fail} / warn ${summary.warn} / skip ${summary.skip} → out/qa-report.json`);
checks.filter((c) => c.status !== 'pass').forEach((c) => console.log(`  [${c.status}] ${c.name}`));
