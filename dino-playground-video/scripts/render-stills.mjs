// 레이아웃 확인용 주요 시점 스틸 8장 → out/stills/
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
// 8개 숏을 고르게 고르고, 약속판·안전 표시가 있는 숏을 반드시 포함한다
const picks = new Set(Array.from({length: 8}, (_, k) => Math.round((k * (shots.length - 1)) / 7)));
const special = shots.filter((s) => s.promiseBoard || s.overlays.length).map((s) => s.index);
for (const idx of special) {
  if (picks.has(idx) || picks.size === 0) continue;
  const replace = [...picks].filter((p) => !special.includes(p) && p !== 0 && p !== shots.length - 1).sort((a, b) => Math.abs(a - idx) - Math.abs(b - idx))[0];
  if (replace === undefined) break;
  picks.delete(replace);
  picks.add(idx);
}
const frames = [...picks].sort((a, b) => a - b).map((i) => {
  const s = shots[i];
  // 대사 중이면서 오버레이가 보이는 시점 — 숏의 60% 지점
  return {shot: s.id, frame: s.from + Math.floor(s.durationInFrames * 0.6)};
});
const extra = process.argv.slice(2).map(Number).filter(Number.isFinite).map((f) => ({shot: shots.find((s) => f >= s.from && f < s.from + s.durationInFrames)?.id ?? '?', frame: f}));

const outDir = path.join(OUT_DIR, 'stills');
ensureDir(outDir);
const {serveUrl, composition, browserExecutable} = await prepare();
const rendered = [];
for (const [i, f] of [...frames, ...extra].entries()) {
  const output = path.join(outDir, `still-${String(i + 1).padStart(2, '0')}-${f.shot}-f${f.frame}.png`);
  await renderStill({serveUrl, composition, frame: f.frame, output, browserExecutable});
  rendered.push({...f, file: path.relative(OUT_DIR, output)});
  console.log(`  ✓ ${path.basename(output)}`);
}
writeJson(path.join(outDir, 'stills.json'), {rendered});
