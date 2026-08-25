"use client";

import { Fragment, memo, useEffect, useId, useRef, useState } from "react";
import { clamp } from "../../lib/planner";

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  size?: "normal" | "large";
  info?: React.ReactNode;
};

/**
 * Numeric input that lets the user clear and retype freely. The committed value is
 * only clamped on blur, so typing "5" on the way to "50" never snaps to the minimum.
 */
export const NumberField = memo(function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max = 10_000_000,
  step = 1,
  hint,
  size = "normal",
  info,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [lastValue, setLastValue] = useState(value);

  // Adopt outside changes (reset, import, linked fields) while the field is not being typed in.
  if (value !== lastValue) {
    setLastValue(value);
    if (!editing) setDraft(String(value));
  }

  return (
    <label className={`field ${size === "large" ? "field-large" : ""}`}>
      <span className="field-label">{label}{info}</span>
      <span className="field-shell">
        {prefix ? <span className="field-affix">{prefix}</span> : null}
        <input
          aria-label={label}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft}
          onFocus={() => setEditing(true)}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setDraft(next);
            const parsed = Number(next);
            if (next !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(parsed);
          }}
          onBlur={() => {
            setEditing(false);
            const parsed = Number(draft);
            const committed = draft === "" || !Number.isFinite(parsed) ? value : clamp(parsed, min, max);
            setDraft(String(committed));
            if (committed !== value) onChange(committed);
          }}
        />
        {suffix ? <span className="field-affix">{suffix}</span> : null}
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
});

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-shell"><input aria-label={label} type="text" value={value} onChange={(event) => onChange(event.currentTarget.value)} /></span>
    </label>
  );
}

export function Switch<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; note?: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="switch" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className={option.value === value ? "on" : ""} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          <span>{option.label}</span>
          {option.note ? <small>{option.note}</small> : null}
        </button>
      ))}
    </div>
  );
}

export type ListboxOption = { value: string; label: string; group?: string; note?: string };

/**
 * A select whose open list is our own element, so it can be styled like the rest of the UI.
 * Keyboard: arrows move, Enter/Space choose, Escape closes, typing jumps to a match.
 */
export function SelectField({ label, value, options, onChange, hint }: { label: string; value: string; options: ListboxOption[]; onChange: (value: string) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const selected = options.find((option) => option.value === value);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((current) => Math.min(options.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else setOpen(true);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Home" && open) { event.preventDefault(); setActive(0); }
    else if (event.key === "End" && open) { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const now = Date.now();
      typeahead.current = { text: (now - typeahead.current.at < 700 ? typeahead.current.text : "") + event.key.toLowerCase(), at: now };
      const match = options.findIndex((option) => option.label.toLowerCase().startsWith(typeahead.current.text));
      if (match >= 0) { setActive(match); if (!open) onChange(options[match]!.value); }
    }
  };

  const withHeaders = options.map((option, index) => ({ option, index, header: option.group !== undefined && option.group !== options[index - 1]?.group ? option.group : undefined }));
  return (
    <div className="field listbox" ref={rootRef}>
      <span className="field-label" id={`${id}-label`}>{label}</span>
      <button type="button" className={`field-shell listbox-button ${open ? "open" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`} onClick={() => { setActive(Math.max(0, options.findIndex((option) => option.value === value))); setOpen(!open); }} onKeyDown={onKeyDown}>
        <span id={`${id}-value`}>{selected?.label ?? "—"}</span>
        <svg aria-hidden="true" viewBox="0 0 14 14" width="14" height="14"><path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" /></svg>
      </button>
      {open ? (
        <ul className="listbox-list" role="listbox" aria-labelledby={`${id}-label`} ref={listRef} tabIndex={-1}>
          {withHeaders.map(({ option, index, header }) => {
            return (
              <Fragment key={option.value}>
                {header ? <li className="listbox-group" role="presentation">{header}</li> : null}
                <li role="option" data-index={index} aria-selected={option.value === value} className={`${index === active ? "active" : ""} ${option.value === value ? "selected" : ""}`} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
                  <span>{option.label}</span>
                  {option.note ? <small>{option.note}</small> : null}
                </li>
              </Fragment>
            );
          })}
        </ul>
      ) : null}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
