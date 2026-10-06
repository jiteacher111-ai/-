import React from 'react';
import {AbsoluteFill, Img, staticFile, useVideoConfig} from 'remotion';
import {cameraTransform} from '../animation/camera';
import {IVORY} from '../styles/subtitles';
import type {Camera, Shot} from '../types';

/**
 * 배경(1920×1080 을 비율 유지로 완전히 덮음) + 카메라 래퍼.
 * 카메라는 현재 컷의 카메라이며 배경과 children(소품·캐릭터) 전체에 함께 적용된다.
 */
export const BackgroundLayer: React.FC<{shot: Shot; camera: Camera; cutFrame: number; cutDuration: number; children?: React.ReactNode}> = ({shot, camera, cutFrame, cutDuration, children}) => {
  const {width: W, height: H} = useVideoConfig();
  const cam = cameraTransform(camera, cutFrame, cutDuration, W, H);
  return (
    <AbsoluteFill style={{backgroundColor: IVORY, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: cam.css}}>
        {shot.background && shot.backgroundExists ? <Img src={staticFile(shot.background)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} /> : null}
        {children}
      </div>
    </AbsoluteFill>
  );
};
