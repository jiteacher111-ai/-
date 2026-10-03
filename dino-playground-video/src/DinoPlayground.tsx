import React from 'react';
import {AbsoluteFill, Img, Sequence, getRemotionEnvironment, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {AudioTimeline} from './components/AudioTimeline';
import {BackgroundLayer} from './components/BackgroundLayer';
import {CharacterSprite} from './components/CharacterSprite';
import {PromiseBoard} from './components/PromiseBoard';
import {SafetyOverlay} from './components/SafetyOverlay';
import {SubtitleLayer} from './components/SubtitleLayer';
import {CHARACTER_ALIASES, COLORS, FONT_FAMILY} from './config';
import {projectData} from './data';
import type {Shot, VoiceLine} from './types';

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const isSpeaker = (character: string, speaker: string) => {
  const names = [character, ...(CHARACTER_ALIASES[character] ?? [])].map(norm);
  return names.includes(norm(speaker));
};

/** 숏 하나 — 숏 기준 프레임으로 동작한다 */
const ShotScene: React.FC<{shot: Shot; voiceLines: VoiceLine[]}> = ({shot, voiceLines}) => {
  const frame = useCurrentFrame();
  const globalFrame = shot.from + frame;
  const fade = shot.transition && /fade|dissolve/i.test(shot.transition) ? interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  const chars = [...shot.characters].sort((a, b) => a.z - b.z || a.y - b.y);
  return (
    <AbsoluteFill style={{opacity: fade}}>
      <BackgroundLayer shot={shot}>
        {shot.props
          .filter((p) => p.asset && p.exists)
          .map((p, i) => (
            <PropImage key={i} prop={p} />
          ))}
        {chars.map((c, i) => {
          const line = voiceLines.find((l) => l.from !== null && l.to !== null && globalFrame >= l.from && globalFrame < l.to && isSpeaker(c.character, l.speaker));
          return (
            <CharacterSprite
              key={`${c.character}-${i}`}
              placement={c}
              shotDuration={shot.durationInFrames}
              speaking={{active: Boolean(line), startedAt: line ? line.from! - shot.from : 0, expression: line?.expression ?? null}}
            />
          );
        })}
      </BackgroundLayer>
      <SafetyOverlay overlays={shot.overlays} shotDuration={shot.durationInFrames} />
      {shot.promiseBoard ? <PromiseBoard board={shot.promiseBoard} shotDuration={shot.durationInFrames} /> : null}
    </AbsoluteFill>
  );
};

const PropImage: React.FC<{prop: Shot['props'][number]}> = ({prop}) => {
  const {width: W, height: H} = useVideoConfig();
  const h = prop.scale * H;
  return (
    <Img
      src={staticFile(prop.asset!)}
      style={{position: 'absolute', height: h, left: prop.x * W, top: prop.y * H - h, transform: `translateX(-50%) scaleX(${prop.flip ? -1 : 1})`, zIndex: 5}}
    />
  );
};

/** 입력 데이터가 없을 때 Studio 에서만 보이는 안내 (렌더 스크립트는 이 상태에서 렌더하지 않는다) */
const MissingInputs: React.FC = () => (
  <AbsoluteFill style={{background: COLORS.ivory, fontFamily: FONT_FAMILY, color: COLORS.ink, padding: 80, fontSize: 40}}>
    {getRemotionEnvironment().isStudio ? (
      <>
        <div style={{fontSize: 64, marginBottom: 30}}>입력 데이터가 아직 없습니다</div>
        {projectData.missingRequired.map((f) => (
          <div key={f}>· {f}</div>
        ))}
        <div style={{marginTop: 30, fontSize: 30}}>작업공간 루트에 파일을 넣고 npm run sync → npm run preprocess 를 실행하세요.</div>
      </>
    ) : null}
  </AbsoluteFill>
);

export const DinoPlayground: React.FC = () => {
  const {shots, voiceLines, subtitles, audioCues, meta, available} = projectData;
  if (!available) return <MissingInputs />;
  return (
    <AbsoluteFill style={{backgroundColor: COLORS.ivory}}>
      {shots.map((shot) => (
        <Sequence key={shot.id} from={shot.from} durationInFrames={shot.durationInFrames} name={`${shot.id} ${shot.title}`.trim()}>
          <ShotScene shot={shot} voiceLines={voiceLines} />
        </Sequence>
      ))}
      <SubtitleLayer cues={subtitles} />
      <AudioTimeline voiceLines={voiceLines} cues={audioCues} durationInFrames={meta.durationInFrames} />
    </AbsoluteFill>
  );
};
