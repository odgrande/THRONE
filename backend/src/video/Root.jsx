import { Composition } from 'remotion';
import { Takeover } from './Takeover.jsx';

export const COMPOSITION_ID = 'ThroneTakeover';

// 6 seconds, vertical 9:16 for TikTok / Reels / Shorts.
export function Root() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={Takeover}
      durationInFrames={180}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        name: 'Nova Coffee',
        tagline: 'Fuel for builders. 20% off this week.',
        imageUrl: null,
        amountCents: 2500,
        previousName: 'Meme Lord 9000',
        previousAmountCents: 2000,
        siteLabel: 'throne.example',
      }}
    />
  );
}
