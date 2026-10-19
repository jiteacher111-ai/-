// 오디오가 모두 존재할 때만 1920×1080 H.264 최종본 → out/dino-playground-final.mp4
// --allow-missing-music: 대사·효과음은 모두 있고 BGM 만 없을 때 믹스 확인용 → out/dino-playground-mix-preview.mp4 (최종본 아님)
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {OUT_DIR, ensureDir} from './lib/paths.mjs';
import {computeMissingAudio, generateProjectData} from './lib/generate.mjs';
import {prepare, progressLogger, renderMedia} from './lib/render.mjs';
import {probe} from './lib/probe.mjs';

const data = generateProjectData();
const missing = computeMissingAudio(data);
const mixPreview = process.argv.includes('--allow-missing-music') && !missing.voice.length && !missing.sfx.length && missing.music.length > 0;
if (!missing.allAudioPresent && !mixPreview) {
  console.log(`최종본 렌더 건너뜀: 타임라인 ${data.available ? '있음' : '없음'}, 대사 오디오 누락 ${missing.voice.length}개, 음악 누락 ${missing.music.length}개, 효과음 누락 ${missing.sfx.length}개 (out/missing-assets.json)`);
  process.exit(0);
}
ensureDir(OUT_DIR);
const out = path.join(OUT_DIR, mixPreview ? 'dino-playground-mix-preview.mp4' : 'dino-playground-final.mp4');
if (mixPreview) console.log(`BGM 누락 ${missing.music.length}개 — 대사+효과음 믹스 미리보기로 렌더 (최종본 아님)`);
const {serveUrl, composition, browserExecutable} = await prepare();
await renderMedia({serveUrl, composition, codec: 'h264', outputLocation: out, crf: mixPreview ? 24 : 18, pixelFormat: 'yuv420p', audioCodec: 'aac', browserExecutable, onProgress: progressLogger(mixPreview ? 'mix-preview' : 'final')});
// 마스터링: 2패스 loudnorm (-16 LUFS, true peak -1.5 dBTP), 영상 스트림은 그대로 복사
const raw = out.replace(/\.mp4$/, '.raw.mp4');
fs.renameSync(out, raw);
const LN = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const m = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', raw, '-af', `${LN}:print_format=json`, '-f', 'null', '-'], {encoding: 'utf8'}).stderr)[0]);
const pass2 = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-c:v', 'copy', '-af', `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(composition.durationInFrames / composition.fps), '-movflags', '+faststart', out], {encoding: 'utf8'});
if (pass2.status !== 0) throw new Error(pass2.stderr);
fs.rmSync(raw);
console.log(`마스터링: ${m.input_i} LUFS / TP ${m.input_tp} → -16 LUFS / TP ≤ -1.5`);
const p = probe(out);
console.log(`✓ ${path.relative(process.cwd(), out)} — ${p?.duration?.toFixed(3)}s, ${p?.video?.width}×${p?.video?.height}, 오디오 ${p?.hasAudio ? '있음' : '없음'}`);
