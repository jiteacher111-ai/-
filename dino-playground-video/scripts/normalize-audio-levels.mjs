// 대사·효과음 WAV 의 음량을 맞춘다 (제자리 수정 — 원본 mp3 는 select-*-takes 로 다시 받을 수 있음).
//  - 혼자 말하는 대사: -19 LUFS / 합창(all) 대사의 각 파트: -24 LUFS (4명 합쳐 약 -18~-19)
//  - 효과음: -18 LUFS (production.config 의 cue volume 0.15~0.5 가 그 위에 곱해짐)
//  - 피크는 alimiter 로 -2 dBFS 이하. 측정은 ebur128, 다시 실행해도 거의 변하지 않음 (±0.3 LU 이내면 건너뜀)
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {PROJECT_DIR, WORKSPACE_ROOT, readJson, writeJson} from './lib/paths.mjs';

const casting = readJson(path.join(PROJECT_DIR, 'audio-production', 'voice-casting.json'));
const partsPerLine = {};
for (const l of casting.lines) partsPerLine[l.line] = (partsPerLine[l.line] ?? 0) + 1;
const targets = [
  ...casting.lines.map((l) => ({file: l.file, target: partsPerLine[l.line] > 1 ? -24 : -19, channels: 1})),
  ...fs.readdirSync(path.join(WORKSPACE_ROOT, 'assets', 'audio', 'sfx')).filter((f) => f.endsWith('.wav')).map((f) => ({file: `assets/audio/sfx/${f}`, target: -18, channels: 2})),
];
const parse = (file) => {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'}).stderr.split('Summary:').pop();
  return {I: Number(/\bI:\s+(-?[\d.]+) LUFS/.exec(log)[1]), peak: Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(log)[1])};
};
const report = {};
for (const {file, target, channels} of targets) {
  const abs = path.join(WORKSPACE_ROOT, file);
  const before = parse(abs);
  const gain = target - before.I;
  if (Math.abs(gain) > 0.3) {
    const tmp = abs.replace(/\.wav$/, '.norm-tmp.wav');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', abs, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.79:level=false:latency=true`, '-ar', '48000', '-ac', String(channels), '-c:a', 'pcm_s24le', tmp]);
    fs.renameSync(tmp, abs);
  }
  const after = parse(abs);
  report[file] = {target, beforeLUFS: before.I, beforePeak: before.peak, gainDb: Number(gain.toFixed(2)), afterLUFS: after.I, afterPeak: after.peak};
  console.log(`${file.padEnd(42)} ${before.I.toFixed(1)} → ${after.I.toFixed(1)} LUFS (목표 ${target}), peak ${after.peak} dBFS`);
}
writeJson(path.join(PROJECT_DIR, 'audio-production', 'levels.json'), report);
