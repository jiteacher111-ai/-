import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONT_FAMILY, SAFE, SUBTITLE_ZONE} from '../config';
import type {Shot} from '../types';

/**
 * 놀이터 안전 약속판. 항목 문구는 timeline 데이터 그대로 사용한다.
 * 공개 시점: revealFrames(숏 기준) > revealed(개수) > 숏 길이의 앞 70% 에 고르게.
 */
export const PromiseBoard: React.FC<{board: NonNullable<Shot['promiseBoard']>; shotDuration: number}> = ({board, shotDuration}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  const n = board.items.length;
  const revealAt = board.items.map((_, i) => {
    if (board.revealFrames[i] !== undefined) return board.revealFrames[i];
    if (board.revealed !== undefined) return i < board.revealed ? 0 : Infinity;
    return Math.round(8 + (i * shotDuration * 0.7) / Math.max(1, n));
  });
  const latest = revealAt.reduce((acc, f, i) => (frame >= f ? i : acc), -1);
  const enter = spring({frame, fps, config: {damping: 16}});

  // 자막 영역 위·타이틀 세이프 안쪽, 화면 오른쪽에 둔다 (캐릭터는 보통 왼쪽~가운데)
  const top = H * (SAFE.y + 0.02);
  const bottom = H * (SUBTITLE_ZONE.bottom + SUBTITLE_ZONE.height + 0.02);
  const boardH = H - top - bottom;
  const boardW = W * 0.4;
  const itemFs = Math.min(H * 0.045, (boardH * 0.72) / Math.max(1, n) / 1.5);
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 60,
        right: W * SAFE.x,
        top,
        width: boardW,
        maxHeight: boardH,
        transform: `translateY(${(1 - enter) * 40}px)`,
        opacity: enter,
        background: '#FFFDF6',
        border: `${H * 0.008}px solid ${COLORS.safetyStroke}`,
        borderRadius: H * 0.04,
        boxShadow: '0 12px 30px rgba(80,50,20,0.25)',
        padding: `${H * 0.03}px ${H * 0.035}px`,
        fontFamily: FONT_FAMILY,
        color: COLORS.ink,
        display: 'flex',
        flexDirection: 'column',
        gap: itemFs * 0.45,
        boxSizing: 'border-box',
      }}
    >
      <div style={{fontSize: H * 0.055, textAlign: 'center', marginBottom: itemFs * 0.2}}>{board.title}</div>
      {board.items.map((item, i) => {
        const local = frame - revealAt[i];
        // 아직 공개 전인 항목도 자리를 차지해 판 크기가 흔들리지 않게 한다
        const s = local < 0 ? 0 : spring({frame: local, fps, config: {damping: 13, mass: 0.7}});
        const hl = i === latest ? interpolate(local, [0, 10, 40], [0, 1, 0.6], {extrapolateRight: 'clamp'}) : 0;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: itemFs * 0.5, fontSize: itemFs, opacity: s, transform: `scale(${0.85 + 0.15 * s})`, transformOrigin: 'left center', background: `rgba(255, 201, 60, ${0.35 * hl})`, borderRadius: itemFs * 0.5, padding: `${itemFs * 0.15}px ${itemFs * 0.3}px`}}>
            <span style={{flex: 'none', width: itemFs * 1.4, height: itemFs * 1.4, borderRadius: '50%', background: COLORS.ok, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: itemFs * 0.8}}>{i + 1}</span>
            <span style={{wordBreak: 'keep-all', lineHeight: 1.25}}>{item}</span>
          </div>
        );
      })}
    </div>
  );
};
