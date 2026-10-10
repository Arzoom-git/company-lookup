import { Composition, Folder } from "remotion";
import { Promo, PROMO_DURATION, SCENES } from "./Promo";
import { PromoV2, V2_DURATION } from "./v2/PromoV2";
import { Hook } from "./scenes/Hook";
import { NameScene } from "./scenes/NameScene";
import { IdScene } from "./scenes/IdScene";
import { NewScene } from "./scenes/NewScene";
import { Outro } from "./scenes/Outro";

const base = { width: 1920, height: 1080, fps: 30 };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="PromoV2" component={PromoV2} durationInFrames={V2_DURATION} {...base} />
    <Composition id="Promo" component={Promo} durationInFrames={PROMO_DURATION} {...base} />
    <Folder name="Scenes">
      <Composition id="Hook" component={Hook} durationInFrames={SCENES.hook} {...base} />
      <Composition id="NameScene" component={NameScene} durationInFrames={SCENES.name} {...base} />
      <Composition id="IdScene" component={IdScene} durationInFrames={SCENES.id} {...base} />
      <Composition id="NewScene" component={NewScene} durationInFrames={SCENES.newCo} {...base} />
      <Composition id="Outro" component={Outro} durationInFrames={SCENES.outro} {...base} />
    </Folder>
  </>
);
