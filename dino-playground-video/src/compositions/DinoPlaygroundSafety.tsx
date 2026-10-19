import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {AudioTimeline} from '../components/AudioTimeline';
import {BackgroundLayer} from '../components/BackgroundLayer';
import {CharacterSprite} from '../components/CharacterSprite';
import {PromiseBoard} from '../components/PromiseBoard';
import {SafetyOverlay} from '../components/SafetyOverlay';
import {SubtitleLayer} from '../components/SubtitleLayer';
import {characterMotion} from '../animation/motion';
import {projectData} from '../data';
import {IVORY} from '../styles/subtitles';
import type {GeneratedClip, Shot, VoiceLine} from '../types';

/**
 * 숏 하나(여러 컷). 레이어 순서(숏 리스트 기준): 배경 → 바닥 안전 표시 → 캐릭터·표지판(바닥 기준선 y 로 앞뒤 정렬) .
 * 표지판은 바닥에 서 있는 물체라서, 기준선이 더 아래(앞)인 캐릭터가 표지판을 가리도록 깊이 정렬한다.
 */
const ShotScene: React.FC<{shot: Shot; voiceLines: VoiceLine[]; fadeIn: number}> = ({shot, voiceLines, fadeIn}) => {
  const frame = useCurrentFrame();
  const g = shot.from + frame;
  const fps = projectData.meta.fps;
  const opacity = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  // 현재 컷 (멀티샷). 숏 끝을 지나 디졸브로 겹쳐 그려질 때는 마지막 컷을 유지
  const cut = shot.cuts.find((c) => frame >= c.from && frame < c.to) ?? shot.cuts[shot.cuts.length - 1];
  const ground = shot.props.filter((p) => p.kind === 'footprints' || p.kind === 'boundary' || p.kind === 'arrows');
  type Item = {depth: number; key: string; node: React.ReactNode};
  const items: Item[] = [];
  for (const p of shot.props.filter((p) => p.kind === 'board')) items.push({depth: p.y, key: p.id, node: <PromiseBoard prop={p} />});
  shot.characters.forEach((c, i) => {
    const line = voiceLines.find((l) => g >= l.from && g < l.to && l.speakers.includes(c.id));
    const speak = {
      active: Boolean(line),
      since: line ? line.from - shot.from : 0,
      chant: Boolean(line && line.speakers.length > 1),
      phrases: line ? line.text.split(/[,，]/).filter((x) => x.trim()).length : 1,
      duration: line ? line.to - line.from : 0,
    };
    const depth = characterMotion(c, frame, shot.durationInFrames, fps, {active: false, since: 0}).y + i * 1e-4;
    items.push({depth, key: `${c.id}-${i}`, node: <CharacterSprite character={c} shotDuration={shot.durationInFrames} speak={speak} />});
  });
  items.sort((a, b) => a.depth - b.depth);
  return (
    <AbsoluteFill style={{opacity}}>
      <BackgroundLayer shot={shot} camera={cut.camera} cutFrame={frame - cut.from} cutDuration={cut.to - cut.from}>
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

/** Higgsfield 생성 영상 구간. 앞뒤 경계는 6프레임 크로스페이드로 컷아웃 장면·다른 클립과 이어 붙인다 */
const GeneratedClipLayer: React.FC<{clip: GeneratedClip; first: boolean}> = ({clip, first}) => {
  const frame = useCurrentFrame();
  const opacity = first ? 1 : interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity}}>
      <OffthreadVideo src={staticFile(clip.file)} muted playbackRate={clip.playbackRate} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    </AbsoluteFill>
  );
};

/** clean: 자막·엔딩 페이드·오디오 없이 그림만 (Higgsfield 시작 프레임 추출용) */
export const DinoPlaygroundSafety: React.FC<{clean?: boolean}> = ({clean = false}) => {
  const {shots, voiceLines, subtitles, audioCues, meta, available, generatedClips = []} = projectData;
  if (!available) return <AbsoluteFill style={{backgroundColor: IVORY}} />;
  const T = meta.transitionFrames;
  return (
    <AbsoluteFill style={{backgroundColor: IVORY}}>
      {shots.map((shot, i) => (
        // 장소가 바뀌는 숏은 12프레임 디졸브(이전 숏을 T 프레임 더 유지), 같은 장소는 컷 편집. 검은 프레임 없음
        <Sequence key={shot.id} from={shot.from} durationInFrames={shot.durationInFrames + (shots[i + 1]?.transitionIn === 'dissolve' ? T : 0)} name={`${shot.id} ${shot.notes}`}>
          <ShotScene shot={shot} voiceLines={voiceLines} fadeIn={shot.transitionIn === 'dissolve' ? T : 0} />
        </Sequence>
      ))}
      {!clean &&
        generatedClips
          .filter((c) => c.exists)
          .map((c) => (
            <Sequence key={c.id} from={c.from} durationInFrames={c.to - c.from} name={`Higgsfield ${c.id}`}>
              <GeneratedClipLayer clip={c} first={c.from === 0} />
            </Sequence>
          ))}
      {!clean && <SubtitleLayer cues={subtitles} />}
      {!clean && <EndFade />}
      {!clean && <AudioTimeline voiceLines={voiceLines} cues={audioCues} durationInFrames={meta.durationInFrames} />}
    </AbsoluteFill>
  );
};
