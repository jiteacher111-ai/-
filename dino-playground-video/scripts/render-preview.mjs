// 50% 스케일(960×540) 무음 프리뷰 → out/dino-playground-preview-silent.mp4
import path from 'node:path';
import {EXPECTED, OUT_DIR, ensureDir} from './lib/paths.mjs';
import {generateProjectData} from './lib/generate.mjs';
import {prepare, progressLogger, renderMedia} from './lib/render.mjs';
import {probe} from './lib/probe.mjs';

const data = generateProjectData();
if (!data.available) {
  console.error('✗ 타임라인 데이터가 없어 프리뷰를 렌더하지 않음 (빈 영상을 만들지 않는다)');
  process.exit(0);
}
ensureDir(OUT_DIR);
const out = path.join(OUT_DIR, 'dino-playground-preview-silent.mp4');
const {serveUrl, composition, browserExecutable} = await prepare();
if (composition.durationInFrames !== EXPECTED.durationInFrames) console.warn(`! 컴포지션 길이 ${composition.durationInFrames}프레임 (기대 ${EXPECTED.durationInFrames})`);
await renderMedia({serveUrl, composition, codec: 'h264', outputLocation: out, scale: 0.5, muted: true, crf: 23, pixelFormat: 'yuv420p', browserExecutable, onProgress: progressLogger('preview')});
const p = probe(out);
console.log(`✓ ${path.relative(process.cwd(), out)} — ${p?.duration?.toFixed(3)}s, ${p?.video?.width}×${p?.video?.height}, 오디오 ${p?.hasAudio ? '있음' : '없음'}`);
