import { Composition } from "remotion";
import { TipList, totalDuration } from "./compositions/TipList";
import { Explainer, explainerSchema, explainerTotal, type ExplainerProps } from "./compositions/Explainer";
import explainerDefault from "./explainerDefault.json";
import { Story, storySchema, storyTotal, type StoryProps } from "./compositions/Story";
import storyDefault from "./storyDefault.json";
import { reelSchema, type Reel } from "./types";
import { canvas } from "./brand/theme";
import defaultProps from "./defaultProps.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="Story"
      component={Story}
      schema={storySchema}
      defaultProps={storyDefault as unknown as StoryProps}
      width={canvas.width}
      height={canvas.height}
      fps={canvas.fps}
      durationInFrames={600}
      calculateMetadata={({ props }) => ({ durationInFrames: storyTotal(props.scenes) })}
    />
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
