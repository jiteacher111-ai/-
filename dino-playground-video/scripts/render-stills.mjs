// 레이아웃 확인용 주요 시점 스틸 8장 → out/keyframes/ (production.config.json keyframes)
import path from 'node:path';
import {OUT_DIR, ensureDir, writeJson} from './lib/paths.mjs';
import {generateProjectData} from './lib/generate.mjs';
import {prepare, renderStill} from './lib/render.mjs';

const data = generateProjectData();
if (!data.available) {
  console.error('✗ 타임라인 데이터가 없어 스틸을 렌더하지 않음 (out/missing-assets.json 참고)');
  writeJson(path.join(OUT_DIR, 'stills', 'stills.json'), {rendered: [], skipped: 'timeline 없음'});
  process.exit(0);
}
const {shots} = data;
const picks = data.config.keyframes?.shots ?? [];
const frames = picks
  .map(([id, at]) => shots.find((s) => s.id === id) && {shot: id, frame: shots.find((s) => s.id === id).from + Math.floor(shots.find((s) => s.id === id).durationInFrames * at)})
  .filter(Boolean);
const extra = process.argv.slice(2).map(Number).filter(Number.isFinite).map((f) => ({shot: shots.find((s) => f >= s.from && f < s.from + s.durationInFrames)?.id ?? '?', frame: f}));

const outDir = path.join(OUT_DIR, 'keyframes');
ensureDir(outDir);
const {serveUrl, composition, browserExecutable} = await prepare();
const rendered = [];
for (const [i, f] of [...frames, ...extra].entries()) {
  const output = path.join(outDir, `keyframe-${String(i + 1).padStart(2, '0')}-${f.shot}-f${f.frame}.png`);
  await renderStill({serveUrl, composition, frame: f.frame, output, browserExecutable});
  rendered.push({...f, file: path.relative(OUT_DIR, output)});
  console.log(`  ✓ ${path.basename(output)}`);
}
writeJson(path.join(outDir, 'stills.json'), {rendered});
