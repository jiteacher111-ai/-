import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {COLORS} from '../config';
import type {Shot} from '../types';

/** 배경 이미지 + 완만한 카메라 줌/팬. 프레임은 숏 기준. */
export const BackgroundLayer: React.FC<{shot: Shot; children?: React.ReactNode}> = ({shot, children}) => {
  const frame = useCurrentFrame();
  const {camera, durationInFrames} = shot;
  const t = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ease = t * t * (3 - 2 * t);
  const zoom = camera.zoomFrom + (camera.zoomTo - camera.zoomFrom) * ease;
  const panX = camera.panXFrom + (camera.panXTo - camera.panXFrom) * ease;
  const panY = camera.panYFrom + (camera.panYTo - camera.panYFrom) * ease;
  return (
    <AbsoluteFill style={{backgroundColor: COLORS.ivory, overflow: 'hidden'}}>
      {/* 캐릭터·소품도 같은 카메라를 따르도록 children 을 함께 변환한다 */}
      <AbsoluteFill style={{transform: `translate(${-panX * 100}%, ${-panY * 100}%) scale(${zoom})`, transformOrigin: '50% 60%'}}>
        {shot.background && shot.backgroundExists !== false ? (
          <Img src={staticFile(shot.background)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        ) : null}
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
