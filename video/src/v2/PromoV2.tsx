import React from "react";
import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { ding, mouseClick, uiSwitch, whip, whoosh } from "@remotion/sfx";
import { Backdrop } from "./motion";
import { HookV2, IdV2, NameV2, NewV2, OutroV2 } from "./scenes";

// 30 秒、120 BPM：一小節 60 影格。每段的開頭都在小節線上，點擊、蓋章都在拍點上。
export const V2 = {
  hook: { from: 0, dur: 180 },
  name: { from: 180, dur: 180 },
  id: { from: 360, dur: 180 },
  newCo: { from: 540, dur: 240 },
  outro: { from: 780, dur: 120 },
};
export const V2_DURATION = 900;

// 音效：場景內的時間＋場景開頭＝整支影片的時間
// mouse-click.wav、ding.wav 開頭有約 0.12～0.15 秒靜音，trim 掉 4 影格才會跟畫面上的點擊同時
const SFX: { at: number; src: string; volume: number; trim?: number }[] = [
  // 轉場
  ...[V2.name.from - 6, V2.id.from - 6, V2.newCo.from - 6, V2.outro.from - 6].map((at) => ({ at, src: whoosh, volume: 0.6 })),
  // 點擊
  ...[V2.name.from + 60, V2.id.from + 45, V2.id.from + 60, V2.newCo.from + 30, V2.newCo.from + 45, V2.newCo.from + 90].map((at) => ({ at, src: mouseClick, volume: 1, trim: 4 })),
  // 結果出來
  ...[V2.name.from + 110, V2.id.from + 105, V2.newCo.from + 150].map((at) => ({ at, src: ding, volume: 0.8, trim: 4 })),
  // 蓋章、數字卡
  ...[V2.name.from + 120, V2.id.from + 120, V2.newCo.from + 165].map((at) => ({ at, src: whip, volume: 0.55 })),
  ...[V2.outro.from + 0, V2.outro.from + 15, V2.outro.from + 30].map((at) => ({ at, src: uiSwitch, volume: 0.6 })),
];

export const PromoV2: React.FC = () => (
  <>
    <Backdrop />
    <Sequence name="問題＋76萬家" from={V2.hook.from} durationInFrames={V2.hook.dur}><HookV2 /></Sequence>
    <Sequence name="名稱找統編" from={V2.name.from} durationInFrames={V2.name.dur}><NameV2 /></Sequence>
    <Sequence name="統編查公司" from={V2.id.from} durationInFrames={V2.id.dur}><IdV2 /></Sequence>
    <Sequence name="新公司" from={V2.newCo.from} durationInFrames={V2.newCo.dur}><NewV2 /></Sequence>
    <Sequence name="收尾" from={V2.outro.from} durationInFrames={V2.outro.dur}><OutroV2 /></Sequence>
    <Audio src={staticFile("music.wav")} volume={0.6} />
    {SFX.map((s, i) => (
      <Sequence key={i} name="音效" from={s.at} durationInFrames={45} layout="none">
        <Audio src={s.src} volume={s.volume} trimBefore={s.trim} />
      </Sequence>
    ))}
  </>
);
