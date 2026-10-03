// scripts/lib/normalize.mjs 가 만드는 정규화 스키마. 프레임은 모두 전체 영상 기준 절대 프레임.
export type CharacterPlacement = {
  character: string;
  sprite: string | null; // 크롭 id 를 직접 지정한 경우
  pose: string;
  expression: string;
  x: number; // 0~1, 발 중심 가로 위치
  y: number; // 0~1, 발 바닥(기준선) 세로 위치
  scale: number; // 화면 높이 대비 캐릭터 높이
  flip: boolean;
  z: number;
  enter: string | null;
  exit: string | null;
  move: {x: number; y: number} | null;
  expressions: {at: number; expression: string}[]; // at: 숏 시작 기준 프레임
};

export type Overlay = {
  type: string; // zone | line | check | stop | label ...
  label: string | null;
  icon: string | null;
  shape: string;
  rect: {x: number; y: number; w: number; h: number} | null;
  from: number | null; // 숏 기준
  to: number | null;
};

export type Shot = {
  id: string;
  index: number;
  title: string;
  from: number;
  durationInFrames: number;
  background: string | null;
  backgroundRef: string | null;
  backgroundExists?: boolean;
  camera: {zoomFrom: number; zoomTo: number; panXFrom: number; panXTo: number; panYFrom: number; panYTo: number; type: string | null};
  transition: string | null;
  characters: CharacterPlacement[];
  props: {asset: string | null; x: number; y: number; scale: number; flip: boolean; exists?: boolean}[];
  overlays: Overlay[];
  promiseBoard: {title: string; items: string[]; revealed?: number; revealFrames: number[]} | null;
  lineIds: string[];
};

export type VoiceLine = {
  id: string;
  speaker: string;
  text: string;
  from: number | null;
  to: number | null;
  expression: string | null;
  audio: string | null;
  audioExists?: boolean;
};

export type SubtitleCue = {index: number; from: number; to: number; text: string; startSec: number; endSec: number};
export type AudioCue = {kind: string; asset: string; from: number; to: number | null; volume: number; exists?: boolean};

export type ProjectData = {
  available: boolean;
  missingRequired: string[];
  problems: string[];
  meta: {fps: number; width: number; height: number; durationInFrames: number; title: string};
  shots: Shot[];
  voiceLines: VoiceLine[];
  subtitles: SubtitleCue[];
  audioCues: AudioCue[];
  sprites: Record<string, string>;
  spriteMeta: Record<string, {width: number; height: number; padding: number}>;
};
