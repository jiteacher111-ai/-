import {interpolate} from 'remotion';
import {projectData} from '../data';
import type {ShotCharacter} from '../types';
import {characterMotion, type Motion} from './motion';

/**
 * 역동 연기 레이어: 기본 위치·호흡(motion.ts) 위에 "어떤 컷아웃을 언제 보여줄지"와 점프·착지를 더한다.
 * 모두 제공된 컷아웃(v1 포즈 시트 + v2 동작 시트) 교체와 위치·크기 변환만 쓴다 (새로 그리지 않음, 립싱크 없음).
 *  - 이동 중: run-a / run-b 를 번갈아 보여 주는 달리기·걷기 사이클
 *  - 등장(pop-in): 웅크림(ready) → 점프(jump) → 착지 찌그러짐 → 기본 포즈
 *  - 합창 구호: 구절마다 웅크림 → 점프 → 착지 (캐릭터마다 지연을 두어 물결처럼)
 *  - 혼자 설명하는 대사: 서 있는 기본 포즈면 손을 내미는 present 포즈로
 *  - 놀람(surprised): 숏 시작에 살짝 뒤로 튀는 반응
 */
export type Performance = Motion & {sprite: string | null; sx: number; sy: number; dx: number; flip: boolean; airborne: number};

export type SpeakCtx = {active: boolean; since: number; chant: boolean; phrases: number; duration: number};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const perform = (c: ShotCharacter, f: number, D: number, fps: number, speak: SpeakCtx): Performance => {
  const A = projectData.config.acting;
  const m = characterMotion(c, f, D, fps, {active: speak.active && !speak.chant, since: speak.since});
  const sp = (name: string) => projectData.spriteIndex[`${c.id}/${name}`] ?? null;
  const baseKey = Object.entries(projectData.spriteIndex).find(([, v]) => v === c.sprite)?.[0]?.split('/')[1] ?? '';
  let sprite = c.sprite;
  let sx = 1, sy = 1, dx = 0, airborne = 0;
  let rotate = m.rotate;
  let opacity = m.opacity;
  let dy = m.dy;
  const t = f - c.animation.delay;
  const base = c.animation.base;
  const bust = c.spriteKind === 'expression';

  const hop = (h: number, len: number) => {
    // h: 홉 안에서의 프레임. 0~3 웅크림, 3~len-3 공중(jump 컷아웃), 마지막 3 착지
    if (h < 0 || h >= len) return false;
    if (h < 3) sy = 1 - 0.07 * (h / 3);
    else if (h < len - 3) {
      const k = (h - 3) / (len - 6);
      airborne = Math.sin(Math.PI * k);
      dy -= A.hopHeight * airborne;
      sprite = sp('action-jump') ?? sprite;
      sy = 1 + 0.04 * Math.cos(Math.PI * k);
    } else sy = 0.94 + 0.06 * ((h - (len - 3)) / 3);
    return true;
  };

  if (!bust) {
    if (/^pop-in/.test(base)) {
      // 등장: 웅크림 → 점프 → 착지
      const L = A.popInFrames;
      if (t < 0) opacity = 0;
      else if (t < 6) {
        sprite = sp('action-ready') ?? sprite;
        opacity = clamp01(t / 4);
        dy += 0.02 * (1 - t / 6);
      } else hop(t - 6 + 3, L - 6 + 3);
    } else if (m.moving && !/slide/.test(base)) {
      // 달리기·걷기 사이클: 두 컷아웃 교대 + 보폭에 맞춘 바운스
      const cyc = /run|eager/.test(base) ? A.runCycleFrames : A.walkCycleFrames;
      const a = sp('action-run-a'), b = sp('action-run-b');
      if (a && b) {
        sprite = Math.floor(t / cyc) % 2 === 0 ? a : b;
        rotate = Math.max(-6, Math.min(6, rotate * 1.3));
      }
    } else if (speak.active && speak.chant) {
      // 합창 구호: 구절마다 홉 (캐릭터별 지연으로 물결)
      const st = f - speak.since - c.animation.delay;
      const gap = Math.max(A.hopFrames + 2, speak.duration / speak.phrases);
      for (let k = 0; k < speak.phrases; k++) if (hop(st - k * gap, A.hopFrames)) break;
    } else if (speak.active && A.presentWhileSpeaking && A.neutralPoses.includes(baseKey) && f - speak.since >= 4) {
      sprite = sp('action-present') ?? sprite;
    }
    if (baseKey === 'action-surprised' && t >= 0 && t < 12) {
      // 놀람: 바라보는 반대쪽으로 살짝 튀었다 착지
      const k = t / 12;
      dy -= 0.05 * Math.sin(Math.PI * k);
      dx = (c.facing === 'left' ? 1 : -1) * 0.012 * interpolate(k, [0, 1], [0, 1]);
    } else if (baseKey === 'action-surprised') dx = (c.facing === 'left' ? 1 : -1) * 0.012;
  }
  const native = sprite ? projectData.spriteFacing[sprite] ?? 'front' : 'front';
  const flip = (c.facing === 'left' && native === 'right') || (c.facing === 'right' && native === 'left');
  return {...m, dy, rotate, opacity, sprite, sx, sy, dx, flip, airborne};
};
