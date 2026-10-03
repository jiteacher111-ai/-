// 입력 파일·자산·타임라인 검증. 결과: out/validation-report.json, out/missing-assets.json
// 사용법: node scripts/validate.mjs [--strict]   (--strict: 오류가 있으면 종료코드 1)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {EXPECTED, OUT_DIR, REQUIRED_FILES, WORKSPACE_ROOT, exists, sourcePath, writeJson} from './lib/paths.mjs';
import {extractCrops, indexManifest} from './lib/normalize.mjs';
import {computeMissingAudio, generateProjectData} from './lib/generate.mjs';

const errors = [];
const warnings = [];
const IMG_RE = /\.(png|jpe?g|webp)$/i;
const AUDIO_RE = /\.(wav|mp3|m4a|aac|ogg|flac)$/i;

// 1) 필수 입력 파일 -------------------------------------------------------------
const required = REQUIRED_FILES.map((rel) => ({file: rel, exists: exists(sourcePath(rel))}));
required.filter((r) => !r.exists).forEach((r) => errors.push(`필수 입력 누락: ${r.file}`));

// 2) JSON 유효성 -----------------------------------------------------------------
const walkFiles = (dir) => {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walkFiles(p) : e.isFile() ? [p] : [];
  });
};
const jsonChecks = [...walkFiles(path.join(WORKSPACE_ROOT, 'data')), ...walkFiles(path.join(WORKSPACE_ROOT, 'assets'))]
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'));
      return {file: path.relative(WORKSPACE_ROOT, f), valid: true};
    } catch (e) {
      errors.push(`JSON 오류: ${path.relative(WORKSPACE_ROOT, f)} — ${e.message}`);
      return {file: path.relative(WORKSPACE_ROOT, f), valid: false, error: e.message};
    }
  });

// 3) 이미지 크기·알파 ------------------------------------------------------------
const imageInfo = {};
for (const f of walkFiles(path.join(WORKSPACE_ROOT, 'assets')).filter((f) => IMG_RE.test(f))) {
  const rel = path.relative(WORKSPACE_ROOT, f);
  try {
    const img = sharp(f);
    const m = await img.metadata();
    let alphaUsed = false;
    if (m.hasAlpha) {
      const st = await img.stats();
      alphaUsed = st.channels[3]?.min < 255;
    }
    imageInfo[rel] = {width: m.width, height: m.height, format: m.format, hasAlpha: Boolean(m.hasAlpha), alphaUsed};
    if (m.format === 'png' && /props?/i.test(rel) && !alphaUsed) warnings.push(`${rel}: PNG 이지만 투명 픽셀 없음 (배경 제거 필요할 수 있음)`);
  } catch (e) {
    errors.push(`이미지 읽기 실패: ${rel} — ${e.message}`);
  }
}

// 4) 정규화 데이터 및 참조 자산 ---------------------------------------------------
const data = generateProjectData();
data.problems.forEach((p) => errors.push(p));
const manifestPath = sourcePath('assets/manifest.json');
let manifestRefs = [];
if (exists(manifestPath)) {
  try {
    manifestRefs = indexManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).all;
  } catch {
    /* 위 JSON 검사에서 이미 보고됨 */
  }
}
const resolveRel = (p) => (p.startsWith('assets/') || /^(data|docs)\//.test(p) ? p : `assets/${p.replace(/^\.?\//, '')}`);
const manifestMissing = manifestRefs.filter((a) => !exists(path.join(WORKSPACE_ROOT, resolveRel(a.path)))).map((a) => ({id: a.id, path: resolveRel(a.path), type: a.type ?? null}));
manifestMissing.filter((a) => !AUDIO_RE.test(a.path)).forEach((a) => errors.push(`manifest 자산 누락: ${a.path}`));

const missingBackgrounds = data.shots.filter((s) => s.backgroundRef && !s.backgroundExists).map((s) => ({shot: s.id, ref: s.backgroundRef, path: s.background}));
missingBackgrounds.forEach((b) => errors.push(`배경 누락: shot ${b.shot} → ${b.path}`));
data.shots.filter((s) => !s.backgroundRef).forEach((s) => warnings.push(`shot ${s.id}: 배경 지정 없음`));
const missingProps = data.shots.flatMap((s) => s.props.filter((p) => !p.exists).map((p) => ({shot: s.id, path: p.asset})));
missingProps.forEach((p) => errors.push(`소품 누락: shot ${p.shot} → ${p.path}`));

// 크롭 정의
let crops = [];
const cropsPath = sourcePath('data/character-crops-v1.json');
if (exists(cropsPath)) {
  try {
    crops = extractCrops(JSON.parse(fs.readFileSync(cropsPath, 'utf8')));
    if (!crops.length) errors.push('character-crops-v1.json 에서 크롭 사각형을 찾지 못함 (scripts/lib/normalize.mjs extractCrops 확인)');
  } catch {
    /* JSON 오류는 위에서 보고 */
  }
}
const cropIssues = [];
for (const c of crops) {
  if (!c.source) {
    cropIssues.push({id: c.id, issue: 'source 이미지 미지정'});
    continue;
  }
  const rel = resolveRel(c.source);
  const info = imageInfo[rel];
  if (!info) {
    cropIssues.push({id: c.id, issue: `원본 시트 없음: ${rel}`});
    continue;
  }
  const {x, y, w, h} = c.rect;
  if (x < 0 || y < 0 || x + w > info.width || y + h > info.height) cropIssues.push({id: c.id, issue: `크롭이 시트(${info.width}×${info.height}) 밖으로 나감: ${JSON.stringify(c.rect)}`});
}
cropIssues.forEach((c) => errors.push(`크롭 ${c.id}: ${c.issue}`));

// 5) 타임라인 연속성 --------------------------------------------------------------
const tlChecks = {available: data.available};
if (data.available) {
  const {meta, shots} = data;
  tlChecks.fps = meta.fps;
  tlChecks.durationInFrames = meta.durationInFrames;
  tlChecks.shotCount = shots.length;
  if (meta.fps !== EXPECTED.fps) warnings.push(`fps ${meta.fps} (브리프 기대값 ${EXPECTED.fps})`);
  if (shots.length !== EXPECTED.shotCount) errors.push(`숏 개수 ${shots.length} ≠ ${EXPECTED.shotCount}`);
  if (meta.durationInFrames !== EXPECTED.durationInFrames) errors.push(`총 프레임 ${meta.durationInFrames} ≠ ${EXPECTED.durationInFrames}`);
  const gaps = [];
  shots.forEach((s, i) => {
    if (s.durationInFrames <= 0) errors.push(`shot ${s.id}: 길이 ${s.durationInFrames}`);
    const expectedFrom = i === 0 ? 0 : shots[i - 1].from + shots[i - 1].durationInFrames;
    if (s.from !== expectedFrom) gaps.push({shot: s.id, expectedFrom, actualFrom: s.from});
  });
  gaps.forEach((g) => errors.push(`타임라인 불연속: shot ${g.shot} 시작 ${g.actualFrom} (기대 ${g.expectedFrom})`));
  const last = shots.at(-1);
  if (last && last.from + last.durationInFrames !== meta.durationInFrames) errors.push(`마지막 숏 끝 ${last.from + last.durationInFrames} ≠ 총 프레임 ${meta.durationInFrames}`);
  tlChecks.gaps = gaps;

  const lineIds = new Set(data.voiceLines.map((l) => l.id));
  shots.forEach((s) => s.lineIds.filter((id) => id && !lineIds.has(id)).forEach((id) => errors.push(`shot ${s.id}: 대사 ${id} 가 voice-lines 에 없음`)));
  data.voiceLines.forEach((l) => {
    if (l.from === null || l.to === null) warnings.push(`대사 ${l.id}: 타이밍 없음 (SRT 매칭 실패)`);
    else if (l.to > meta.durationInFrames) errors.push(`대사 ${l.id}: 영상 길이 초과 (${l.to})`);
  });
  data.subtitles.forEach((c, i) => {
    if (c.to <= c.from) errors.push(`자막 #${c.index}: 끝이 시작보다 빠름`);
    if (i > 0 && c.from < data.subtitles[i - 1].to) warnings.push(`자막 #${c.index}: 이전 자막과 겹침`);
    if (c.to > meta.durationInFrames) errors.push(`자막 #${c.index}: 120초 초과`);
  });
  // 등장 캐릭터 조합이 크롭 정의에 있는지
  const cropKeys = new Set(crops.map((c) => `${c.character}|${c.pose}|${c.expression}`.toLowerCase()));
  const cropIds = new Set(crops.map((c) => c.id.toLowerCase()));
  const neededSprites = new Set();
  shots.forEach((s) =>
    s.characters.forEach((c) => {
      const exprs = [c.expression, ...c.expressions.map((e) => e.expression)];
      for (const e of exprs) {
        const k = c.sprite ? c.sprite.toLowerCase() : `${c.character}|${c.pose}|${e}`.toLowerCase();
        neededSprites.add(k);
        if (crops.length && !(cropKeys.has(k) || cropIds.has(k))) warnings.push(`shot ${s.id}: ${k} 크롭 정의 없음`);
      }
    }),
  );
  tlChecks.neededSprites = [...neededSprites];
}

// 6) 누락 자산 목록 -------------------------------------------------------------
const {allAudioPresent, ...missingAudio} = computeMissingAudio(data);
const missingAssets = {
  generatedAt: new Date().toISOString(),
  workspaceRoot: WORKSPACE_ROOT,
  note: '누락 자산은 대체 생성하지 않았다. 아래 파일을 원본 경로에 넣고 npm run sync → validate 를 다시 실행한다.',
  requiredInputs: required.filter((r) => !r.exists).map((r) => r.file),
  images: [...manifestMissing.filter((a) => !AUDIO_RE.test(a.path)).map((a) => a.path), ...missingBackgrounds.map((b) => b.path), ...missingProps.map((p) => p.path), ...cropIssues.filter((c) => c.issue.startsWith('원본 시트 없음')).map((c) => c.issue.replace('원본 시트 없음: ', ''))].filter((v, i, a) => a.indexOf(v) === i),
  audio: {
    ...missingAudio,
    ...(exists(sourcePath('data/voice-lines.ko.json')) ? {} : {undetermined: 'data/voice-lines.ko.json · docs/audio-production-v1.md 가 없어 필요한 대사·음악·효과음 파일 목록을 산출할 수 없음'}),
  },
  allAudioPresent,
};
writeJson(path.join(OUT_DIR, 'missing-assets.json'), missingAssets);

const report = {generatedAt: missingAssets.generatedAt, ok: errors.length === 0, errors, warnings, required, jsonChecks, images: imageInfo, crops: {count: crops.length, issues: cropIssues}, timeline: tlChecks, allAudioPresent};
writeJson(path.join(OUT_DIR, 'validation-report.json'), report);

console.log(`검증 결과: 오류 ${errors.length}, 경고 ${warnings.length}`);
errors.slice(0, 40).forEach((e) => console.log('  ✗ ' + e));
warnings.slice(0, 20).forEach((w) => console.log('  ! ' + w));
console.log(`이미지 ${Object.keys(imageInfo).length}개, 크롭 ${crops.length}개, 숏 ${data.shots.length}개, 대사 ${data.voiceLines.length}개, 자막 ${data.subtitles.length}개`);
console.log(`오디오 완비: ${allAudioPresent ? '예' : '아니오'} → out/missing-assets.json`);
if (process.argv.includes('--strict') && errors.length) process.exit(1);
