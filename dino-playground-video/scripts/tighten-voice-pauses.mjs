// 자막 구간보다 긴 대사 파일은 "말을 빠르게 하지 않고" 문장 사이 쉼을 줄인다 (audio-production-v1.md 규칙 7).
// 1) 내부 무음(≥120ms)을 120ms 로 줄임  2) 그래도 길면 atempo 최대 1.05 (5% 이내)
// 원본 선택본은 같은 폴더에 .orig.wav 로 보관. 사용법: node scripts/tighten-voice-pauses.mjs [--margin 0.15]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {PROJECT_DIR, WORKSPACE_ROOT, readJson, writeJson} from './lib/paths.mjs';

const selFile = path.join(PROJECT_DIR, 'audio-production', 'voice-selections.json');
const sel = readJson(selFile);
const margin = Number(process.argv[process.argv.indexOf('--margin') + 1]) || 0.15;
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], {encoding: 'utf8'}));
for (const [file, s] of Object.entries(sel)) {
  const out = path.join(WORKSPACE_ROOT, file);
  const target = s.slotSec + margin;
  if (dur(out) <= target) continue;
  const orig = out.replace(/\.wav$/, '.orig.wav');
  if (!fs.existsSync(orig)) fs.copyFileSync(out, orig);
  const tmp = out.replace(/\.wav$/, '.tmp.wav');
  // 앞뒤 100ms 패딩은 유지하고 내부 쉼만 줄임
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', orig, '-af', 'silenceremove=stop_periods=-1:stop_duration=0.12:stop_threshold=-42dB:stop_silence=0.12', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', tmp]);
  let d = dur(tmp);
  let tempo = 1;
  if (d > target) {
    tempo = Math.min(1.05, d / target);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-af', `atempo=${tempo.toFixed(3)}`, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', out]);
    fs.unlinkSync(tmp);
  } else fs.renameSync(tmp, out);
  d = dur(out);
  Object.assign(s, {wavSec: Number(d.toFixed(3)), tightened: {pausesTo: 0.12, atempo: Number(tempo.toFixed(3)), fromSec: Number(dur(orig).toFixed(3))}, fitsSlot: d <= s.slotSec + 0.25});
  console.log(`${file}: ${s.tightened.fromSec}s → ${d.toFixed(2)}s (자막 ${s.slotSec}s${tempo > 1 ? `, 속도 ×${tempo.toFixed(3)}` : ''}) ${s.fitsSlot ? '' : '⚠ 여전히 김'}`);
}
writeJson(selFile, sel);
