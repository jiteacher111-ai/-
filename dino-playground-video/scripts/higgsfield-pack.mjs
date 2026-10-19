// Higgsfield 생성용 패키지: 클립마다 자막 없는 1920×1080 시작 프레임 + 프롬프트 문서
//  → higgsfield/start-frames/<id>.png, higgsfield/PROMPTS.md
// 사용법: node scripts/higgsfield-pack.mjs [C01 C05 ...]
import fs from 'node:fs';
import path from 'node:path';
import {selectComposition} from '@remotion/renderer';
import {PROJECT_DIR, ensureDir, readJson} from './lib/paths.mjs';
import {generateProjectData} from './lib/generate.mjs';
import {prepare, renderStill} from './lib/render.mjs';

const dir = path.join(PROJECT_DIR, 'higgsfield');
const plan = readJson(path.join(dir, 'clips.json'));
const only = process.argv.slice(2);
const data = generateProjectData();
const {serveUrl, browserExecutable} = await prepare();
const inputProps = {clean: true};
const composition = await selectComposition({serveUrl, id: data.meta.id, browserExecutable, inputProps});
ensureDir(path.join(dir, 'start-frames'));
for (const c of plan.clips.filter((c) => !only.length || only.includes(c.id))) {
  const output = path.join(dir, 'start-frames', `${c.id}.png`);
  await renderStill({serveUrl, composition, frame: c.startFrame, output, browserExecutable, inputProps});
  console.log(`  ✓ start-frames/${c.id}.png (frame ${c.startFrame})`);
}

const r = plan.recommended;
const md = [
  '# Higgsfield 생성 가이드',
  '',
  '클립 하나씩 Higgsfield 에서 생성한 뒤, 고른 결과를 작업공간 루트 `assets/video/higgsfield/<클립 ID>.mp4` 로 저장하고 `npm run sync && npm run render:mix-preview` (BGM 이 있으면 `render:final`) 을 실행하면, 그 구간이 생성 영상으로 바뀝니다. 자막·대사·효과음 타이밍은 그대로입니다. 아직 없는 클립 구간은 기존 컷아웃 장면이 나옵니다.',
  '',
  'Higgsfield 에서 만든 결과는 Claude 가 `show_generations` 로 목록과 URL 을 읽을 수 있으니, 생성만 해 두고 "클립 가져와" 라고 말해도 됩니다.',
  '',
  '## 공통 설정',
  '',
  `- 모델: ${r.model}`,
  `- 대안: ${r.alternative}`,
  `- 화면비 ${r.aspect_ratio}, 해상도 ${r.resolution}, 오디오 생성 끔 (대사·효과음은 이미 있음)`,
  '- Start image: `higgsfield/start-frames/<클립 ID>.png`',
  '- Image references (캐릭터 일관성): ' + r.image_references.map((f) => `\`${f}\``).join(', '),
  '',
  '## 클립',
  '',
  ...plan.clips.flatMap((c) => [
    `### ${c.id} — ${c.fromSec}~${c.toSec}초 (${c.duration}초, ${c.shots.join('·')})`,
    '',
    `- Start image: \`higgsfield/start-frames/${c.id}.png\``,
    `- Duration: ${c.duration}s`,
    '',
    '```',
    [plan.style, 'Characters: ' + c.characters.map((k) => plan.characters[k]).join('; ') + '.', c.prompt].join('\n\n'),
    '```',
    '',
  ]),
].join('\n');
fs.writeFileSync(path.join(dir, 'PROMPTS.md'), md);
console.log('✓ higgsfield/PROMPTS.md');
