import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Hook } from "./scenes/Hook";
import { NameScene } from "./scenes/NameScene";
import { IdScene } from "./scenes/IdScene";
import { NewScene } from "./scenes/NewScene";
import { Outro } from "./scenes/Outro";

// 30 秒：問題 → 名稱找統編 → 統編查公司 → 新公司名單 → 收尾
export const SCENES = { hook: 120, name: 240, id: 210, newCo: 225, outro: 165 };
export const TRANSITION = 15;
export const PROMO_DURATION = Object.values(SCENES).reduce((a, b) => a + b, 0) - TRANSITION * 4;

const t = linearTiming({ durationInFrames: TRANSITION });

export const Promo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="問題" durationInFrames={120}>
      <Hook />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={t} />
    <TransitionSeries.Sequence name="名稱找統編" durationInFrames={240}>
      <NameScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={t} />
    <TransitionSeries.Sequence name="統編查公司" durationInFrames={210}>
      <IdScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={t} />
    <TransitionSeries.Sequence name="新公司" durationInFrames={225}>
      <NewScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={t} />
    <TransitionSeries.Sequence name="收尾" durationInFrames={165}>
      <Outro />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
