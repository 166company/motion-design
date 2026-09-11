import { Composition } from "remotion";
import { TipList, totalDuration } from "./compositions/TipList";
import { Explainer, explainerSchema, explainerTotal, type ExplainerProps } from "./compositions/Explainer";
import explainerDefault from "./explainerDefault.json";
import { reelSchema, type Reel } from "./types";
import { canvas } from "./brand/theme";
import defaultProps from "./defaultProps.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="Explainer"
      component={Explainer}
      schema={explainerSchema}
      defaultProps={explainerDefault as unknown as ExplainerProps}
      width={canvas.width}
      height={canvas.height}
      fps={canvas.fps}
      durationInFrames={600}
      calculateMetadata={({ props }) => ({ durationInFrames: explainerTotal(props.scenes) })}
    />
    <Composition
      id="TipList"
      component={TipList}
      schema={reelSchema}
      defaultProps={defaultProps as unknown as Reel}
      width={canvas.width}
      height={canvas.height}
      fps={canvas.fps}
      durationInFrames={165}
      calculateMetadata={({ props }) => ({
        durationInFrames: totalDuration(props.scenes),
      })}
    />
      </>
  );
};
