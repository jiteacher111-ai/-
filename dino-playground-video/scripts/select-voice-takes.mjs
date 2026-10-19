// ElevenLabs 생성 결과(creative_get_flow_run_status JSON 파일들)에서 대사마다 테이크 하나를 골라 WAV 로 저장한다.
//  - 매칭: voice_id + 태그를 뺀 대사 문구가 audio-production/voice-casting.json 의 항목과 같아야 한다 (문구가 다르면 쓰지 않는다)
//  - 선택: 자막 구간(slotSec) - 0.1초 안에 들어가는 가장 긴 테이크 (또박또박·여유 있는 말투). 모두 넘치면 가장 짧은 것
//  - 변환: 앞뒤 무음 정리 → 앞뒤 100ms 무음(오디오 명세 80~120ms) → 48kHz mono 24-bit WAV
//  - 저장: 작업공간 루트 assets/audio/voices/<Lxx_character>.wav (manifest 의 requiredExternalAudio 경로). 기존 파일은 --force 없이 덮어쓰지 않음
// 사용법: node scripts/select-voice-takes.mjs <status.json>... [--force]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PROJECT_DIR, WORKSPACE_ROOT, ensureDir, exists, readJson, writeJson} from './lib/paths.mjs';

const force = process.argv.includes('--force');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const castingFile = path.join(PROJECT_DIR, 'audio-production', 'voice-casting.json');
const casting = readJson(castingFile);
const strip = (s) => s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
const key = (voice, text) => `${voice}|${strip(text)}`;
// 1순위: voice + 프롬프트(태그 포함) 정확히 일치. 2순위: 태그를 뺀 문구 — 같은 문구가 여러 대사에 있으면(L05·L28) 쓰지 않음
const byPrompt = new Map(casting.lines.map((l) => [`${l.voice_id}|${l.prompt.trim()}`, l]));
const textCount = new Map();
for (const l of casting.lines) textCount.set(key(l.voice_id, l.text), (textCount.get(key(l.voice_id, l.text)) ?? 0) + 1);
const byKey = new Map(casting.lines.filter((l) => textCount.get(key(l.voice_id, l.text)) === 1).map((l) => [key(l.voice_id, l.text), l]));
const match = (voice, prompt) => byPrompt.get(`${voice}|${prompt.trim()}`) ?? byKey.get(key(voice, prompt));

// 테이크 모으기
const takes = new Map();
for (const f of files) {
  const j = readJson(f);
  for (const m of j.media ?? []) {
    const entry = match(m.voice?.voice_id, m.prompt);
    if (!entry) continue;
    if (!takes.has(entry.file)) takes.set(entry.file, []);
    if (!takes.get(entry.file).some((t) => t.generation_id === m.generation_id)) takes.get(entry.file).push({generation_id: m.generation_id, duration: m.duration_secs, url: m.master_url ?? m.url, prompt: m.prompt});
  }
}

const dlDir = process.env.DINO_DL_DIR ?? path.join(os.tmpdir(), 'dino-audio-downloads');
ensureDir(dlDir);
const selFile = path.join(PROJECT_DIR, 'audio-production', 'voice-selections.json');
const selections = exists(selFile) ? readJson(selFile) : {};
for (const [file, list] of takes) {
  const entry = casting.lines.find((l) => l.file === file);
  const out = path.join(WORKSPACE_ROOT, file);
  if (exists(out) && !force && selections[file]) {
    console.log(`= ${file} (이미 있음)`);
    continue;
  }
  const limit = entry.slotSec - 0.1;
  const fitting = list.filter((t) => t.duration <= limit).sort((a, b) => b.duration - a.duration);
  const pick = fitting[0] ?? [...list].sort((a, b) => a.duration - b.duration)[0];
  const mp3 = path.join(dlDir, `${path.basename(file, '.wav')}-${pick.generation_id}.mp3`);
  execFileSync('curl', ['-sS', '--fail', '-o', mp3, pick.url]);
  ensureDir(path.dirname(out));
  // 앞뒤 무음 정리 후 100ms 패딩, 48k mono 24-bit
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp3, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,adelay=100:all=1,apad=pad_dur=0.1', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', out]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], {encoding: 'utf8'}));
  selections[file] = {line: entry.line, character: entry.character, text: entry.text, prompt: pick.prompt, voice_id: entry.voice_id, generation_id: pick.generation_id, takes: list.map((t) => ({id: t.generation_id, sec: t.duration})), takeSec: pick.duration, wavSec: Number(dur.toFixed(3)), slotSec: entry.slotSec, fitsSlot: dur <= entry.slotSec + 0.25};
  console.log(`✓ ${file}  take ${pick.duration}s → wav ${dur.toFixed(2)}s / 자막 ${entry.slotSec}s ${selections[file].fitsSlot ? '' : '⚠ 김'}`);
}
writeJson(selFile, selections);
const done = casting.lines.filter((l) => selections[l.file]).length;
console.log(`선택 완료 ${done}/${casting.lines.length}`);
void fs;
