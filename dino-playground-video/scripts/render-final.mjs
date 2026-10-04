// 오디오가 모두 존재할 때만 1920×1080 H.264 최종본 → out/dino-playground-final.mp4
import path from 'node:path';
import {OUT_DIR, ensureDir} from './lib/paths.mjs';
import {computeMissingAudio, generateProjectData} from './lib/generate.mjs';
import {prepare, progressLogger, renderMedia} from './lib/render.mjs';
import {probe} from './lib/probe.mjs';

const data = generateProjectData();
const missing = computeMissingAudio(data);
if (!missing.allAudioPresent) {
  console.log(`최종본 렌더 건너뜀: 타임라인 ${data.available ? '있음' : '없음'}, 대사 오디오 누락 ${missing.voice.length}개, 음악 누락 ${missing.music.length}개, 효과음 누락 ${missing.sfx.length}개 (out/missing-assets.json)`);
  process.exit(0);
}
ensureDir(OUT_DIR);
const out = path.join(OUT_DIR, 'dino-playground-final.mp4');
const {serveUrl, composition, browserExecutable} = await prepare();
await renderMedia({serveUrl, composition, codec: 'h264', outputLocation: out, crf: 18, pixelFormat: 'yuv420p', audioCodec: 'aac', browserExecutable, onProgress: progressLogger('final')});
const p = probe(out);
console.log(`✓ ${path.relative(process.cwd(), out)} — ${p?.duration?.toFixed(3)}s, ${p?.video?.width}×${p?.video?.height}, 오디오 ${p?.hasAudio ? '있음' : '없음'}`);
