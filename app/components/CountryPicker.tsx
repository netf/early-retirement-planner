"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PROFILES, PROFILE_IDS, type ProfileId } from "../../lib/planner";

/**
 * Which country's rules the plan runs on. A searchable dropdown rather than a row of buttons, so
 * adding a jurisdiction is one entry in PROFILES and nothing else.
 */
export function CountryPicker({ value, onChange, compact = false }: { value: ProfileId; onChange: (id: ProfileId) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const current = PROFILES[value];
  const needle = query.trim().toLowerCase();
  const matches = PROFILE_IDS.filter((profileId) => {
    const profile = PROFILES[profileId];
    return needle === "" || [profile.label, profile.shortLabel, profileId, profile.taxYear].some((text) => text.toLowerCase().includes(needle));
  });

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const show = () => { setQuery(""); setActive(Math.max(0, PROFILE_IDS.indexOf(value))); setOpen(true); };
  const choose = (profileId: ProfileId | undefined) => { if (!profileId) return; setOpen(false); if (profileId !== value) onChange(profileId); };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.min(matches.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))); }
    else if (event.key === "Enter") { event.preventDefault(); choose(matches[active]); }
    else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
  };

  return (
    <div className={`country-picker ${compact ? "compact" : ""}`} ref={rootRef}>
      <button type="button" className={`field-shell listbox-button ${open ? "open" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={`Country: ${current.label}`} onClick={() => open ? setOpen(false) : show()} onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); show(); } }}>
        <span className="country-code" aria-hidden="true">{current.shortLabel}</span>
        <span className="country-name">{current.label}{compact ? null : <small> · tax {current.taxYear}</small>}</span>
        <svg aria-hidden="true" viewBox="0 0 14 14" width="14" height="14"><path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" /></svg>
      </button>
      {open ? (
        <div className="listbox-list country-list" onKeyDown={onKeyDown}>
          <input ref={searchRef} className="country-search" type="search" placeholder="Search countries" value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={matches[active] ? `${id}-${matches[active]}` : undefined} />
          <ul id={`${id}-list`} role="listbox" aria-label="Countries">
            {matches.length === 0 ? <li className="country-empty">No country matches “{query}”. Want one added? Say so on the About page.</li> : null}
            {matches.map((profileId, index) => {
              const profile = PROFILES[profileId];
              return (
                <li key={profileId} id={`${id}-${profileId}`} role="option" aria-selected={profileId === value} className={`${index === active ? "active" : ""} ${profileId === value ? "selected" : ""}`} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(profileId)}>
                  <span><span className="country-code" aria-hidden="true">{profile.shortLabel}</span>{profile.label}</span>
                  <small>tax {profile.taxYear}</small>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
