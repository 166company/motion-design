import { Composition } from "remotion";
import { TipList, totalDuration } from "./compositions/TipList";
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
        durationInFrames: totalDuration(props.scenes),
      })}
    />
  );
};
