import { useEffect, useRef } from 'react';
import { reducedMotion } from '../lib/motion.js';

// The picture or video of an ad. Videos play muted on a loop (browsers only
// autoplay muted video); the poster (first frame) shows while it loads.
// Visitors who asked for reduced motion get the poster and a play button.
export default function AdMedia({ ad, className = 'h-full w-full object-contain' }) {
  const video = useRef(null);
  const still = reducedMotion();

  // React sets `muted` as a property, not the HTML attribute, and some
  // browsers then refuse to autoplay. Mute and start playback explicitly.
  useEffect(() => {
    const el = video.current;
    if (!el || still) return;
    el.muted = true;
    el.defaultMuted = true;
    el.play().catch(() => {
      // Autoplay blocked (e.g. battery saver): the poster stays, which is fine.
    });
  }, [ad.videoUrl, still]);

  if (ad.videoUrl) {
    return (
      <video
        ref={video}
        src={ad.videoUrl}
        poster={ad.imageUrl ?? undefined}
        className={className}
        autoPlay={!still}
        controls={still}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={ad.tagline || ad.name}
      />
    );
  }
  if (ad.imageUrl) return <img src={ad.imageUrl} alt={ad.tagline || ad.name} className={className} />;
  return null;
}
