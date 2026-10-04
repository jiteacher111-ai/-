import React from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {characterMotion} from '../animation/motion';
import {projectData} from '../data';
import type {ShotCharacter} from '../types';

type Props = {character: ShotCharacter; shotDuration: number; speaking: {active: boolean; since: number}};

/**
 * 전처리된 컷아웃 PNG 한 장을 발밑 중앙 기준으로 배치한다 (캐릭터를 다시 그리지 않는다).
 * 접촉 그림자는 별도 타원 레이어로 만든다. 흉상(표정 크롭)은 화면 아래로 살짝 넘겨 잘린 단면을 숨긴다.
 */
export const CharacterSprite: React.FC<Props> = ({character: c, shotDuration, speaking}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  if (!c.sprite) return null; // 누락 스프라이트는 대체하지 않는다 (QA 에서 보고)
  const meta = projectData.spriteMeta[c.sprite];
  if (!meta) return null;
  const m = characterMotion(c, Math.min(frame, shotDuration + 24), shotDuration, fps, speaking);
  const bust = c.spriteKind === 'expression';
  const opaqueH = m.scale * H * m.pop * (bust ? projectData.config.bustScaleMultiplier ?? 1 : 1);
  const k = opaqueH / (meta.height - meta.padTop - meta.padBottom);
  const imgW = meta.width * k;
  const imgH = meta.height * k;
  const footY = bust ? Math.max(m.y, 1) * H + projectData.config.bustBottomOverhang * H : m.y * H;
  const left = m.x * W - imgW / 2;
  const top = footY - imgH + meta.padBottom * k;
  const sh = projectData.config.contactShadow;
  return (
    <>
      {bust ? null : (
        <div
          style={{
            position: 'absolute',
            left: m.x * W - (imgW * sh.widthRatio) / 2,
            top: footY - opaqueH * sh.heightRatio * 0.5,
            width: imgW * sh.widthRatio,
            height: opaqueH * sh.heightRatio,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(70,45,25,1) 0%, rgba(70,45,25,0.6) 45%, rgba(70,45,25,0) 72%)',
            opacity: sh.opacity * m.opacity * (1 + m.dy * 6),
          }}
        />
      )}
      <Img
        src={staticFile(c.sprite)}
        style={{
          position: 'absolute',
          left,
          top,
          width: imgW,
          height: imgH,
          opacity: m.opacity,
          transformOrigin: '50% 100%',
          transform: `translateY(${m.dy * opaqueH}px) rotate(${m.rotate}deg) scaleX(${c.flip ? -1 : 1})`,
        }}
      />
    </>
  );
};
