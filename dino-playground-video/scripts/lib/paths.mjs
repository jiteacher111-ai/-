import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// 원본 작업공간 루트 (읽기 전용으로만 사용한다). DINO_SOURCE_ROOT 로 바꿀 수 있다.
export const WORKSPACE_ROOT = path.resolve(process.env.DINO_SOURCE_ROOT ?? path.join(PROJECT_DIR, '..'));

export const SOURCE_COPY_DIR = path.join(PROJECT_DIR, 'source'); // docs/data 사본
export const PUBLIC_DIR = path.join(PROJECT_DIR, 'public');
export const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets'); // assets/ 사본
export const PUBLIC_CHAR_DIR = path.join(PUBLIC_DIR, 'characters'); // 전처리 결과
export const GENERATED_DIR = path.join(PROJECT_DIR, 'src', 'generated');
export const PROJECT_DATA_FILE = path.join(GENERATED_DIR, 'project-data.json');
export const OUT_DIR = path.resolve(process.env.DINO_OUT_DIR ?? path.join(PROJECT_DIR, 'out'));

// 브리프가 지정한 필수 입력 파일 (작업공간 루트 기준)
export const REQUIRED_FILES = [
  'docs/claude-code-production-brief.md',
  'assets/manifest.json',
  'data/timeline-v1.json',
  'data/voice-lines.ko.json',
  'data/subtitles.ko.srt',
  'data/character-crops-v1.json',
  'docs/playground-safety-script-v1.md',
  'docs/shot-list-v1.md',
  'docs/audio-production-v1.md',
];

export const EXPECTED = {fps: 24, durationInFrames: 2880, shotCount: 28, width: 1920, height: 1080};

export const ensureDir = (d) => fs.mkdirSync(d, {recursive: true});
export const exists = (p) => fs.existsSync(p);
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const writeJson = (p, v) => {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

/** 프로젝트 사본 경로 (sync 이후). 없으면 작업공간 원본 경로. */
export const sourcePath = (rel) => {
  if (rel.startsWith('assets/')) {
    const copy = path.join(PUBLIC_DIR, rel);
    if (exists(copy)) return copy;
  } else {
    const copy = path.join(SOURCE_COPY_DIR, rel);
    if (exists(copy)) return copy;
  }
  return path.join(WORKSPACE_ROOT, rel);
};

export const chromiumExecutable = () => {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) return process.env.REMOTION_BROWSER_EXECUTABLE;
  const candidates = [
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    '/opt/pw-browsers/chromium',
  ];
  return candidates.find((c) => exists(c)) ?? null; // null → Remotion 기본 브라우저 사용
};
