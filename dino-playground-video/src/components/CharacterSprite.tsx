import React from 'react';
import {Easing, Img, getRemotionEnvironment, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SPEAK} from '../config';
import {projectData, resolveSprite} from '../data';
import type {CharacterPlacement} from '../types';

type Props = {
  placement: CharacterPlacement;
  shotDuration: number;
  /** 현재 이 캐릭터가 말하는 중인지, 대사가 지정한 표정 */
  speaking: {active: boolean; startedAt: number; expression: string | null};
};

const ENTER_FRAMES = 16;
const EXIT_FRAMES = 12;

/** 숏 기준 프레임에서의 표정 (표정 전환 목록 → 대사 표정 순으로 적용) */
const expressionAt = (p: CharacterPlacement, frame: number, speakingExpr: string | null) => {
  let e = p.expression;
  let changedAt = 0;
  for (const c of p.expressions) if (frame >= c.at) (e = c.expression, (changedAt = c.at));
  return {expression: speakingExpr ?? e, changedAt};
};

/**
 * 전처리된 컷아웃 PNG 하나를 배치한다. 캐릭터를 새로 그리지 않는다.
 * 립싱크 대신 대사 중 미세한 상하 움직임·고개 기울기·표정 전환으로 말하기를 표현한다.
 */
export const CharacterSprite: React.FC<Props> = ({placement: p, shotDuration, speaking}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const {expression, changedAt} = expressionAt(p, frame, speaking.active ? speaking.expression : null);
  const prev = frame - changedAt < SPEAK.expressionCrossfade && changedAt > 0 ? expressionAt(p, changedAt - 1, null).expression : null;
  const src = resolveSprite(p.character, p.pose, expression, p.sprite);
  const prevSrc = prev ? resolveSprite(p.character, p.pose, prev, p.sprite) : null;

  const h = p.scale * H;
  const meta = src ? projectData.spriteMeta[src] : undefined;
  const w = meta ? (h * meta.width) / meta.height : h * 0.8;

  // 위치: 기본 → move 목표로 이동
  const tMove = p.move ? interpolate(frame, [ENTER_FRAMES, Math.max(ENTER_FRAMES + 1, shotDuration - EXIT_FRAMES)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)}) : 0;
  let x = p.x + ((p.move?.x ?? p.x) - p.x) * tMove;
  const y = p.y + ((p.move?.y ?? p.y) - p.y) * tMove;

  // 등장/퇴장 (부드럽게 걸어 들어오고 나간다 — 넘어짐·충돌 같은 연출은 없다)
  let opacity = 1;
  const enterT = interpolate(frame, [0, ENTER_FRAMES], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const exitT = interpolate(frame, [shotDuration - EXIT_FRAMES, shotDuration], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
  const off = (dir: string | null, t: number) => {
    if (!dir) return;
    if (dir.includes('left')) x -= (1 - t) * (x + w / W);
    else if (dir.includes('right')) x += (1 - t) * (1 - x + w / W);
    else opacity *= t; // fade / pop
  };
  off(p.enter, enterT);
  if (p.exit) {
    const t = 1 - exitT;
    if (p.exit.includes('left')) x -= (1 - t) * (x + w / W);
    else if (p.exit.includes('right')) x += (1 - t) * (1 - x + w / W);
    else opacity *= t;
  }
  const walking = (p.enter && /left|right/.test(p.enter) && frame < ENTER_FRAMES) || (p.move && tMove > 0 && tMove < 1);
  const walkBob = walking ? -Math.abs(Math.sin((frame / 6) * Math.PI)) * h * 0.02 : 0;

  // 숨쉬기 + 말하기
  const breathe = 1 + Math.sin((frame / 48) * Math.PI * 2) * 0.006;
  const sf = frame - speaking.startedAt;
  const speakBob = speaking.active ? -Math.abs(Math.sin((sf / SPEAK.bobPeriodFrames) * Math.PI)) * h * SPEAK.bobPx : 0;
  const speakTilt = speaking.active ? Math.sin((sf / SPEAK.tiltPeriodFrames) * Math.PI * 2) * SPEAK.tiltDeg : 0;
  const speakIn = speaking.active ? interpolate(sf, [0, 5], [0, 1], {extrapolateRight: 'clamp'}) : 0;

  const box: React.CSSProperties = {
    position: 'absolute',
    left: x * W - w / 2,
    top: y * H - h,
    width: w,
    height: h,
    zIndex: 10 + p.z,
    opacity,
    transformOrigin: '50% 100%',
    transform: `translateY(${walkBob + speakBob}px) rotate(${speakTilt * speakIn}deg) scale(${p.flip ? -1 : 1}, ${breathe + speakIn * 0.006})`,
  };

  if (!src) {
    // 누락 스프라이트는 렌더하지 않는다. Studio 에서만 위치를 점선으로 표시.
    if (!getRemotionEnvironment().isStudio) return null;
    return (
      <div style={{...box, transform: undefined, border: '4px dashed #e0242b', color: '#e0242b', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
        스프라이트 없음
        <br />
        {p.character}/{p.pose}/{expression}
      </div>
    );
  }
  const img: React.CSSProperties = {position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: '50% 100%'};
  const fadeIn = prevSrc ? interpolate(frame - changedAt, [0, SPEAK.expressionCrossfade], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  return (
    <div style={box}>
      {prevSrc && prevSrc !== src ? <Img src={staticFile(prevSrc)} style={{...img, opacity: 1 - fadeIn}} /> : null}
      <Img src={staticFile(src)} style={{...img, opacity: prevSrc && prevSrc !== src ? fadeIn : 1}} />
    </div>
  );
};
