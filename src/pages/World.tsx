import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { Badge, Empty, Field } from "../components/ui";
import { WorldMap } from "../components/WorldMap";
import { CONTINENTS, COUNTRIES, STATES, countryInfo, countryName, countryStates, type CountryState } from "../lib/countries";
import { TRIP_STATUS, newCountryNote, today } from "../lib/defaults";
import { dateRange, num } from "../lib/format";
import { useStore } from "../lib/store";
import type { CountryNote } from "../lib/types";

export default function World({ nav }: { nav: Nav }) {
  const store = useStore();
  const [selected, setSelected] = useState("");
  const states = useMemo(() => countryStates(store.trips, store.countries, today()), [store.trips, store.countries]);
  const st = (code: string): CountryState => states.get(code) ?? { code, status: "none", favorite: false, trips: [], manual: false, firstYear: "" };

  const visitedStates = STATES.filter((c) => st(c.code).status === "visited");
  const visitedAll = COUNTRIES.filter((c) => st(c.code).status === "visited");
  const planned = COUNTRIES.filter((c) => st(c.code).status === "planned");
  const favorites = COUNTRIES.filter((c) => st(c.code).favorite);
  const continentsVisited = CONTINENTS.filter((k) => visitedStates.some((c) => c.continent === k));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Weltkarte</h1>
      </div>

      <section className="stats four">
        <div className="stat">
          <div className="stat-label">Länder bereist</div>
          <div className="stat-value">
            {visitedStates.length} <span className="stat-of">von {STATES.length}</span>
          </div>
          <div className="stat-sub">
            {num((visitedStates.length / STATES.length) * 100, 0)} % der Staaten
            {visitedAll.length > visitedStates.length && ` · dazu ${visitedAll.length - visitedStates.length} Gebiet(e)`}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Kontinente</div>
          <div className="stat-value">
            {continentsVisited.length} <span className="stat-of">von {CONTINENTS.length}</span>
          </div>
          <div className="stat-sub ellipsis">{continentsVisited.join(", ") || "–"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Geplant</div>
          <div className="stat-value">{planned.length}</div>
          <div className="stat-sub ellipsis">{planned.map((c) => c.name).join(", ") || "keine neuen Länder geplant"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Favoriten</div>
          <div className="stat-value">{favorites.length}</div>
          <div className="stat-sub ellipsis">{favorites.map((c) => c.name).join(", ") || "mit ★ markieren"}</div>
        </div>
      </section>

      <div className="split wide-side">
        <section className="card flush map-card">
          <WorldMap states={states} selected={selected} onSelect={setSelected} />
          <div className="map-legend">
            <span>
              <i className="lg visited" /> bereist
            </span>
            <span>
              <i className="lg planned" /> geplant
            </span>
            <span>
              <i className="lg favorite" /> Favorit
            </span>
            <span className="muted small">Mausrad oder +/− zum Zoomen, Ziehen zum Verschieben, Klick auf ein Land für Details</span>
          </div>
        </section>
        <aside className="side-col">{selected ? <CountryPanel code={selected} state={st(selected)} nav={nav} /> : <ContinentProgress states={states} onPick={setSelected} />}</aside>
      </div>

      <div className="two-col">
        <VisitedList states={states} onPick={setSelected} />
        <OpenList states={states} onPick={setSelected} />
      </div>
    </div>
  );
}

function useNote(code: string) {
  const store = useStore();
  const note = store.countries.find((n) => n.id === code);
  const set = (patch: Partial<CountryNote>) => store.save("countries", { ...(note ?? newCountryNote(code)), ...patch });
  return [note ?? newCountryNote(code), set] as const;
}

function Star({ code, state }: { code: string; state: CountryState }) {
  const [, set] = useNote(code);
  return (
    <button
      className={`star ${state.favorite ? "on" : ""}`}
      title={state.favorite ? "Von der Wunschliste nehmen" : "Auf die Wunschliste"}
      aria-label="Favorit"
      onClick={(e) => {
        e.stopPropagation();
        set({ favorite: !state.favorite });
      }}
    >
      {state.favorite ? "★" : "☆"}
    </button>
  );
}

function CountryPanel({ code, state, nav }: { code: string; state: CountryState; nav: Nav }) {
  const [note, set] = useNote(code);
  const info = countryInfo(code);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{countryName(code)}</h2>
        <Star code={code} state={state} />
      </div>
      <p className="muted small">
        {info?.continent}
        {info && !info.sovereign && " · abhängiges Gebiet"}
        {state.status === "visited" && (
          <>
            {" · "}
            <Badge color="green">bereist{state.firstYear ? ` seit ${state.firstYear}` : ""}</Badge>
          </>
        )}
        {state.status === "planned" && (
          <>
            {" · "}
            <Badge color="blue">geplant</Badge>
          </>
        )}
      </p>
      <h3>Reisen</h3>
      {state.trips.length === 0 ? (
        <p className="muted small">Noch keine Reise in der App.</p>
      ) : (
        <ul className="plain country-trips">
          {state.trips.map((t) => (
            <li key={t.id}>
              <button className="link" onClick={() => nav({ page: "trip", id: t.id })}>
                {t.emoji} {t.name}
              </button>
              <span className="muted small">
                {" "}
                {dateRange(t.startDate, t.endDate)} · {TRIP_STATUS[t.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className="check">
        <input type="checkbox" checked={note.visited} onChange={(e) => set({ visited: e.target.checked })} />
        Schon dort gewesen (auch ohne Reise in der App)
      </label>
      {note.visited && (
        <Field label="Jahr des ersten Besuchs">
          <input value={note.visitedYear} inputMode="numeric" maxLength={4} placeholder="z. B. 2015" onChange={(e) => set({ visitedYear: e.target.value.replace(/\D/g, "") })} />
        </Field>
      )}
      <Field label="Notizen">
        <textarea rows={3} value={note.notes} placeholder="Ideen, Reisezeit, Tipps …" onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </section>
  );
}

function ContinentProgress({ states, onPick }: { states: Map<string, CountryState>; onPick: (code: string) => void }) {
  return (
    <section className="card">
      <h2>Nach Kontinent</h2>
      <ul className="plain continent-progress">
        {CONTINENTS.map((k) => {
          const all = STATES.filter((c) => c.continent === k);
          const done = all.filter((c) => states.get(c.code)?.status === "visited");
          return (
            <li key={k}>
              <div className="row between">
                <span>{k}</span>
                <span className="muted small">
                  {done.length} von {all.length}
                </span>
              </div>
              <div className="progress">
                <div style={{ width: `${(done.length / all.length) * 100}%` }} />
              </div>
              {done.length > 0 && (
                <div className="small chips">
                  {done.map((c) => (
                    <button key={c.code} className="link small" onClick={() => onPick(c.code)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">Gezählt werden 197 Staaten (UN-Mitglieder sowie Vatikan, Palästina, Kosovo und Taiwan).</p>
    </section>
  );
}

function VisitedList({ states, onPick }: { states: Map<string, CountryState>; onPick: (code: string) => void }) {
  const list = COUNTRIES.filter((c) => states.get(c.code)?.status === "visited").sort((a, b) => a.name.localeCompare(b.name, "de"));
  return (
    <section className="card">
      <h2>
        Bereiste Länder <span className="muted small">{list.length}</span>
      </h2>
      {list.length === 0 ? (
        <Empty>Länder kommen aus deinen Reisen. Frühere Reisen: Land auf der Karte anklicken und „Schon dort gewesen“ wählen.</Empty>
      ) : (
        <table className="list compact">
          <tbody>
            {list.map((c) => {
              const s = states.get(c.code)!;
              return (
                <tr key={c.code} onClick={() => onPick(c.code)}>
                  <td>{c.name}</td>
                  <td className="muted small">{c.continent}</td>
                  <td className="muted small">{s.firstYear || ""}</td>
                  <td className="r muted small">{s.trips.length ? `${s.trips.length} Reise(n)` : "ohne Reise"}</td>
                  <td className="w-act">
                    <Star code={c.code} state={s} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function OpenList({ states, onPick }: { states: Map<string, CountryState>; onPick: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const open = STATES.filter((c) => states.get(c.code)?.status !== "visited");
  const list = open
    .filter((c) => (!continent || c.continent === continent) && (!onlyFav || states.get(c.code)?.favorite) && (!q || c.name.toLowerCase().includes(q.toLowerCase())))
    // Favoriten zuerst
    .sort((a, b) => Number(!!states.get(b.code)?.favorite) - Number(!!states.get(a.code)?.favorite) || a.name.localeCompare(b.name, "de"));
  const none: CountryState = { code: "", status: "none", favorite: false, trips: [], manual: false, firstYear: "" };
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          Offene Länder <span className="muted small">{open.length}</span>
        </h2>
        <div className="row">
          <input className="search" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={continent} onChange={(e) => setContinent(e.target.value)}>
            <option value="">Alle Kontinente</option>
            {CONTINENTS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <label className="check small">
            <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
            nur ★
          </label>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="muted">{onlyFav ? "Noch keine Favoriten – mit ☆ markieren." : "Keine Länder für diesen Filter."}</p>
      ) : (
        <table className="list compact open-list">
          <tbody>
            {list.map((c) => {
              const s = states.get(c.code) ?? { ...none, code: c.code };
              return (
                <tr key={c.code} onClick={() => onPick(c.code)}>
                  <td className="w-act">
                    <Star code={c.code} state={s} />
                  </td>
                  <td>{c.name}</td>
                  <td className="muted small">{c.continent}</td>
                  <td className="r">{s.status === "planned" && <Badge color="blue">geplant</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
