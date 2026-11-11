import { useEffect, useRef, type ReactNode } from 'react';
import { Close } from '@carbon/icons-react';

/** Bottom sheet inside the phone. Escape and the close button dismiss it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-[var(--z-sheet)] flex flex-col justify-end">
      <button type="button" aria-label="Close" className="anim-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-rise relative max-h-[88%] overflow-y-auto rounded-t-[8px] bg-surface shadow-sheet outline-none"
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <h2 className="t-section">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid size-12 place-items-center rounded-[6px] text-muted hover:bg-sunken">
            <Close size={24} />
          </button>
        </div>
        <div className="p-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

/** Downscale a photo so it fits in the shared log. */
export function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 720 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.72));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
