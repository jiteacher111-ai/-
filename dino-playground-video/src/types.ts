// scripts/lib/normalize.mjs + generate.mjs 가 만드는 정규화 스키마.
// 좌표·크기는 0~1 비율, 프레임은 전체 영상 기준 절대 프레임.
export type Anim = {name: string; base: string; delay: number; offset: number};

export type ShotCharacter = {
  id: string;
  pose: string; // 타임라인 원래 이름
  xFrom: number;
  xTo: number;
  yFrom: number; // 발밑 기준선
  yTo: number;
  scaleFrom: number; // 화면 높이 대비 캐릭터(불투명 영역) 높이
  scaleTo: number;
  facing: 'left' | 'right' | 'front' | string;
  animation: Anim;
  sprite: string | null; // public/ 기준 컷아웃 경로
  spriteKind: 'pose' | 'expression' | 'action' | null;
  spriteName: string;
  resolution: string;
  flip: boolean;
};

export type ShotProp = {
  id: string;
  kind: 'board' | 'footprints' | 'arrows' | 'boundary' | 'swing' | 'image';
  asset: string | null;
  x: number;
  y: number; // 바닥 중앙 기준
  scale: number;
  opacityFrom: number;
  opacityTo: number;
  animation: Anim;
  amplitudeFrom: number;
  amplitudeTo: number;
  periodFrames: number;
  exists?: boolean;
};

export type Camera = {type: string; scaleFrom: number; scaleTo: number; xFrom: number; xTo: number; yFrom: number; yTo: number};

export type Cut = {from: number; to: number; kind: 'wide' | 'speaker' | 'group' | 'reaction' | 'subject'; label: string; subjects: string[]; camera: Camera};

export type Shot = {
  id: string;
  scene: number | null;
  index: number;
  from: number;
  durationInFrames: number;
  background: string | null;
  backgroundExists?: boolean;
  camera: Camera;
  characters: ShotCharacter[];
  props: ShotProp[];
  dialogue: string[];
  notes: string;
  cuts: Cut[];
  transitionIn: 'none' | 'cut' | 'dissolve';
};

export type VoiceLine = {
  id: string;
  speaker: string;
  speakers: string[];
  text: string;
  emotion: string | null;
  from: number;
  to: number;
  audio: {file: string; exists: boolean}[];
};

export type SubtitleCue = {index: number; from: number; to: number; text: string; startSec: number; endSec: number};
export type AudioCue = {kind: string; file: string; from: number; to: number | null; volume: number; exists: boolean};

export type ProductionConfig = {
  bustBottomOverhang: number;
  bustScaleMultiplier: number;
  propOverrides: Record<string, {flipX?: boolean; groundSquash?: number}>;
  propScaleUnit: Record<string, 'width' | 'height'>;
  keepInSafeArea: string[];
  endFade: {fromSec: number; color: string};
  contactShadow: {opacity: number; widthRatio: number; heightRatio: number};
  acting: {runCycleFrames: number; walkCycleFrames: number; hopFrames: number; hopHeight: number; popInFrames: number; presentWhileSpeaking: boolean; neutralPoses: string[]};
};

export type ProjectData = {
  available: boolean;
  missingRequired: string[];
  problems: string[];
  meta: {id: string; fps: number; width: number; height: number; durationInFrames: number; safeArea: number; transitionFrames: number; subtitleBottom: number; subtitleMaxWidth: number; title: string};
  config: ProductionConfig;
  shots: Shot[];
  voiceLines: VoiceLine[];
  subtitles: SubtitleCue[];
  audioCues: AudioCue[];
  spriteMeta: Record<string, {width: number; height: number; padTop: number; padBottom: number; kind: string; refHeight?: number; facing?: string}>;
  spriteIndex: Record<string, string>; // "<character>/<kind>-<name>" → 경로
  spriteFacing: Record<string, string>; // 경로 → 원본 방향
  propMeta: Record<string, {width: number; height: number}>;
  speakerLabels: Record<string, string>;
};
