import Shape from './Shape.jsx';

// onYellow: the yellow triangle would vanish on a yellow background, so it turns black.
export default function Logo({ inverted = false, onYellow = false }) {
  return (
    <a
      href="/"
      className="group flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
      aria-label="Project Throne home"
    >
      <span className="flex items-end gap-1 transition duration-200 ease-out group-hover:scale-110">
        <Shape kind="circle" color="red" className="h-5 w-5 border-2 border-ink" />
        <Shape kind="square" color="blue" className="h-5 w-5 border-2 border-ink" />
        <Shape kind="triangle" color={onYellow ? 'ink' : 'yellow'} className="h-5 w-6" />
      </span>
      <span className={`text-xl font-black uppercase tracking-tighter ${inverted ? 'text-white' : 'text-ink'}`}>
        Throne
      </span>
    </a>
  );
}
