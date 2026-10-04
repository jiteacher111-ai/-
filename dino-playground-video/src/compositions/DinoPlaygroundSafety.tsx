import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {AudioTimeline} from '../components/AudioTimeline';
import {BackgroundLayer} from '../components/BackgroundLayer';
import {CharacterSprite} from '../components/CharacterSprite';
import {PromiseBoard} from '../components/PromiseBoard';
import {SafetyOverlay} from '../components/SafetyOverlay';
import {SubtitleLayer} from '../components/SubtitleLayer';
import {characterMotion} from '../animation/motion';
import {projectData} from '../data';
import {IVORY} from '../styles/subtitles';
import type {Shot, VoiceLine} from '../types';

/**
 * 숏 하나. 레이어 순서(숏 리스트 기준): 배경 → 바닥 안전 표시 → 캐릭터·표지판(바닥 기준선 y 로 앞뒤 정렬) .
 * 표지판은 바닥에 서 있는 물체라서, 기준선이 더 아래(앞)인 캐릭터가 표지판을 가리도록 깊이 정렬한다.
 */
const ShotScene: React.FC<{shot: Shot; voiceLines: VoiceLine[]; fadeIn: number}> = ({shot, voiceLines, fadeIn}) => {
  const frame = useCurrentFrame();
  const g = shot.from + frame;
  const opacity = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  const ground = shot.props.filter((p) => p.kind === 'footprints' || p.kind === 'boundary' || p.kind === 'arrows');
  type Item = {depth: number; key: string; node: React.ReactNode};
  const items: Item[] = [];
  for (const p of shot.props.filter((p) => p.kind === 'board')) items.push({depth: p.y, key: p.id, node: <PromiseBoard prop={p} />});
  shot.characters.forEach((c, i) => {
    const line = voiceLines.find((l) => g >= l.from && g < l.to && l.speakers.includes(c.id));
    const speaking = {active: Boolean(line), since: line ? line.from - shot.from : 0};
    const depth = characterMotion(c, frame, shot.durationInFrames, projectData.meta.fps, speaking).y + i * 1e-4;
    items.push({depth, key: `${c.id}-${i}`, node: <CharacterSprite character={c} shotDuration={shot.durationInFrames} speaking={speaking} />});
  });
  items.sort((a, b) => a.depth - b.depth);
  return (
    <AbsoluteFill style={{opacity}}>
      <BackgroundLayer shot={shot}>
        {ground.map((p) => (
          <SafetyOverlay key={p.id} prop={p} shotDuration={shot.durationInFrames} />
        ))}
        {items.map((it) => (
          <React.Fragment key={it.key}>{it.node}</React.Fragment>
        ))}
      </BackgroundLayer>
    </AbsoluteFill>
  );
};

const EndFade: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = projectData.meta;
  const from = Math.round(projectData.config.endFade.fromSec * fps);
  const o = interpolate(frame, [from, durationInFrames - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return o > 0 ? <AbsoluteFill style={{backgroundColor: projectData.config.endFade.color ?? IVORY, opacity: o}} /> : null;
};

export const DinoPlaygroundSafety: React.FC = () => {
  const {shots, voiceLines, subtitles, audioCues, meta, available} = projectData;
  if (!available) return <AbsoluteFill style={{backgroundColor: IVORY}} />;
  const T = meta.transitionFrames;
  return (
    <AbsoluteFill style={{backgroundColor: IVORY}}>
      {shots.map((shot, i) => (
        // 다음 숏이 T 프레임 동안 디졸브로 겹쳐 들어오도록 이전 숏을 T 프레임 더 유지 (검은 프레임 없음)
        <Sequence key={shot.id} from={shot.from} durationInFrames={shot.durationInFrames + (i < shots.length - 1 ? T : 0)} name={`${shot.id} ${shot.notes}`}>
          <ShotScene shot={shot} voiceLines={voiceLines} fadeIn={i === 0 ? 0 : T} />
        </Sequence>
      ))}
      <SubtitleLayer cues={subtitles} />
      <EndFade />
      <AudioTimeline voiceLines={voiceLines} cues={audioCues} durationInFrames={meta.durationInFrames} />
    </AbsoluteFill>
  );
};
