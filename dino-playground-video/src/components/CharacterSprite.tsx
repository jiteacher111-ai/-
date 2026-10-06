import React from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {perform, type SpeakCtx} from '../animation/perform';
import {projectData} from '../data';
import type {ShotCharacter} from '../types';

type Props = {character: ShotCharacter; shotDuration: number; speak: SpeakCtx};

/**
 * 컷아웃 PNG 를 발밑 중앙 기준으로 배치한다 (캐릭터를 다시 그리지 않는다).
 * 크기: 같은 시트의 기준(서 있는) 포즈 키 = timeline scale × 화면 높이 → 웅크림·점프 포즈도 같은 비율로 바뀐다.
 * 접촉 그림자는 별도 타원 레이어 (점프하면 작고 옅어짐). 흉상(표정)은 화면 아래로 살짝 넘긴다.
 */
export const CharacterSprite: React.FC<Props> = ({character: c, shotDuration, speak}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  const p = perform(c, Math.min(frame, shotDuration + 24), shotDuration, fps, speak);
  if (!p.sprite) return null; // 누락 스프라이트는 대체하지 않는다 (QA 에서 보고)
  const meta = projectData.spriteMeta[p.sprite];
  if (!meta) return null;
  const bust = c.spriteKind === 'expression';
  const opaque = meta.height - meta.padTop - meta.padBottom;
  const standH = p.scale * H * p.pop * (bust ? projectData.config.bustScaleMultiplier ?? 1 : 1);
  const k = standH / (bust ? opaque : meta.refHeight ?? opaque);
  const imgW = meta.width * k;
  const imgH = meta.height * k;
  const x = (p.x + p.dx) * W;
  const footY = bust ? Math.max(p.y, 1) * H + projectData.config.bustBottomOverhang * H : p.y * H;
  const sh = projectData.config.contactShadow;
  const shW = (meta.width - meta.padTop * 2) * k * sh.widthRatio * (1 - 0.35 * p.airborne);
  return (
    <>
      {bust ? null : (
        <div
          style={{
            position: 'absolute',
            left: x - shW / 2,
            top: footY - standH * sh.heightRatio * 0.5,
            width: shW,
            height: standH * sh.heightRatio,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(70,45,25,1) 0%, rgba(70,45,25,0.6) 45%, rgba(70,45,25,0) 72%)',
            opacity: sh.opacity * p.opacity * (1 - 0.5 * p.airborne),
          }}
        />
      )}
      <Img
        src={staticFile(p.sprite)}
        style={{
          position: 'absolute',
          left: x - imgW / 2,
          top: footY - imgH + meta.padBottom * k,
          width: imgW,
          height: imgH,
          opacity: p.opacity,
          transformOrigin: '50% 100%',
          transform: `translateY(${p.dy * standH}px) rotate(${p.rotate}deg) scale(${(p.flip ? -1 : 1) * p.sx}, ${p.sy})`,
        }}
      />
    </>
  );
};
