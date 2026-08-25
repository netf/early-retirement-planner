"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A small (i) that explains a section in plain language, with an example. Opens on hover or
 * focus, toggles on click for touch screens, closes on Escape or an outside click.
 */
export function Info({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!pinned) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) { setPinned(false); setOpen(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pinned]);

  const visible = open || pinned;
  return (
    <span className="info" ref={rootRef} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`info-icon ${visible ? "on" : ""}`}
        aria-label={`What does “${title}” mean?`}
        aria-expanded={visible}
        aria-describedby={visible ? id : undefined}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setOpen(false); } }}
      >i</button>
      {visible ? (
        <span className="info-pop" role="tooltip" id={id}>
          <strong>{title}</strong>
          {children}
        </span>
      ) : null}
    </span>
  );
}
