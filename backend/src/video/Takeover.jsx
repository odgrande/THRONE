import { AbsoluteFill, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Outfit';

// Same tokens as the site (frontend/tailwind.config.js).
const C = { ink: '#121212', canvas: '#F0F0F0', red: '#D02020', blue: '#1040C0', yellow: '#F0C020', white: '#FFFFFF' };
const { fontFamily } = loadFont('normal', { weights: ['700', '900'], subsets: ['latin'] });

// Prices in the ad's own currency ($ or ₦). Whole naira read better on video.
let currentFormat = { currency: 'USD', locale: 'en-US' };
const money = (cents) =>
  new Intl.NumberFormat(currentFormat.locale, {
    style: 'currency',
    currency: currentFormat.currency,
    maximumFractionDigits: currentFormat.currency === 'NGN' ? 0 : 2,
  }).format(cents / 100);
const display = { fontFamily, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.04em', lineHeight: 0.9 };
const label = { fontFamily, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 34 };
const box = (bg) => ({ background: bg, border: `10px solid ${C.ink}`, boxShadow: `20px 20px 0 0 ${C.ink}` });

// Mechanical "slam": drops in and settles with almost no bounce.
function useSlam(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 300, mass: 0.6 } });
}

function Circle({ size, color, style }) {
  return <div style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', background: color, border: `10px solid ${C.ink}`, ...style }} />;
}

function Square({ size, color, rotate = 0, style }) {
  return <div style={{ position: 'absolute', width: size, height: size, background: color, border: `10px solid ${C.ink}`, transform: `rotate(${rotate}deg)`, ...style }} />;
}

// Scene 1 (0-2s): red poster, "THE THRONE HAS FALLEN", the old king crossed out.
function Fallen({ previousName }) {
  const frame = useCurrentFrame();
  const head = useSlam(4);
  const strike = interpolate(frame, [30, 42], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.red, padding: 90, justifyContent: 'center' }}>
      <Circle size={700} color={C.yellow} style={{ right: -260, top: -240, transform: `scale(${head})` }} />
      <Square size={420} color={C.blue} rotate={45 + frame * 0.6} style={{ left: -160, bottom: -140 }} />
      <div style={{ ...label, color: C.white, opacity: head }}>Breaking</div>
      <div style={{ ...display, color: C.white, fontSize: 210, marginTop: 30, transform: `translateY(${(1 - head) * -220}px)` }}>
        The throne
        <br />
        has fallen
      </div>
      {previousName && (
        <div style={{ ...box(C.white), marginTop: 80, padding: '30px 40px', alignSelf: 'flex-start', position: 'relative', opacity: head }}>
          <div style={{ ...display, fontSize: 90, color: C.ink }}>{previousName}</div>
          <div style={{ position: 'absolute', left: 20, top: '50%', height: 16, width: `calc(${strike}% - 40px)`, background: C.red }} />
        </div>
      )}
    </AbsoluteFill>
  );
}

// Scene 2 (2-4s): blue panel, the new king and their ad.
function NewKing({ name, tagline, imageUrl }) {
  const enter = useSlam(0);
  const card = useSlam(8);
  return (
    <AbsoluteFill style={{ background: C.blue, padding: 90, justifyContent: 'center', transform: `translateX(${(1 - enter) * 1080}px)` }}>
      <Circle size={360} color={C.red} style={{ right: -140, bottom: -140 }} />
      <div style={{ ...label, color: C.yellow }}>All hail the new king</div>
      <div style={{ ...display, color: C.white, fontSize: name.length > 14 ? 130 : 170, marginTop: 30 }}>{name}</div>
      <div style={{ ...box(C.ink), marginTop: 70, aspectRatio: '16 / 9', overflow: 'hidden', transform: `scale(${0.85 + card * 0.15})`, opacity: card }}>
        {imageUrl ? (
          <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <AbsoluteFill style={{ background: C.red, justifyContent: 'center', alignItems: 'center', padding: 50 }}>
            <div style={{ ...display, color: C.white, fontSize: 80, textAlign: 'center' }}>{tagline || name}</div>
          </AbsoluteFill>
        )}
      </div>
      {imageUrl && tagline && (
        <div style={{ fontFamily, fontWeight: 700, color: C.white, fontSize: 52, marginTop: 50, lineHeight: 1.2 }}>{tagline}</div>
      )}
    </AbsoluteFill>
  );
}

// Scene 3 (4-6s): yellow price slam + call to action.
function Price({ amountCents, previousAmountCents, siteLabel }) {
  const frame = useCurrentFrame();
  const price = useSlam(2);
  const cta = useSlam(20);
  return (
    <AbsoluteFill style={{ background: C.yellow, padding: 90, justifyContent: 'center' }}>
      <Square size={300} color={C.red} rotate={frame * 1.5} style={{ right: -60, top: 120 }} />
      <Circle size={260} color={C.blue} style={{ left: -90, bottom: -60 }} />
      <div style={{ ...label, color: C.ink }}>Paid</div>
      {/* Shrink long prices ($625.00, $1250.00) so they never run off the frame. */}
      <div
        style={{
          ...display,
          color: C.ink,
          fontSize: money(amountCents).length <= 6 ? 300 : money(amountCents).length === 7 ? 240 : 190,
          marginTop: 20,
          transform: `scale(${0.6 + price * 0.4})`,
          transformOrigin: 'left center',
        }}
      >
        {money(amountCents)}
      </div>
      {previousAmountCents && (
        <div style={{ ...label, color: C.ink, marginTop: 30, opacity: price }}>Up from {money(previousAmountCents)}</div>
      )}
      <div style={{ ...box(C.ink), marginTop: 110, padding: '50px 60px', opacity: cta, transform: `translateY(${(1 - cta) * 120}px)` }}>
        <div style={{ ...display, color: C.white, fontSize: 120 }}>Who's next?</div>
        <div style={{ ...label, color: C.yellow, marginTop: 30, letterSpacing: '0.1em', fontSize: 44 }}>{siteLabel}</div>
      </div>
    </AbsoluteFill>
  );
}

export function Takeover(props) {
  currentFormat = { currency: props.currency ?? 'USD', locale: props.locale ?? 'en-US' };
  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      <Sequence durationInFrames={60}>
        <Fallen previousName={props.previousName} />
      </Sequence>
      <Sequence from={60} durationInFrames={60}>
        <NewKing name={props.name} tagline={props.tagline} imageUrl={props.imageUrl} />
      </Sequence>
      <Sequence from={120} durationInFrames={60}>
        <Price amountCents={props.amountCents} previousAmountCents={props.previousAmountCents} siteLabel={props.siteLabel} />
      </Sequence>
    </AbsoluteFill>
  );
}
