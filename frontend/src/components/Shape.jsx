// The Bauhaus alphabet: every decoration is a circle, a square or a triangle.
const KIND = {
  circle: 'rounded-full',
  square: 'rounded-none',
  triangle: 'triangle',
};

const COLOR = {
  red: 'bg-bh-red',
  blue: 'bg-bh-blue',
  yellow: 'bg-bh-yellow',
  ink: 'bg-ink',
  white: 'bg-white',
};

export default function Shape({ kind = 'square', color = 'red', className = '' }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 ${KIND[kind]} ${COLOR[color]} ${className}`} />;
}

// Small corner mark for cards, cycling shapes and colors by index.
const CORNERS = [
  ['circle', 'red'],
  ['square', 'blue'],
  ['triangle', 'yellow'],
];

export function CornerMark({ index = 0 }) {
  const [kind, color] = CORNERS[index % CORNERS.length];
  return <Shape kind={kind} color={color} className="absolute right-3 top-3 h-3 w-3" />;
}
