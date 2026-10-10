import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'throne.theme';
const isDark = () => document.documentElement.classList.contains('dark');

// Light/dark switch. The first visit follows the device setting (public/theme.js);
// a click saves an explicit choice.
export default function ThemeToggle() {
  const [dark, setDark] = useState(isDark);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      // Not remembered, but still applied for this page view.
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="btn-outline btn-sm"
    >
      {dark ? <Sun className="h-4 w-4" strokeWidth={3} /> : <Moon className="h-4 w-4" strokeWidth={3} />}
    </button>
  );
}
