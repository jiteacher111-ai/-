import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONT_FAMILY, SAFE, SUBTITLE_ZONE} from '../config';
import type {Overlay} from '../types';

/**
 * 안전 안내 그래픽 (안전선·안전 구역·체크·주의 표시·라벨).
 * 위험을 과장하지 않도록 부드러운 노랑/초록 위주로만 표시한다.
 * 프레임은 숏 기준.
 */
export const SafetyOverlay: React.FC<{overlays: Overlay[]; shotDuration: number}> = ({overlays, shotDuration}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none'}}>
      {overlays.map((o, i) => {
        const from = o.from ?? 0;
        const to = o.to ?? shotDuration;
        if (frame < from || frame >= to) return null;
        const local = frame - from;
        const appear = spring({frame: local, fps, config: {damping: 14, mass: 0.6}});
        const fadeOut = interpolate(frame, [to - 6, to], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const op = Math.min(appear, fadeOut);
        const pulse = 0.5 + 0.5 * Math.sin((local / fps) * Math.PI * 2 * 0.8);
        const r = o.rect ?? {x: 0.3, y: 0.55, w: 0.4, h: 0.3};
        const [rx, ry, rw, rh] = [r.x * W, r.y * H, r.w * W, r.h * H];
        const type = o.type.toLowerCase();
        const label = o.label ? <OverlayLabel key={`l${i}`} text={o.label} x={rx + rw / 2} y={ry} opacity={op} W={W} H={H} /> : null;

        if (/zone|area|circle|safe/.test(type)) {
          const dash = 22;
          const offset = -local * 1.5;
          const shape =
            o.shape === 'rect' ? (
              <rect x={rx} y={ry} width={rw} height={rh} rx={Math.min(rw, rh) * 0.15} />
            ) : (
              <ellipse cx={rx + rw / 2} cy={ry + rh / 2} rx={rw / 2} ry={rh / 2} />
            );
          return (
            <g key={i} opacity={op}>
              <g fill={COLORS.safety} fillOpacity={0.18 + 0.1 * pulse} stroke="none">{shape}</g>
              <g fill="none" stroke={COLORS.safetyStroke} strokeWidth={8} strokeDasharray={`${dash} ${dash * 0.7}`} strokeDashoffset={offset} strokeLinecap="round">
                {shape}
              </g>
              {label}
            </g>
          );
        }
        if (/line/.test(type)) {
          // 안전선: rect 의 위쪽 가장자리를 따라 그린다 (h 가 크면 세로선)
          const vertical = rh > rw;
          const [x1, y1, x2, y2] = vertical ? [rx, ry, rx, ry + rh] : [rx, ry, rx + rw * appear, ry];
          return (
            <g key={i} opacity={fadeOut}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.safety} strokeWidth={14} strokeDasharray="34 18" strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.safetyStroke} strokeWidth={4} strokeDasharray="34 18" strokeLinecap="round" />
              {label}
            </g>
          );
        }
        if (/check|ok|good/.test(type)) {
          const cx = rx + rw / 2, cy = ry + rh / 2, R = Math.min(rw, rh, H * 0.18) / 2;
          return (
            <g key={i} opacity={op} transform={`translate(${cx} ${cy}) scale(${appear})`}>
              <circle r={R} fill={COLORS.ok} stroke="#fff" strokeWidth={R * 0.1} />
              <path d={`M ${-R * 0.45} 0 L ${-R * 0.1} ${R * 0.35} L ${R * 0.5} ${-R * 0.35}`} fill="none" stroke="#fff" strokeWidth={R * 0.18} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={R * 2} strokeDashoffset={R * 2 * (1 - interpolate(local, [4, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}))} />
            </g>
          );
        }
        if (/stop|wait|caution|warn|attention/.test(type)) {
          // 멈춤/기다림 신호: 겁주지 않는 둥근 주황 배지
          const cx = rx + rw / 2, cy = ry + rh / 2, R = Math.min(rw, rh, H * 0.16) / 2;
          return (
            <g key={i} opacity={op} transform={`translate(${cx} ${cy}) scale(${0.92 + 0.08 * appear + 0.03 * pulse})`}>
              <circle r={R} fill={COLORS.safety} stroke={COLORS.safetyStroke} strokeWidth={R * 0.12} />
              <text textAnchor="middle" dominantBaseline="central" fontFamily={FONT_FAMILY} fontSize={R * 0.62} fill={COLORS.ink}>
                {o.icon ?? '잠깐!'}
              </text>
            </g>
          );
        }
        // label / caption / 기타
        return o.label ? <g key={i}>{label}</g> : null;
      })}
    </svg>
  );
};

const OverlayLabel: React.FC<{text: string; x: number; y: number; opacity: number; W: number; H: number}> = ({text, x, y, opacity, W, H}) => {
  const fs = H * 0.042;
  const pw = Math.min(W * (1 - SAFE.x * 2), text.length * fs * 0.95 + fs * 1.4);
  const ph = fs * 1.7;
  // 라벨은 타이틀 세이프 안, 자막 영역 위에 머문다
  const cx = Math.max(W * SAFE.x + pw / 2, Math.min(W * (1 - SAFE.x) - pw / 2, x));
  const maxY = H * (1 - SUBTITLE_ZONE.bottom - SUBTITLE_ZONE.height) - ph - 8;
  const cy = Math.max(H * SAFE.y, Math.min(maxY, y - ph - 14));
  return (
    <g opacity={opacity}>
      <rect x={cx - pw / 2} y={cy} width={pw} height={ph} rx={ph / 2} fill="#FFFDF6" stroke={COLORS.safetyStroke} strokeWidth={4} />
      <text x={cx} y={cy + ph / 2} textAnchor="middle" dominantBaseline="central" fontFamily={FONT_FAMILY} fontSize={fs} fill={COLORS.ink}>
        {text}
      </text>
    </g>
  );
};
