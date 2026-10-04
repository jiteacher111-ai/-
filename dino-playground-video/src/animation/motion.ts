import {Easing, interpolate, spring} from 'remotion';
import type {ShotCharacter} from '../types';

// 브리프 9절 기준값
const IDLE = {amp: 0.012, period: 60}; // 대기: 48~72프레임 주기, 1~2% 상하
const WALK = {bounce: 0.025, rot: 3, stride: 10}; // 걷기: 최대 2.5% 바운스, ±3도
const SPEAK = {amp: 0.01, period: 10, tilt: 1.5, tiltPeriod: 26}; // 그림책식 말하기 (립싱크 없음)
const MAX_ROT = 3;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number, fn: (x: number) => number) => fn(clamp01(t));

export type Motion = {
  x: number; // 0~1
  y: number; // 0~1 발밑
  scale: number; // 화면 높이 비율
  dy: number; // 캐릭터 높이 대비 추가 상하(음수 = 위)
  rotate: number; // deg
  opacity: number;
  pop: number; // 등장 스케일 배수
  moving: boolean;
};

const isWalk = (b: string) => /walk|stair|eager-step|step-to-mark|one-step/.test(b);

/** 캐릭터 한 명의 숏 기준 프레임 f 에서의 상태 */
export const characterMotion = (c: ShotCharacter, f: number, D: number, fps: number, speaking: {active: boolean; since: number}): Motion => {
  const {base, delay, offset} = c.animation;
  const t = f - delay;

  // 위치 진행도
  let p: number;
  if (/freeze|one-step|eager-step|step-to-mark/.test(base)) {
    // 짧게 이동한 뒤 8~12프레임 감속 후 완전히 정지
    p = ease(t / Math.min(D * 0.55, 54), Easing.out(Easing.cubic));
  } else if (/slide-ease-out/.test(base)) {
    p = ease(t / (D - 10), Easing.out(Easing.cubic)); // 바닥 도착 직전 감속
  } else {
    p = ease(t / (D - 10), Easing.inOut(Easing.sin)); // 끝나기 10프레임 전 정지
  }
  const x = c.xFrom + (c.xTo - c.xFrom) * p;
  const y = c.yFrom + (c.yTo - c.yFrom) * p;
  const scale = c.scaleFrom + (c.scaleTo - c.scaleFrom) * p;
  const travels = c.xFrom !== c.xTo || c.yFrom !== c.yTo;
  const moving = travels && p > 0.001 && p < 0.999;

  let dy = 0;
  let rotate = 0;
  let opacity = 1;
  let pop = 1;

  if (moving && !/slide/.test(base)) {
    // 걸음 바운스 — 출발·도착 근처에서 자연스럽게 0 으로 (isWalk 계열이 아니어도 이동하면 걷는다)
    const p2 = Math.min(1, Math.sin(Math.PI * p) * (isWalk(base) ? 1.6 : 1.2));
    const ph = (t / WALK.stride) * Math.PI;
    dy -= Math.abs(Math.sin(ph)) * WALK.bounce * p2;
    rotate += Math.sin(ph) * WALK.rot * p2;
  } else {
    // 대기 호흡
    const period = /patient/.test(base) ? 72 : IDLE.period;
    dy -= ((Math.sin(((f + offset * 11 + delay * 5) / period) * Math.PI * 2) + 1) / 2) * IDLE.amp;
  }

  if (/^pop-in/.test(base)) {
    const s = spring({frame: t, fps, config: {damping: 18, mass: 0.7}});
    opacity *= t < 0 ? 0 : clamp01(s * 1.4);
    pop = 0.9 + 0.1 * s;
    dy += (1 - s) * 0.04;
  }
  if (/chant-bounce/.test(base) && t >= 0) dy -= Math.abs(Math.sin((t / 12) * Math.PI)) * 0.018;
  if (/head-tilt/.test(base)) rotate += interpolate(t, [6, 20], [0, 3], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (/pause-and-look/.test(base)) rotate += interpolate(t, [10, 24], [0, -2], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (/small-head-dip/.test(base)) {
    const k = interpolate(t, [8, 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin)});
    rotate += 2 * k;
    dy += 0.01 * k;
  }
  if (/^nod/.test(base) && t >= 10 && t <= 40) rotate += 2 * Math.abs(Math.sin(((t - 10) / 15) * Math.PI));
  if (/wave|greet/.test(base) && t >= 0) rotate += 2 * Math.sin((t / 36) * Math.PI * 2);
  if (/indicate|raise-forefoot|point/.test(base) && t >= 0) rotate += 1 + 1.2 * Math.sin((t / 48) * Math.PI * 2);
  if (/gentle-stop|^pause$/.test(base)) dy += 0.008 * (1 - spring({frame: f, fps, config: {damping: 20}}));

  if (speaking.active) {
    const st = f - speaking.since;
    const k = clamp01(st / 5);
    dy -= Math.abs(Math.sin((st / SPEAK.period) * Math.PI)) * SPEAK.amp * k;
    rotate += Math.sin((st / SPEAK.tiltPeriod) * Math.PI * 2) * SPEAK.tilt * k;
  }
  rotate = Math.max(-MAX_ROT, Math.min(MAX_ROT, rotate));
  return {x, y, scale, dy, rotate, opacity, pop, moving};
};
