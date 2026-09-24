import { Composition } from "remotion";
import { TipList, totalDuration } from "./compositions/TipList";
import { Explainer, explainerSchema, explainerTotal, type ExplainerProps } from "./compositions/Explainer";
import explainerDefault from "./explainerDefault.json";
import { Showcase, showcaseSchema, showcaseTotal, type ShowcaseProps } from "./compositions/Showcase";
import showcaseDefault from "./showcaseDefault.json";
import { Motion, motionSchema, motionTotal, type MotionProps } from "./compositions/Motion";
import motionDefault from "./motionDefault.json";
import { SmmReel, smmReelSchema, smmReelTotal, type SmmReelProps } from "./compositions/SmmReel";
import smmReelDefault from "./smmReelDefault.json";
import { BoxDrop, boxDropSchema, boxDropTotal, type BoxDropProps } from "./compositions/BoxDrop";
import { Story, storySchema, storyTotal, type StoryProps } from "./compositions/Story";
import storyDefault from "./storyDefault.json";
import { Carousel, carouselSchema, type CarouselProps } from "./compositions/Carousel";
import carouselDefault from "./carouselDefault.json";
import { Poster, posterSchema, type PosterProps } from "./compositions/Poster";
import posterDefault from "./posterDefault.json";
import { reelSchema, type Reel } from "./types";
import { canvas } from "./brand/theme";
import defaultProps from "./defaultProps.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="Poster"
      component={Poster}
      schema={posterSchema}
      defaultProps={posterDefault as unknown as PosterProps}
      width={1080}
      height={1350}
      fps={1}
      durationInFrames={1}
    />
    <Composition
      id="Carousel"
      component={Carousel}
      schema={carouselSchema}
      defaultProps={carouselDefault as unknown as CarouselProps}
      width={1080}
      height={1350}
      fps={1}
      durationInFrames={3}
      calculateMetadata={({ props }) => ({ durationInFrames: props.lines.length + 1 })}
    />
    <Composition
      id="Showcase"
      component={Showcase}
      schema={showcaseSchema}
      defaultProps={showcaseDefault as unknown as ShowcaseProps}
      width={canvas.width}
      height={canvas.height}
      fps={canvas.fps}
      durationInFrames={600}
      calculateMetadata={({ props }) => ({ durationInFrames: showcaseTotal(props.scenes) })}
    />
    <Composition
      id="BoxDrop"
      component={BoxDrop}
      schema={boxDropSchema}
      defaultProps={boxDropSchema.parse({}) as BoxDropProps}
      width={canvas.width}
      height={canvas.height}
      fps={canvas.fps}
      durationInFrames={boxDropTotal()}
    />
    <Composition
      id="SmmReel"
      component={SmmReel}
      schema={smmReelSchema}
      defaultProps={smmReelDefault as unknown as SmmReelProps}
      width={canvas.width}
      height={canvas.height}
      fps={canvas.fps}
      durationInFrames={600}
      calculateMetadata={({ props }) => ({ durationInFrames: smmReelTotal(props) })}
    />
    <Composition
      id="Motion"
      component={Motion}
      schema={motionSchema}
      defaultProps={motionDefault as unknown as MotionProps}
      width={canvas.width}
      height={canvas.height}
      fps={canvas.fps}
      durationInFrames={600}
      calculateMetadata={({ props }) => ({ durationInFrames: motionTotal(props.scenes) })}
    />
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
