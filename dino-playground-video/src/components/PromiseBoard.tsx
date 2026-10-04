import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {projectData} from '../data';
import type {ShotProp} from '../types';

// 표지판 PNG 안의 세 패널 위치 (원본 1536×1024 기준 비율, 실측)
export const BOARD_PANELS = [
  {x: 0.094, y: 0.293, w: 0.255, h: 0.4}, // 1 발자국 — 차례
  {x: 0.359, y: 0.293, w: 0.279, h: 0.4}, // 2 미끄럼틀 — 바르게
  {x: 0.648, y: 0.297, w: 0.263, h: 0.402}, // 3 그네 — 안전하게
];
// 실제 불투명 영역 (원본 알파 기준) — 안전영역 보정에 사용
const OPAQUE = {l: 22 / 1536, r: 1514 / 1536};

/** 표지판의 화면 배치 (바닥 중앙 기준, 높이 = scale × 화면 높이). 안전영역 밖으로 나가면 안쪽으로 민다. */
export const boardRect = (p: ShotProp, W: number, H: number, safe: number) => {
  const size = projectData.propMeta[p.asset ?? ''] ?? {width: 1536, height: 1024};
  const unit = projectData.config.propScaleUnit.board ?? 'height';
  const h = unit === 'height' ? p.scale * H : (p.scale * W * size.height) / size.width;
  const w = (h * size.width) / size.height;
  let cx = p.x * W;
  if (projectData.config.keepInSafeArea.includes('board')) {
    const visL = cx - w / 2 + OPAQUE.l * w;
    const visR = cx - w / 2 + OPAQUE.r * w;
    if (visR > W * (1 - safe)) cx -= visR - W * (1 - safe);
    if (visL < W * safe) cx += W * safe - visL;
  }
  return {left: cx - w / 2, top: p.y * H - h, w, h, cx};
};

/**
 * 안전 약속 표지판. 원본 PNG 알파를 그대로 쓰고, 패널 강조는 같은 영역에 반투명 광택 레이어를 올린다.
 *  - rise-and-settle: 아래에서 올라와 자리 잡음
 *  - icon-glow-sequence: 세 아이콘을 12프레임 간격으로 점등
 *  - glow-panel-N: N번째 패널만 강조
 */
export const PromiseBoard: React.FC<{prop: ShotProp}> = ({prop: p}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  if (!p.asset || !p.exists) return null;
  const r = boardRect(p, W, H, projectData.meta.safeArea);
  const base = p.animation.base;
  let dy = 0;
  let opacity = 1;
  if (base === 'rise-and-settle') {
    const s = spring({frame, fps, config: {damping: 20, mass: 0.8}});
    dy = (1 - s) * 0.08 * H;
    opacity = Math.min(1, interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'}));
  }
  const glowAt = (i: number): number | null => {
    if (base === 'icon-glow-sequence') return 6 + i * 12;
    const m = /^glow-panel-(\d)$/.exec(base);
    if (m && Number(m[1]) === i + 1) return 4;
    return null;
  };
  return (
    <div style={{position: 'absolute', left: r.left, top: r.top + dy, width: r.w, height: r.h, opacity}}>
      <Img src={staticFile(p.asset)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
      {BOARD_PANELS.map((panel, i) => {
        const at = glowAt(i);
        if (at === null || frame < at) return null;
        const on = interpolate(frame - at, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
        const pulse = 0.75 + 0.25 * Math.sin(((frame - at) / 30) * Math.PI * 2);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${panel.x * 100}%`,
              top: `${panel.y * 100}%`,
              width: `${panel.w * 100}%`,
              height: `${panel.h * 100}%`,
              borderRadius: r.w * 0.035,
              background: 'radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.75) 0%, rgba(255,250,225,0.35) 45%, rgba(255,240,200,0.08) 100%)',
              mixBlendMode: 'screen',
              boxShadow: `0 0 ${r.w * 0.04}px ${r.w * 0.012}px rgba(255, 226, 140, 0.75)`,
              opacity: on * pulse * 0.85,
            }}
          />
        );
      })}
    </div>
  );
};
