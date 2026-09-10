import { Composition } from "remotion";
import { TipList } from "./compositions/TipList";
import { reelSchema, type Reel } from "./types";
import { canvas } from "./brand/theme";
import defaultProps from "./defaultProps.json";

export const RemotionRoot: React.FC = () => {
  return (
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
        durationInFrames: props.scenes.reduce(
          (sum, s) => sum + s.durationInFrames,
          0
        ),
      })}
    />
  );
};
