// 작업공간 루트의 docs/, data/, assets/ 를 프로젝트 안으로 "복사"만 한다 (원본은 읽기 전용).
// 사용법: node scripts/sync-source.mjs [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import {OUT_DIR as PROJECT_DIR_OUT, PUBLIC_DIR, SOURCE_COPY_DIR, WORKSPACE_ROOT, ensureDir, exists} from './lib/paths.mjs';
import {generateProjectData} from './lib/generate.mjs';

const quiet = process.argv.includes('--quiet');
const log = (...a) => !quiet && console.log(...a);

const copyTree = (from, to) => {
  if (!exists(from)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyTree(a, b);
    else if (entry.isFile()) {
      ensureDir(path.dirname(b));
      const sa = fs.statSync(a);
      if (!exists(b) || fs.statSync(b).mtimeMs < sa.mtimeMs || fs.statSync(b).size !== sa.size) fs.copyFileSync(a, b);
      n++;
    }
  }
  return n;
};

const report = [];
for (const [dir, dest] of [
  ['docs', path.join(SOURCE_COPY_DIR, 'docs')],
  ['data', path.join(SOURCE_COPY_DIR, 'data')],
  ['assets', path.join(PUBLIC_DIR, 'assets')],
]) {
  const src = path.join(WORKSPACE_ROOT, dir);
  const n = copyTree(src, dest);
  report.push(`${dir}/ → ${path.relative(process.cwd(), dest) || dest}: ${exists(src) ? `${n}개 파일 복사` : '원본 폴더 없음'}`);
}
log(`원본 루트: ${WORKSPACE_ROOT}`);
report.forEach((r) => log('  ' + r));

const data = generateProjectData();
log(`project-data.json 생성: shots=${data.shots.length}, voiceLines=${data.voiceLines.length}, subtitles=${data.subtitles.length}`);
if (data.missingRequired.length) log(`  ⚠ 필수 입력 누락 ${data.missingRequired.length}개 — npm run validate 로 상세 확인`);

// 자막 원본 SRT 를 출력 폴더에도 그대로 복사한다 (번인 자막과 같은 파일)
const srt = path.join(SOURCE_COPY_DIR, 'data', 'subtitles.ko.srt');
if (exists(srt)) {
  ensureDir(path.join(PROJECT_DIR_OUT));
  fs.copyFileSync(srt, path.join(PROJECT_DIR_OUT, 'subtitles.ko.srt'));
  log('subtitles.ko.srt → out/subtitles.ko.srt');
}
