// ElevenLabs 효과음 생성 결과(creative_get_flow_run_status JSON)에서 선택한 테이크를 WAV 로 저장한다.
//  - 선택: audio-production/sfx-selections.json 의 PICKS (사람이 듣고 고른 generation_id)
//  - 변환: (작은 테이크는 잡음 감소) 앞 무음 정리 → 끝 80ms 페이드 → 48kHz stereo 24-bit WAV. 그네 삐걱임은 큐 길이(76.2~98.5초)만큼 반복
// 사용법: node scripts/select-sfx-takes.mjs <status.json>...
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PROJECT_DIR, WORKSPACE_ROOT, ensureDir, writeJson} from './lib/paths.mjs';

const PICKS = {
  'footsteps-soft': 'sd4gAhMbuiFoWDHq2Dpp',
  'bell-soft': 'kj1KBMl05aFh0sNZu8bO',
  'icon-chime': 'OZiJpj3M6WhCTtlG4usp',
  'pop-soft': '8NKeu5mlU1Gjj0mgTWfN',
  'slide-whoosh-soft': 'UgP99XuyLjFat8raITg1',
  'swing-creak-soft': 'VpmpuRkty8vzpGaZmZ4f',
  'sparkle-soft': 'gOXCh6YWRjGkfO4fEAY6',
  'laugh-soft': 'MFZjXbbJsrPASykmuyfM',
};
const LOOP_SEC = {'swing-creak-soft': 22.3};
// 아주 작게 생성된 테이크는 음량을 크게 올리므로 바닥 잡음을 먼저 줄인다
const DENOISE = new Set(['footsteps-soft', 'swing-creak-soft']);

const media = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).media ?? []);
const dlDir = process.env.DINO_DL_DIR ?? path.join(os.tmpdir(), 'dino-audio-downloads');
ensureDir(dlDir);
const outDir = path.join(WORKSPACE_ROOT, 'assets', 'audio', 'sfx');
ensureDir(outDir);
const rec = {};
for (const [name, id] of Object.entries(PICKS)) {
  const m = media.find((x) => x.generation_id === id);
  if (!m) throw new Error(`${name}: generation ${id} 없음`);
  const mp3 = path.join(dlDir, `${name}-${id}.mp3`);
  execFileSync('curl', ['-sS', '--fail', '-o', mp3, m.master_url ?? m.url]);
  const out = path.join(outDir, `${name}.wav`);
  const loop = LOOP_SEC[name];
  const pre = `aresample=48000,${DENOISE.has(name) ? 'highpass=f=100,afftdn=nf=-60:tn=1,' : ''}`;
  const af = pre + (loop
    ? `silenceremove=start_periods=1:start_threshold=-55dB,aloop=loop=-1:size=${Math.round(m.duration_secs * 48000)},atrim=0:${loop},afade=t=in:d=0.5,afade=t=out:st=${loop - 1.5}:d=1.5`
    : `silenceremove=start_periods=1:start_threshold=-55dB,areverse,afade=t=in:d=0.08,areverse`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp3, '-ar', '48000', '-ac', '2', '-af', af, '-c:a', 'pcm_s24le', out]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], {encoding: 'utf8'}));
  rec[`assets/audio/sfx/${name}.wav`] = {generation_id: id, model: m.model_id, prompt: m.prompt, takes: media.filter((x) => x.prompt === m.prompt).map((x) => ({id: x.generation_id, sec: x.duration_secs})), takeSec: m.duration_secs, wavSec: Number(dur.toFixed(3)), ...(loop ? {looped: true} : {})};
  console.log(`✓ ${name} ${dur.toFixed(2)}s`);
}
writeJson(path.join(PROJECT_DIR, 'audio-production', 'sfx-selections.json'), rec);
