// 최종 QA → out/qa-report.json
//  - 타임라인 연속성(0~2,880 빈틈·중복 없음), 120초, 숏 28개
//  - 자산 존재(배경·소품·컷아웃·컨택트시트), 누락 오디오
//  - 레이아웃 기하 검사 (렌더러와 같은 규칙): 화면 잘림, 캐릭터 겹침, 그네 안전경계 안 진입, 자막과 얼굴 충돌, 표지판 안전영역/가림
//  - 출력 파일: 길이·해상도·오디오 유무, 검은 프레임(ffmpeg blackdetect), SRT 사본, 키프레임 8장
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {EXPECTED, OUT_DIR, PUBLIC_DIR, REQUIRED_FILES, exists, readJson, sourcePath, writeJson} from './lib/paths.mjs';
import {computeMissingAudio, generateProjectData} from './lib/generate.mjs';
import {probe} from './lib/probe.mjs';

const data = generateProjectData();
const checks = [];
const add = (name, status, detail = {}) => checks.push({name, status, ...detail}); // pass | fail | warn | skip
const W = data.meta.width, H = data.meta.height, SAFE = data.meta.safeArea ?? 0.05;

add('required-inputs', REQUIRED_FILES.every((f) => exists(sourcePath(f))) ? 'pass' : 'fail', {missing: REQUIRED_FILES.filter((f) => !exists(sourcePath(f)))});

if (!data.available) add('timeline', 'skip', {reason: 'timeline 없음'});
else {
  const {shots, meta} = data;
  const gaps = shots.map((s, i) => ({s, e: i ? shots[i - 1].from + shots[i - 1].durationInFrames : 0})).filter(({s, e}) => s.from !== e).map(({s, e}) => ({shot: s.id, from: s.from, expected: e}));
  const end = shots.at(-1).from + shots.at(-1).durationInFrames;
  add('timeline-continuity', gaps.length ? 'fail' : 'pass', {gaps, coverage: `0~${end - 1}`});
  add('shot-count', shots.length === EXPECTED.shotCount ? 'pass' : 'fail', {actual: shots.length});
  add('duration-120s', meta.durationInFrames === EXPECTED.durationInFrames && end === EXPECTED.durationInFrames && meta.fps === EXPECTED.fps ? 'pass' : 'fail', {frames: meta.durationInFrames, fps: meta.fps, seconds: meta.durationInFrames / meta.fps});
  const finite = JSON.stringify(data).match(/NaN|Infinity/g);
  add('no-nan-values', finite ? 'fail' : 'pass');
  const val = exists(path.join(OUT_DIR, 'validation-report.json')) ? readJson(path.join(OUT_DIR, 'validation-report.json')) : null;
  add('srt-matches-voice-lines', val?.timeline?.srtMatchesVoiceLines ? 'pass' : 'fail');
  // 대사가 배정된 숏 밖에서 재생되는 경우 (데이터 불일치 — 수정하지 않고 보고)
  const outside = [];
  for (const s of shots)
    for (const id of s.dialogue) {
      const l = data.voiceLines.find((v) => v.id === id);
      if (l && (l.from < s.from || l.to > s.from + s.durationInFrames + meta.transitionFrames)) outside.push({line: id, frames: `${l.from}~${l.to}`, assignedShot: s.id, shotFrames: `${s.from}~${s.from + s.durationInFrames}`, playsDuring: shots.filter((x) => x.from < l.to && x.from + x.durationInFrames > l.from).map((x) => x.id)});
    }
  add('dialogue-within-assigned-shot', outside.length ? 'warn' : 'pass', {note: 'voice-lines/SRT 시간과 timeline 숏 배정이 다름. 시간·문구는 바꾸지 않았다.', items: outside});
}

// 자산 ---------------------------------------------------------------------
add('backgrounds-exist', data.shots.every((s) => s.backgroundExists) ? 'pass' : 'fail');
add('props-exist', data.shots.every((s) => s.props.every((p) => p.exists)) ? 'pass' : 'fail');
const missingSprites = data.shots.flatMap((s) => s.characters.filter((c) => !c.sprite).map((c) => ({shot: s.id, character: c.id, resolution: c.resolution})));
add('character-cutouts-exist', missingSprites.length ? 'fail' : 'pass', {missing: missingSprites});
const pre = exists(path.join(OUT_DIR, 'preprocess-report.json')) ? readJson(path.join(OUT_DIR, 'preprocess-report.json')) : null;
add('cutout-contact-sheet', pre?.written && exists(path.join(OUT_DIR, 'contact-sheets', 'character-cutouts.png')) ? (pre.flagged ? 'warn' : 'pass') : 'fail', {cutouts: pre?.written ?? 0, flagged: (pre?.results ?? []).filter((r) => r.flags.length).map((r) => ({id: r.id, flags: r.flags})), file: 'out/contact-sheets/character-cutouts.png'});
const resolved = data.shots.flatMap((s) => s.characters.filter((c) => c.pose !== c.spriteName).map((c) => ({shot: s.id, character: c.id, resolution: c.resolution})));
add('pose-name-resolution', 'pass', {note: '타임라인 pose 이름 → 컷아웃 해석 (crops fallbacks + production.config.json expressionBodyPose)', items: resolved});
const audio = computeMissingAudio(data);
add('audio-exists', audio.allAudioPresent ? 'pass' : 'warn', {voiceFilesMissing: audio.voice.length, musicMissing: audio.music, sfxMissing: audio.sfx, report: 'out/missing-assets.json'});

// 레이아웃 기하 (렌더러와 같은 규칙) -------------------------------------------------
const cam = (c, t) => {
  const s = c.scaleFrom + (c.scaleTo - c.scaleFrom) * t;
  const cx = c.xFrom + (c.xTo - c.xFrom) * t, cy = c.yFrom + (c.yTo - c.yFrom) * t;
  const tx = Math.min(0, Math.max(W * (1 - s), W / 2 - s * cx * W));
  const ty = Math.min(0, Math.max(H * (1 - s), H / 2 - s * cy * H));
  return (x, y) => [tx + s * x, ty + s * y];
};
const charBox = (c, t) => {
  const meta = data.spriteMeta[c.sprite];
  if (!meta) return null;
  const bust = c.spriteKind === 'expression';
  const sc = c.scaleFrom + (c.scaleTo - c.scaleFrom) * t;
  const oh = sc * H * (bust ? data.config.bustScaleMultiplier ?? 1 : 1);
  const k = oh / (meta.height - meta.padTop - meta.padBottom);
  const w = (meta.width - 12) * k;
  const x = (c.xFrom + (c.xTo - c.xFrom) * t) * W;
  const yy = c.yFrom + (c.yTo - c.yFrom) * t;
  const foot = bust ? Math.max(yy, 1) * H + data.config.bustBottomOverhang * H : yy * H;
  return {l: x - w / 2, r: x + w / 2, t: foot - oh, b: foot, foot: [x, yy * H], bust};
};
const toScreen = (box, f) => {
  const [l, t] = f(box.l, box.t), [r, b] = f(box.r, box.b);
  return {l, t, r, b};
};
const layout = [];
const subTop = H * (1 - data.meta.subtitleBottom) - H * 0.05 * 1.3 - H * 0.024;
if (data.available)
  for (const s of data.shots) {
    if (!s.backgroundExists) layout.push({shot: s.id, kind: 'empty-frame', severity: 'fail'});
    const hasSub = data.subtitles.some((c) => c.from < s.from + s.durationInFrames && c.to > s.from);
    for (const t of [0, 0.5, 1]) {
      const f = cam(s.camera, t);
      const boxes = s.characters.map((c) => ({c, b: charBox(c, t)})).filter((x) => x.b);
      for (const {c, b} of boxes) {
        const sb = toScreen(b, f);
        const moving = c.xFrom !== c.xTo;
        const entering = moving && t === 0 && (c.xFrom < 0.12 || c.xFrom > 0.88);
        const exiting = moving && t === 1 && (c.xTo < 0.12 || c.xTo > 0.88);
        const outL = Math.max(0, -sb.l), outR = Math.max(0, sb.r - W), outT = Math.max(0, -sb.t);
        const cut = Math.max(outL, outR) / (sb.r - sb.l);
        if (!b.bust && (cut > 0.02 || outT > 0)) layout.push({shot: s.id, kind: entering ? 'entering-from-edge' : exiting ? 'exiting-to-edge' : 'clipping', severity: entering || exiting ? 'info' : 'warn', character: c.id, at: t, cutRatio: Number(cut.toFixed(3)), headOutTop: outT > 0});
        // 클로즈업 흉상: 얼굴(위 65%)이 자막 띠와 겹치는지
        if (b.bust && hasSub) {
          const faceBottom = sb.t + (sb.b - sb.t) * 0.65;
          if (faceBottom > subTop) layout.push({shot: s.id, kind: 'subtitle-over-face', severity: 'warn', character: c.id, at: t, faceBottom: Math.round(faceBottom), subtitleTop: Math.round(subTop)});
        }
      }
      // 캐릭터끼리 겹침: 좁은 쪽 너비의 45% 이상
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].b, bb = boxes[j].b;
          const ov = Math.min(a.r, bb.r) - Math.max(a.l, bb.l);
          const ratio = ov / Math.min(a.r - a.l, bb.r - bb.l);
          if (ratio > 0.45 && t === 0.5) layout.push({shot: s.id, kind: 'character-overlap', severity: 'info', pair: [boxes[i].c.id, boxes[j].c.id], ratio: Number(ratio.toFixed(2))});
        }
      // 그네 안전경계: 모든 캐릭터 발이 (바닥 압축된) 점선 타원 밖
      for (const p of s.props.filter((p) => p.kind === 'boundary')) {
        const vb = data.propMeta[p.asset] ?? {width: 1200, height: 560};
        const sq = data.config.propOverrides?.[p.id]?.groundSquash ?? 1;
        const bw = p.scale * W, bh = ((bw * vb.height) / vb.width) * sq;
        const ex = p.x * W, ey = p.y * H - bh / 2, rx = (535 / 1200) * bw, ry = (215 / 560) * ((bw * vb.height) / vb.width) * sq;
        for (const {c, b} of boxes) {
          const [fx, fy] = b.foot;
          const d = ((fx - ex) / rx) ** 2 + ((fy - ey) / ry) ** 2;
          if (d < 1) layout.push({shot: s.id, kind: 'inside-swing-boundary', severity: 'fail', character: c.id, at: t});
        }
      }
      // 표지판: 안전영역, 캐릭터에 가려지는 비율
      for (const p of s.props.filter((p) => p.kind === 'board')) {
        const size = data.propMeta[p.asset] ?? {width: 1536, height: 1024};
        const h = p.scale * H, w = (h * size.width) / size.height;
        let cx = p.x * W;
        const visR = cx - w / 2 + (1514 / 1536) * w, visL = cx - w / 2 + (22 / 1536) * w;
        const shifted = visR > W * (1 - SAFE) ? visR - W * (1 - SAFE) : visL < W * SAFE ? visL - W * SAFE : 0;
        cx -= shifted;
        if (shifted && t === 0) layout.push({shot: s.id, kind: 'board-moved-into-safe-area', severity: 'info', shiftPx: Math.round(shifted), xPercent: Number(((cx / W) * 100).toFixed(1))});
        const bl = cx - w / 2, br = cx + w / 2;
        const front = boxes.filter(({b}) => b.foot[1] > p.y * H);
        const covered = front.reduce((acc, {b}) => acc + Math.max(0, Math.min(br, b.r) - Math.max(bl, b.l)), 0) / w;
        if (covered > 0.3 && t === 0.5) layout.push({shot: s.id, kind: 'board-partly-hidden-by-character', severity: 'warn', coveredWidthRatio: Number(Math.min(1, covered).toFixed(2))});
      }
    }
  }
const sev = (k) => layout.filter((l) => l.severity === k).length;
add('layout-fixes-applied', data.layoutFixesApplied?.length ? 'warn' : 'pass', {note: 'timeline 위치를 보정한 항목 (production.config.json layoutFixes)', items: data.layoutFixesApplied ?? []});
add('layout', sev('fail') ? 'fail' : sev('warn') ? 'warn' : 'pass', {summary: {fail: sev('fail'), warn: sev('warn'), info: sev('info')}, issues: layout});

// 출력 ------------------------------------------------------------------------
const outputs = {};
/** ffmpeg blackdetect: 0.04초 이상 검은 구간 개수 */
const blackFrames = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'blackdetect=d=0.04:pix_th=0.06', '-an', '-f', 'null', '-'], {encoding: 'utf8'});
  return r.status === 0 ? (r.stderr.match(/black_start/g) ?? []).length : null;
};
for (const [key, file, w, h] of [
  ['preview', 'dino-playground-preview-silent.mp4', 960, 540],
  ['final', 'dino-playground-final.mp4', 1920, 1080],
]) {
  const p = path.join(OUT_DIR, file);
  if (!exists(p)) {
    outputs[key] = {file: `out/${file}`, exists: false};
    add(`output-${key}`, key === 'final' && !audio.allAudioPresent ? 'skip' : 'fail', {file: `out/${file}`, reason: key === 'final' ? '오디오가 모두 있을 때만 렌더' : '렌더되지 않음'});
    continue;
  }
  const info = probe(p);
  const vDur = info?.video?.frames ? info.video.frames / EXPECTED.fps : info?.duration;
  const durOk = info && Math.abs(vDur - 120) <= 1 / EXPECTED.fps / 2 && info.video.frames === EXPECTED.durationInFrames;
  const resOk = info?.video?.width === w && info?.video?.height === h;
  const audioOk = key === 'preview' ? !info.hasAudio : info.hasAudio;
  const black = blackFrames(p);
  outputs[key] = {file: `out/${file}`, sizeBytes: fs.statSync(p).size, ...info, blackSegments: black};
  add(`output-${key}`, durOk && resOk && audioOk && black === 0 ? 'pass' : 'fail', {videoFrames: info?.video?.frames, videoSeconds: vDur, containerSeconds: info?.duration, resolution: `${info?.video?.width}x${info?.video?.height}`, hasAudio: info?.hasAudio, blackSegments: black});
}
const kf = exists(path.join(OUT_DIR, 'keyframes', 'stills.json')) ? readJson(path.join(OUT_DIR, 'keyframes', 'stills.json')) : null;
add('keyframes-8', kf?.rendered?.length >= 8 ? 'pass' : 'fail', {files: kf?.rendered?.map((r) => r.file) ?? []});
const srtSame = exists(path.join(OUT_DIR, 'subtitles.ko.srt')) && fs.readFileSync(path.join(OUT_DIR, 'subtitles.ko.srt')).equals(fs.readFileSync(sourcePath('data/subtitles.ko.srt')));
add('srt-copied-unchanged', srtSame ? 'pass' : 'fail');
// 원본 보존: 프로젝트 사본이 원본과 같은지 (원본을 수정하지 않았는지)
const tampered = (readJson(path.join(PUBLIC_DIR, 'assets', 'manifest.json')).existingAssets ?? []).filter((a) => exists(sourcePath(a.path)) && exists(path.join(PUBLIC_DIR, a.path)) && fs.statSync(path.join(PUBLIC_DIR, a.path)).size !== fs.statSync(path.join(path.dirname(path.dirname(sourcePath('assets/manifest.json'))), a.path)).size);
add('source-assets-untouched', tampered.length ? 'fail' : 'pass', {note: '원본 assets/ 는 읽기만 하고, 컷아웃은 dino-playground-video/public/assets/characters/cutouts 에만 쓴다'});

const summary = {pass: 0, fail: 0, warn: 0, skip: 0};
checks.forEach((c) => summary[c.status]++);
writeJson(path.join(OUT_DIR, 'qa-report.json'), {generatedAt: new Date().toISOString(), ok: summary.fail === 0 && data.available, summary, checks, outputs});
console.log(`QA: pass ${summary.pass} / fail ${summary.fail} / warn ${summary.warn} / skip ${summary.skip} → out/qa-report.json`);
checks.filter((c) => c.status !== 'pass').forEach((c) => console.log(`  [${c.status}] ${c.name}${c.summary ? ' ' + JSON.stringify(c.summary) : ''}`));
