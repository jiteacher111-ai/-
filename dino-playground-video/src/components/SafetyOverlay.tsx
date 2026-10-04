import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {projectData} from '../data';
import type {ShotProp} from '../types';

/**
 * 바닥 안전 표시 SVG 소품(발자국·미끄럼틀 화살표·그네 안전경계). 제공된 SVG 파일만 사용한다.
 * 배치: (x, y) = 소품의 바닥 중앙, scale = 화면 너비 대비 소품 너비. production.config.json propOverrides 로
 * 화살표 좌우 반전(배경의 계단=오른쪽, 슬라이드=왼쪽에 맞춤)과 그네 경계의 바닥 원근 압축을 적용한다.
 *  - pop-sequence: 발자국 세 쌍을 8프레임 간격으로 차례로 표시
 *  - arrows-sequential: 상승(초록) 화살표 먼저, 하강(코럴) 화살표는 8프레임 뒤
 *  - draw-dashes: 점선 경계를 원을 그리듯 드러냄
 */
export const SafetyOverlay: React.FC<{prop: ShotProp; shotDuration: number}> = ({prop: p, shotDuration}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  if (!p.asset || !p.exists) return null;
  const size = projectData.propMeta[p.asset];
  if (!size) return null;
  const fix = projectData.config.propOverrides?.[p.id] ?? {};
  const w = p.scale * W;
  const h = (w * size.height) / size.width;
  const left = p.x * W - w / 2;
  const top = p.y * H - h;
  const fadeLen = p.animation.base === 'draw-dashes' ? 24 : Math.max(1, shotDuration - 1);
  const opacity = interpolate(frame, [0, fadeLen], [p.opacityFrom, p.opacityTo], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (opacity <= 0.001 && p.opacityTo <= 0.001) return null;
  const src = staticFile(p.asset);
  const box: React.CSSProperties = {position: 'absolute', left, top, width: w, height: h, transformOrigin: '50% 100%', transform: `scale(${fix.flipX ? -1 : 1}, ${fix.groundSquash ?? 1})`}; // 바닥 중앙 기준
  const base = p.animation.base;

  if (base === 'pop-sequence' || base === 'arrows-sequential') {
    // 조각별 등장: 발자국은 가로 3등분, 화살표는 좌(상승)/우(하강) 2등분
    const parts = base === 'pop-sequence' ? 3 : 2;
    const step = 8;
    const startAt = 6;
    return (
      <div style={{...box, opacity: base === 'pop-sequence' ? opacity : 1}}>
        {Array.from({length: parts}, (_, i) => {
          const s = spring({frame: frame - startAt - i * step, fps, config: {damping: 18}});
          const l = (i / parts) * 100, r = ((parts - 1 - i) / parts) * 100;
          return (
            <Img
              key={i}
              src={src}
              style={{position: 'absolute', inset: 0, width: '100%', height: '100%', clipPath: `inset(0 ${r}% 0 ${l}%)`, opacity: Math.min(1, s * 1.3), transformOrigin: `${l + 50 / parts}% 100%`, transform: `scale(${0.85 + 0.15 * s}) translateY(${(1 - s) * 6}%)`}}
            />
          );
        })}
      </div>
    );
  }
  if (base === 'draw-dashes') {
    const sweep = interpolate(frame, [0, 30], [0, 360], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const mask = sweep >= 360 ? undefined : `conic-gradient(from 270deg, #000 ${sweep}deg, transparent ${sweep + 0.5}deg)`;
    return <Img src={src} style={{...box, opacity, WebkitMaskImage: mask, maskImage: mask}} />;
  }
  void H;
  return <Img src={src} style={{...box, opacity}} />;
};
