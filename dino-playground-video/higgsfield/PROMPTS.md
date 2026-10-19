# Higgsfield 생성 가이드

클립 하나씩 Higgsfield 에서 생성한 뒤, 고른 결과를 작업공간 루트 `assets/video/higgsfield/<클립 ID>.mp4` 로 저장하고 `npm run sync && npm run render:mix-preview` (BGM 이 있으면 `render:final`) 을 실행하면, 그 구간이 생성 영상으로 바뀝니다. 자막·대사·효과음 타이밍은 그대로입니다. 아직 없는 클립 구간은 기존 컷아웃 장면이 나옵니다.

Higgsfield 에서 만든 결과는 Claude 가 `show_generations` 로 목록과 URL 을 읽을 수 있으니, 생성만 해 두고 "클립 가져와" 라고 말해도 됩니다.

## 공통 설정

- 모델: seedance_2_0_mini (Seedance 2.0 Mini) — starter 플랜에서 사용 가능, start_image + image_references 로 캐릭터 일관성 유지
- 대안: grok_video_v15_lite (start_image 만, 저렴)
- 화면비 16:9, 해상도 720p, 오디오 생성 끔 (대사·효과음은 이미 있음)
- Start image: `higgsfield/start-frames/<클립 ID>.png`
- Image references (캐릭터 일관성): `assets/characters/seongun/seongun-turnaround-v1.png`, `assets/characters/tino/tino-turnaround-v1.png`, `assets/characters/ppulli/ppulli-turnaround-v1.png`, `assets/characters/karo/karo-turnaround-v1.png`

## 클립

### C01 — 0~12초 (12초, S01·S02·S03·S04)

- Start image: `higgsfield/start-frames/C01.png`
- Duration: 12s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Seongun, a 3-year-old toddler boy with short brown hair, yellow T-shirt, blue denim overalls and green shoes; Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks; Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

Wide establishing shot of a calm, empty dinosaur-themed playground; all equipment is still. The camera slowly glides forward. Seongun walks in from the left side and waves happily. Then Tino, Ppulli and Karo pop out one after another from behind the playground equipment and hop over to greet him. The camera gently moves to a friendly group shot as the four friends gather together, smiling.
```

### C02 — 12~24초 (12초, S05·S06·S07)

- Start image: `higgsfield/start-frames/C02.png`
- Duration: 12s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Seongun, a 3-year-old toddler boy with short brown hair, yellow T-shirt, blue denim overalls and green shoes; Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks; Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

Medium shot. Ppulli calmly points with one paw toward the playground promise sign on the right while the others listen. Seongun tilts his head curiously, then looks at the sign. Camera slowly pushes in on the sign, then pulls back to all four friends cheering together with little happy hops, arms up.
```

### C03 — 24~34초 (10초, S08·S09)

- Start image: `higgsfield/start-frames/C03.png`
- Duration: 10s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Seongun, a 3-year-old toddler boy with short brown hair, yellow T-shirt, blue denim overalls and green shoes; Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks; Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

At the bottom of the slide stairs, Karo and Ppulli wait in a neat line on painted footprint markers. Tino, excited, takes just one small step forward and stops, not touching anyone. Seongun walks in and kindly points at the footprints on the ground and then at the waiting friends. Low-angle side view, gentle camera drift.
```

### C04 — 34~44초 (10초, S10·S11)

- Start image: `higgsfield/start-frames/C04.png`
- Duration: 10s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks; Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

Close-up of Tino realizing his mistake with a small sheepish smile, scratching his head, not sad. Cut to a wider shot: Tino steps back onto his footprint marker in the line behind Karo; Ppulli gently gestures at the footprints. Everyone stands calmly in line, smiling.
```

### C05 — 44~59초 (15초, S12·S13·S14)

- Start image: `higgsfield/start-frames/C05.png`
- Duration: 15s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks; Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

Karo, first in line, walks toward the slide while Tino and Ppulli wait on their footprints. Karo stops near the bottom end of the slide and looks up the slide surface curiously, leaning forward, lifting one foot slightly and putting it back down. Karo does not climb onto the slide. Over-the-shoulder view from behind Karo looking up the slide, then a side view.
```

### C06 — 59~69초 (10초, S15·S16)

- Start image: `higgsfield/start-frames/C06.png`
- Duration: 10s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Seongun, a 3-year-old toddler boy with short brown hair, yellow T-shirt, blue denim overalls and green shoes; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

Seongun gently raises one open palm in a kind, helpful 'wait a moment' gesture, not scolding. Karo looks a little surprised, then listens. Seongun points to the stairs (the way up) and then to the slide surface (the way down) while gentle green upward and coral downward arrows glow on the ground. Two-shot, slow camera move.
```

### C07 — 69~76초 (7초, S17·S18)

- Start image: `higgsfield/start-frames/C07.png`
- Duration: 7s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

Karo happily walks to the stairs and climbs the slide steps carefully, holding the rail. Then Karo sits down at the top and slides down slowly feet-first in a seated position, laughing, and slows down gently before reaching the bottom. Camera follows Karo smoothly.
```

### C08 — 76~89초 (13초, S19·S20·S21)

- Start image: `higgsfield/start-frames/C08.png`
- Duration: 13s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

The swing area: an empty swing sways very slowly back and forth inside a dotted safety boundary on the ground. Karo walks toward the swings and stops well outside the dotted line. Ppulli, standing far from the swing, softly raises a paw to say stop; Karo looks surprised and stays put. Wide shot then a calm medium shot. Nobody goes near the moving swing.
```

### C09 — 89~103초 (14초, S22·S23·S24)

- Start image: `higgsfield/start-frames/C09.png`
- Duration: 14s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Seongun, a 3-year-old toddler boy with short brown hair, yellow T-shirt, blue denim overalls and green shoes; Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks; Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

Seongun points to the dotted boundary that surrounds the front and back of the slowly moving swing. All four friends stand outside the dotted line and nod. Then they walk together in a line around the outside of the boundary toward the left side of the frame, happy and careful. High angle wide shot, then a tracking side shot.
```

### C10 — 103~115초 (12초, S25·S26·S27)

- Start image: `higgsfield/start-frames/C10.png`
- Duration: 12s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots; Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks.

Back at the playground entrance in front of the three-panel promise sign. Ppulli presents the footprint panel, which softly glows; then Karo presents the slide panel, which glows; then Tino presents the swing panel, which glows. Gentle push-in on each panel in turn, warm light.
```

### C11 — 115~120초 (5초, S28)

- Start image: `higgsfield/start-frames/C11.png`
- Duration: 5s

```
Soft 3D children's picture-book animation in exactly the style of the start image and the character reference sheets. Warm pastel daylight, gentle and calm pacing for 3-6 year olds. Keep every character's design, colors and proportions identical to the references. No text, no letters, no new characters, no other people. Characters never touch, bump, push or fall; nobody gets hurt.

Characters: Seongun, a 3-year-old toddler boy with short brown hair, yellow T-shirt, blue denim overalls and green shoes; Tino, a mint-green baby dinosaur with a cream belly and rosy cheeks; Ppulli, a lavender baby triceratops with a peach-spotted frill and cream horns; Karo, an orange baby dinosaur with small red horns, a cream belly and orange back spots.

All four friends stand together in front of the playground and wave goodbye to the viewer, smiling warmly. The camera slowly pulls back. Calm, cozy ending.
```
