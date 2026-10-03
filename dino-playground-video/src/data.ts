import raw from './generated/project-data.json';
import type {ProjectData} from './types';

export const projectData = raw as unknown as ProjectData;

const slug = (s: string) =>
  s
    .trim()
    .replace(/[\\/\s]+/g, '_')
    .replace(/[^\p{L}\p{N}_.-]/gu, '')
    .toLowerCase();

/** 캐릭터/포즈/표정 → 전처리된 PNG 경로. 없으면 null (다른 이미지로 대체하지 않는다) */
export const resolveSprite = (character: string, pose: string, expression: string, spriteId?: string | null): string | null => {
  const s = projectData.sprites;
  if (spriteId) return s[`id:${slug(spriteId)}`] ?? null;
  return s[[character, pose, expression].map(slug).join('|')] ?? s[`id:${slug(`${character}_${pose}_${expression}`)}`] ?? null;
};
