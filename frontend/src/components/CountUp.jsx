import { useRef } from 'react';
import { gsap, reducedMotion, useGSAP } from '../lib/motion.js';

// Animates a number from its previous value to the new one. Reduced-motion
// visitors (and the very first render on the server-free path) just see it.
export default function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), className = '' }) {
  const el = useRef(null);
  const shown = useRef(0);

  useGSAP(
    () => {
      if (reducedMotion()) {
        el.current.textContent = format(value);
        shown.current = value;
        return;
      }
      const counter = { n: shown.current };
      gsap.to(counter, {
        n: value,
        duration: Math.min(1.6, 0.4 + Math.abs(value - shown.current) / 500),
        ease: 'power2.out',
        onUpdate: () => {
          el.current.textContent = format(counter.n);
        },
        onComplete: () => {
          shown.current = value;
        },
      });
    },
    { dependencies: [value] },
  );

  return (
    <span ref={el} className={`tabular-nums ${className}`}>
      {format(value)}
    </span>
  );
}
