// 입력 파일·자산·타임라인 검증 → out/validation-report.json, out/missing-assets.json
// 사용법: node scripts/validate.mjs [--strict]   (--strict: 오류가 있으면 종료코드 1)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {EXPECTED, OUT_DIR, REQUIRED_FILES, WORKSPACE_ROOT, exists, readJson, sourcePath, writeJson} from './lib/paths.mjs';
import {extractCrops} from './lib/normalize.mjs';
import {computeMissingAudio, generateProjectData} from './lib/generate.mjs';

const errors = [];
const warnings = [];
const walkFiles = (dir) => (exists(dir) ? fs.readdirSync(dir, {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? walkFiles(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : [])) : []);
const rel = (f) => path.relative(WORKSPACE_ROOT, f);

// 1) 필수 입력
const required = REQUIRED_FILES.map((f) => ({file: f, exists: exists(sourcePath(f))}));
required.filter((r) => !r.exists).forEach((r) => errors.push(`필수 입력 누락: ${r.file}`));

// 2) JSON 유효성
const jsonChecks = [...walkFiles(path.join(WORKSPACE_ROOT, 'data')), ...walkFiles(path.join(WORKSPACE_ROOT, 'assets'))]
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'));
      return {file: rel(f), valid: true};
    } catch (e) {
      errors.push(`JSON 오류: ${rel(f)} — ${e.message}`);
      return {file: rel(f), valid: false, error: e.message};
    }
  });

// 3) 이미지 크기·알파 (manifest 선언과 비교)
const manifest = exists(sourcePath('assets/manifest.json')) ? readJson(sourcePath('assets/manifest.json')) : {};
const declared = Object.fromEntries((manifest.existingAssets ?? []).map((a) => [a.path, a]));
const images = {};
for (const f of walkFiles(path.join(WORKSPACE_ROOT, 'assets')).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
  const r = rel(f);
  const m = await sharp(f).metadata();
  const alphaUsed = m.hasAlpha ? (await sharp(f).stats()).channels[3].min < 255 : false;
  images[r] = {width: m.width, height: m.height, format: m.format, hasAlpha: Boolean(m.hasAlpha), alphaUsed};
  const d = declared[r];
  if (d) {
    if (d.width && (d.width !== m.width || d.height !== m.height)) errors.push(`${r}: 크기 ${m.width}×${m.height} ≠ manifest ${d.width}×${d.height}`);
    if (d.alpha === true && !alphaUsed) errors.push(`${r}: manifest 는 alpha:true 인데 투명 픽셀 없음`);
    if (d.alpha === false && alphaUsed) warnings.push(`${r}: manifest 는 alpha:false 인데 투명 픽셀 있음`);
  } else warnings.push(`${r}: manifest 에 없는 이미지`);
}
for (const a of manifest.existingAssets ?? []) if (!exists(path.join(WORKSPACE_ROOT, a.path))) errors.push(`manifest 자산 누락: ${a.path}`);

// 4) 정규화 데이터
const data = generateProjectData();
data.problems.forEach((p) => errors.push(p));
const crops = exists(sourcePath('data/character-crops-v1.json')) ? extractCrops(readJson(sourcePath('data/character-crops-v1.json'))) : [];
for (const c of crops) {
  const img = images[c.source];
  if (!img) errors.push(`크롭 ${c.id}: 시트 없음 ${c.source}`);
  else if (c.rect.x + c.rect.w > img.width || c.rect.y + c.rect.h > img.height) errors.push(`크롭 ${c.id}: 시트 밖 ${JSON.stringify(c.rect)}`);
}

const tl = {available: data.available};
if (data.available) {
  const {meta, shots} = data;
  Object.assign(tl, {fps: meta.fps, durationInFrames: meta.durationInFrames, shotCount: shots.length});
  if (meta.fps !== EXPECTED.fps) errors.push(`fps ${meta.fps} ≠ ${EXPECTED.fps}`);
  if (meta.durationInFrames !== EXPECTED.durationInFrames) errors.push(`총 프레임 ${meta.durationInFrames} ≠ ${EXPECTED.durationInFrames}`);
  if (shots.length !== EXPECTED.shotCount) errors.push(`숏 개수 ${shots.length} ≠ ${EXPECTED.shotCount}`);
  shots.forEach((s, i) => {
    const expected = i ? shots[i - 1].from + shots[i - 1].durationInFrames : 0;
    if (s.from !== expected) errors.push(`타임라인 빈틈/중복: ${s.id} 시작 ${s.from} (기대 ${expected})`);
    if (s.durationInFrames <= 0) errors.push(`${s.id}: 길이 ${s.durationInFrames}`);
    if (!s.backgroundExists) errors.push(`${s.id}: 배경 없음 ${s.background}`);
    s.props.filter((p) => p.asset && !p.exists).forEach((p) => errors.push(`${s.id}: 소품 없음 ${p.asset}`));
    s.characters.filter((c) => !c.sprite).forEach((c) => errors.push(`${s.id}: ${c.id} 컷아웃 없음 (${c.resolution}) — npm run preprocess`));
    const zoom = Math.max(s.camera.scaleFrom, s.camera.scaleTo) / Math.min(s.camera.scaleFrom, s.camera.scaleTo);
    if (zoom > 1.08 + 1e-9) warnings.push(`${s.id}: 한 숏 줌 변화 ${(zoom * 100 - 100).toFixed(1)}% (> 8%)`);
  });
  const last = shots.at(-1);
  if (last.from + last.durationInFrames !== meta.durationInFrames) errors.push(`마지막 숏 끝 ${last.from + last.durationInFrames} ≠ ${meta.durationInFrames}`);
  const lineIds = new Set(data.voiceLines.map((l) => l.id));
  shots.forEach((s) => s.dialogue.filter((id) => !lineIds.has(id)).forEach((id) => errors.push(`${s.id}: 대사 ${id} 가 voice-lines 에 없음`)));
  // 대사가 배정된 숏 안에 있는지 (디졸브 12프레임 허용)
  for (const s of shots)
    for (const id of s.dialogue) {
      const l = data.voiceLines.find((v) => v.id === id);
      if (l && (l.from < s.from || l.to > s.from + s.durationInFrames + meta.transitionFrames)) warnings.push(`${id}(${l.from}~${l.to}) 가 ${s.id}(${s.from}~${s.from + s.durationInFrames}) 밖으로 걸침`);
    }
  // SRT ↔ voice-lines: 문구·타이밍 일치
  const mismatch = [];
  data.voiceLines.forEach((l, i) => {
    const c = data.subtitles[i];
    if (!c) return mismatch.push(`${l.id}: 자막 없음`);
    if (c.text.replace(/\s+/g, ' ').trim() !== l.text.trim()) mismatch.push(`${l.id}: 문구 다름 "${c.text}" vs "${l.text}"`);
    if (Math.abs(c.startSec - l.startSec) > 0.001 || Math.abs(c.endSec - (l.endSec ?? 0)) > 0.001) mismatch.push(`${l.id}: 시간 다름 SRT ${c.startSec}-${c.endSec} vs ${l.startSec}-${l.endSec}`);
  });
  if (data.subtitles.length !== data.voiceLines.length) mismatch.push(`자막 ${data.subtitles.length}개 vs 대사 ${data.voiceLines.length}개`);
  mismatch.forEach((m) => errors.push(`SRT/대사 불일치: ${m}`));
  tl.srtMatchesVoiceLines = mismatch.length === 0;
  data.subtitles.forEach((c, i) => {
    if (i && c.from < data.subtitles[i - 1].to) errors.push(`자막 #${c.index} 이 이전 자막과 겹침`);
    if (c.to > meta.durationInFrames) errors.push(`자막 #${c.index} 120초 초과`);
  });
}

// 5) 누락 오디오
const audio = computeMissingAudio(data);
const missingAssets = {
  generatedAt: new Date().toISOString(),
  note: '누락 오디오는 생성·다운로드·무음 파일로 대체하지 않았다. 아래 경로(작업공간 루트 기준)에 파일을 넣고 npm run sync → validate → render:final 을 실행한다.',
  requiredInputs: required.filter((r) => !r.exists).map((r) => r.file),
  images: (manifest.existingAssets ?? []).filter((a) => !exists(path.join(WORKSPACE_ROOT, a.path))).map((a) => a.path),
  audio: {
    voiceFiles: audio.voice.length,
    voice: audio.voice,
    music: audio.music,
    sfx: audio.sfx,
    otherCues: audio.otherCues,
  },
  allAudioPresent: audio.allAudioPresent,
};
writeJson(path.join(OUT_DIR, 'missing-assets.json'), missingAssets);
writeJson(path.join(OUT_DIR, 'validation-report.json'), {generatedAt: missingAssets.generatedAt, ok: errors.length === 0, errors, warnings, required, jsonChecks, images, crops: crops.length, timeline: tl, allAudioPresent: audio.allAudioPresent});

console.log(`검증 결과: 오류 ${errors.length}, 경고 ${warnings.length}`);
errors.slice(0, 40).forEach((e) => console.log('  ✗ ' + e));
warnings.slice(0, 30).forEach((w) => console.log('  ! ' + w));
console.log(`이미지 ${Object.keys(images).length}개, 크롭 ${crops.length}개, 숏 ${data.shots.length}개, 대사 ${data.voiceLines.length}개, 자막 ${data.subtitles.length}개`);
console.log(`누락 오디오: 음성 ${audio.voice.length}, 음악 ${audio.music.length}, 효과음 ${audio.sfx.length} → out/missing-assets.json`);
if (process.argv.includes('--strict') && errors.length) process.exit(1);
