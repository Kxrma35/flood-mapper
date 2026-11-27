// PlaceInput.jsx
// A place box with suggestions from /api/places. Picking a suggestion fixes the exact point,
// so the route never depends on guessing which "Buruburu" was meant.

import { useEffect, useId, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;
const KIND_LABEL = { area: 'Area', place: 'Place', street: 'Street', address: 'Address' };

export default function PlaceInput({ value, onChange, onSubmit, label, placeholder, icon, iconColor, children }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const latest = useRef(0);
  const listId = useId();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function load(query) {
    const request = ++latest.current;
    try {
      const res = await fetch(`${API}/api/places?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(15000) });
      const body = await res.json().catch(() => ({}));
      if (request !== latest.current) return;
      if (!res.ok) throw new Error(body.error || 'Place search failed.');
      setSuggestions(body);
      setError(body.length ? null : 'No matching places in the Nairobi area.');
      setActive(-1);
      setOpen(true);
    } catch (err) {
      if (request !== latest.current) return;
      setSuggestions([]);
      setError(err.message);
      setOpen(true);
    }
  }

  function handleType(text) {
    onChange({ text, place: null });
    clearTimeout(timer.current);
    latest.current++;
    const query = text.trim();
    if (query.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => load(query), DEBOUNCE_MS);
  }

  function pick(place) {
    onChange({ text: place.label, place });
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (open && suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1)); return; }
      if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]); return; }
    }
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Enter') onSubmit?.();
  }

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <div style={st.inputBox}>
        <i className={`ti ${icon}`} style={{ fontSize: 15, color: iconColor, flexShrink: 0 }} aria-hidden="true" />
        <input
          value={value.text}
          aria-label={label}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          style={st.textInput}
          onChange={e => handleType(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setOpen(false)}
        />
        {value.place && <i className="ti ti-circle-check" style={{ fontSize: 14, color: '#1D9E75', flexShrink: 0 }} title="Exact place chosen" aria-label="Exact place chosen" />}
        {children}
      </div>

      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} style={st.list}>
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(s)}
              style={{ ...st.item, ...(i === active ? st.itemActive : {}) }}>
              <span style={{ color: '#e8e8e8' }}>{s.label}</span>
              <span style={st.kind}>{KIND_LABEL[s.kind] ?? ''}</span>
            </li>
          ))}
          {error && <li style={{ ...st.item, color: '#888', cursor: 'default' }}>{error}</li>}
        </ul>
      )}
    </div>
  );
}

const st = {
  inputBox: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 },
  textInput: { background: 'none', border: 'none', outline: 'none', color: '#e8e8e8', fontSize: 13, width: '100%', fontFamily: 'inherit' },
  list: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1100, margin: '4px 0 0', padding: 4, listStyle: 'none', background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.5)' },
  item: { padding: '7px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 },
  itemActive: { background: '#1D9E7520' },
  kind: { fontSize: 10, color: '#666', flexShrink: 0 },
};
