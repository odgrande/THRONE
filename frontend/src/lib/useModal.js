import { useEffect, useRef } from 'react';

// Opens a native <dialog> as a modal exactly once on mount and calls onClose
// when it closes (Esc, backdrop, or dialog.close()). onClose is read through
// a ref, so parents that re-render (the countdowns tick 4x a second) never
// re-run this setup.
export function useModal(onClose) {
  const dialog = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = dialog.current;
    const handle = () => onCloseRef.current();
    el.addEventListener('close', handle);
    if (!el.open) el.showModal();
    return () => el.removeEventListener('close', handle);
  }, []);

  return dialog;
}
