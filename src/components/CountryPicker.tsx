import { useState } from "react";
import { COUNTRIES, countryName, findCountryCode } from "../lib/countries";

/** Mehrere Länder auswählen: Chips mit ×, darunter ein Suchfeld mit Vorschlägen (deutsche Namen) */
export function CountryPicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const add = (raw: string) => {
    const code = findCountryCode(raw);
    if (!code) {
      if (raw.trim()) setHint(`„${raw.trim()}“ nicht gefunden – bitte aus der Liste wählen.`);
      return;
    }
    if (!value.includes(code)) onChange([...value, code]);
    setText("");
    setHint("");
  };
  return (
    <div className="country-picker">
      {value.length > 0 && (
        <div className="chips">
          {value.map((c) => (
            <span key={c} className="chip country-chip">
              {countryName(c)}
              <button type="button" className="icon" aria-label={`${countryName(c)} entfernen`} onClick={() => onChange(value.filter((x) => x !== c))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={text}
        list="all-countries"
        placeholder={value.length ? "+ weiteres Land" : "Land suchen, z. B. Portugal"}
        onChange={(e) => {
          setText(e.target.value);
          setHint("");
          // Auswahl aus der Vorschlagsliste sofort übernehmen
          if (COUNTRIES.some((c) => c.name === e.target.value)) add(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => text && add(text)}
      />
      {hint && <span className="hint error-text">{hint}</span>}
      <CountryDatalist />
    </div>
  );
}

/** Ein Land wählen, die Länder der Reise zuerst */
export function CountrySelect({ value, onChange, first = [] }: { value: string; onChange: (code: string) => void; first?: string[] }) {
  const firstSet = new Set(first);
  const known = COUNTRIES.some((c) => c.code === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">–</option>
      {value && !known && <option value={value}>{value}</option>}
      {first.length > 0 && (
        <optgroup label="Länder der Reise">
          {first.map((c) => (
            <option key={c} value={c}>
              {countryName(c)}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Alle Länder">
        {COUNTRIES.filter((c) => !firstSet.has(c.code)).map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** Vorschlagsliste aller Länder für das Suchfeld */
function CountryDatalist() {
  return (
    <datalist id="all-countries">
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.name} />
      ))}
    </datalist>
  );
}
