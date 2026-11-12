import { useState } from "react";
import { BarList, Legend, StackedColumns } from "../../components/charts";
import { PersonDot } from "../../components/common";
import { Empty } from "../../components/ui";
import { dailyByPerson, tripStats } from "../../lib/calc";
import { countryName } from "../../lib/countries";
import { CATEGORIES } from "../../lib/defaults";
import { exportDailyCsv, exportExpensesCsv, exportPdf } from "../../lib/export";
import { dayLabel, money, moneyShort, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { ExpenseCategory, Trip } from "../../lib/types";

const SLOTS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"];

/** Die fünf größten Gruppen einzeln (feste Farbreihenfolge nach Größe), der Rest zusammengefasst */
export function topSeries<K extends string>(entries: { key: K; amount: number }[], label: (k: K) => string) {
  const sorted = entries.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, SLOTS.length).map((c) => c.key);
  const rest = sorted.length > top.length;
  const series = [...top.map((k, i) => ({ name: label(k), color: SLOTS[i] })), ...(rest ? [{ name: "Übrige", color: "var(--viz-other)" }] : [])];
  const values = (by: Partial<Record<K, number>>) => {
    const v = top.map((k) => by[k] ?? 0);
    if (rest) v.push(Object.entries(by).reduce<number>((a, [k, x]) => a + (top.includes(k as K) ? 0 : ((x as number) ?? 0)), 0));
    return v;
  };
  return { series, values };
}

/** Tagesverlauf bzw. Reisen nach Kategorie */
export const categorySeries = (byCategory: { key: ExpenseCategory; amount: number }[]) => topSeries(byCategory, (k) => CATEGORIES[k].label);

const methodLabel = (k: string) => k || "ohne Angabe";

/** Summen je Schlüssel über alle Tage */
function sumDays<K extends string>(maps: Partial<Record<K, number>>[]) {
  const m = new Map<K, number>();
  for (const by of maps) for (const [k, v] of Object.entries(by)) m.set(k as K, (m.get(k as K) ?? 0) + ((v as number) ?? 0));
  return [...m.entries()].map(([key, amount]) => ({ key, amount }));
}

export default function Analysis({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const meIn = sum.shared && trip.travelers.includes(store.me);
  const [mine, setMine] = useState(false);
  const [split, setSplit] = useState<"category" | "method">("category");
  const [perPerson, setPerPerson] = useState(false);
  const st = mine && meIn ? tripStats(trip, sum.expenses, store.me) : sum.stats;
  const group = sum.shared && !(mine && meIn);
  const m = (n: number) => money(n, trip.currency);
  const short = (n: number) => moneyShort(n, trip.currency);

  if (!sum.expenses.length) return <Empty>Noch keine Ausgaben – die Auswertung erscheint, sobald etwas erfasst ist.</Empty>;

  // nur Gruppen, die im Tagesverlauf vorkommen (Flüge sind meist ausgenommen)
  const cat = categorySeries(sumDays(st.daily.map((d) => d.byCategory)));
  const met = topSeries(sumDays(st.daily.map((d) => d.byMethod)), methodLabel);
  const div = group && perPerson ? st.persons : 1;
  const chart = st.daily.map((d, i) => ({
    label: String(i + 1),
    long: `Tag ${i + 1} · ${dayLabel(d.date)}${div > 1 ? " · pro Person" : ""}`,
    values: (split === "category" ? cat.values(d.byCategory) : met.values(d.byMethod)).map((v) => v / div),
  }));
  const series = split === "category" ? cat.series : met.series;
  const people = group ? dailyByPerson(trip, sum.expenses) : [];
  const outside = st.beforeTrip + st.afterTrip;
  const excluded = st.total - st.dailyBase - outside;
  const pct = (n: number) => `${num(st.total ? (n / st.total) * 100 : 0, 0)} %`;

  return (
    <>
      <div className="row between analysis-head">
        {meIn ? (
          <div className="segmented">
            <button className={!mine ? "active" : ""} onClick={() => setMine(false)}>
              Ganze Gruppe
            </button>
            <button className={mine ? "active" : ""} onClick={() => setMine(true)}>
              Mein Anteil
            </button>
          </div>
        ) : (
          <span />
        )}
        <div className="row">
          <button className="ghost small" onClick={() => exportExpensesCsv(trip, sum)}>
            Ausgaben als CSV
          </button>
          <button className="ghost small" onClick={() => exportPdf(trip, sum)}>
            PDF
          </button>
        </div>
      </div>

      <section className="stats four">
        <div className="stat">
          <div className="stat-label">Ausgaben gesamt</div>
          <div className="stat-value">{m(st.total)}</div>
          <div className="stat-sub">{st.count} Ausgaben</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ø pro Tag</div>
          <div className="stat-value">{m(st.perDay)}</div>
          <div className="stat-sub">
            {st.days} Tage{trip.budgetType === "daily" && !mine ? ` · Budget ${m(trip.budget)}` : ""}
          </div>
        </div>
        {group ? (
          <div className="stat">
            <div className="stat-label">Ø pro Person und Tag</div>
            <div className="stat-value">{m(st.perPersonDay)}</div>
            <div className="stat-sub">
              {m(st.total / st.persons)} pro Person gesamt · {st.persons} Personen
            </div>
          </div>
        ) : (
          <div className="stat">
            <div className="stat-label">Ø pro Nacht Unterkunft</div>
            <div className="stat-value">{m((st.byCategory.find((c) => c.key === "stay")?.amount ?? 0) / Math.max(1, st.days - 1))}</div>
            <div className="stat-sub">{Math.max(0, st.days - 1)} Nächte</div>
          </div>
        )}
        <div className="stat">
          <div className="stat-label">{st.budget && !mine ? "Budget übrig" : "nicht im Tagesdurchschnitt"}</div>
          <div className={`stat-value ${st.budget && !mine && st.budget < st.total ? "neg" : ""}`}>{st.budget && !mine ? m(st.budget - st.total) : m(excluded + outside)}</div>
          <div className="stat-sub">{st.budget && !mine ? `von ${m(st.budget)}` : "Anreise, Vorab-Kosten"}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Ausgaben pro Tag{div > 1 ? " und Person" : ""}</h2>
          <div className="row">
            <div className="segmented">
              <button className={split === "category" ? "active" : ""} onClick={() => setSplit("category")}>
                nach Kategorie
              </button>
              <button className={split === "method" ? "active" : ""} onClick={() => setSplit("method")}>
                nach Zahlungsmittel
              </button>
            </div>
            {group && (
              <div className="segmented">
                <button className={!perPerson ? "active" : ""} onClick={() => setPerPerson(false)}>
                  Gruppe
                </button>
                <button className={perPerson ? "active" : ""} onClick={() => setPerPerson(true)}>
                  pro Person
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="muted small chart-note">ohne Ausgaben außerhalb des Tagesdurchschnitts · mehrtägige Ausgaben verteilt{div > 1 ? ` · geteilt durch ${div} Personen` : ""}</p>
        <StackedColumns
          data={chart}
          series={series}
          format={m}
          formatAxis={short}
        />
        <Legend series={series} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Nach Kategorie</h2>
          <table className="list compact">
            <thead>
              <tr>
                <th>Kategorie</th>
                <th className="r">Anzahl</th>
                <th className="r">Betrag</th>
                <th className="r">Anteil</th>
                <th className="r">pro Tag</th>
              </tr>
            </thead>
            <tbody>
              {st.byCategory.map((c) => (
                <tr key={c.key}>
                  <td>
                    {CATEGORIES[c.key].icon} {CATEGORIES[c.key].label}
                  </td>
                  <td className="r">{c.count}</td>
                  <td className="r">{m(c.amount)}</td>
                  <td className="r">{pct(c.amount)}</td>
                  <td className="r muted">{m(c.amount / Math.max(1, st.days))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>Gesamt</td>
                <td className="r">{st.count}</td>
                <td className="r">{m(st.total)}</td>
                <td className="r">100 %</td>
                <td className="r">{m(st.total / Math.max(1, st.days))}</td>
              </tr>
            </tfoot>
          </table>
        </section>
        <section className="card">
          <h2>Anteile</h2>
          <BarList items={st.byCategory.map((c) => ({ label: `${CATEGORIES[c.key].icon} ${CATEGORIES[c.key].label}`, value: c.amount }))} format={m} />
        </section>
      </div>

      <div className="two-col">
        <section className="card">
          <h2>Nach Zahlungsmittel</h2>
          <table className="list compact">
            <thead>
              <tr>
                <th>Zahlungsmittel</th>
                <th className="r">Anzahl</th>
                <th className="r">Betrag</th>
                <th className="r">Anteil</th>
                <th className="r">pro Tag</th>
              </tr>
            </thead>
            <tbody>
              {st.byMethod.map((c) => (
                <tr key={c.key || "-"}>
                  <td className={c.key ? "" : "muted"}>{methodLabel(c.key)}</td>
                  <td className="r">{c.count}</td>
                  <td className="r">{m(c.amount)}</td>
                  <td className="r">{pct(c.amount)}</td>
                  <td className="r muted">{m(c.amount / Math.max(1, st.days))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {st.byMethod.some((c) => !c.key) && <p className="muted small">Ausgaben ohne Zahlungsmittel lassen sich unter „Ausgaben“ filtern und nachtragen.</p>}
        </section>
        <section className="card">
          <h2>Anteile Zahlungsmittel</h2>
          <BarList items={st.byMethod.map((c) => ({ label: methodLabel(c.key), value: c.amount }))} format={m} />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Tag für Tag</h2>
          <button className="ghost small" onClick={() => exportDailyCsv(trip, sum)}>
            CSV
          </button>
        </div>
        <div className="table-scroll">
          <table className="list compact daily-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Datum</th>
                <th className="r">{mine && meIn ? "mein Anteil" : "Gesamt"}</th>
                {group && <th className="r">pro Person</th>}
                {people.map((p) => (
                  <th key={p.personId} className="r">
                    <PersonDot person={sum.person(p.personId)} size={14} /> {sum.name(p.personId)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {st.daily.map((d, i) => (
                <tr key={d.date} className="static">
                  <td>{i + 1}</td>
                  <td className="nowrap">{dayLabel(d.date)}</td>
                  <td className="r">{d.total ? m(d.total) : "–"}</td>
                  {group && <td className="r muted">{d.total ? m(d.total / st.persons) : "–"}</td>}
                  {people.map((p) => (
                    <td key={p.personId} className="r">
                      {p.daily[i] ? m(p.daily[i]) : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={2}>Ø pro Tag</td>
                <td className="r">{m(st.perDay)}</td>
                {group && <td className="r">{m(st.perPersonDay)}</td>}
                {people.map((p) => (
                  <td key={p.personId} className="r">
                    {m(p.perDay)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted small">Nur Ausgaben, die im Tagesdurchschnitt zählen. Die Spalten je Person zeigen den eigenen Anteil an geteilten Ausgaben.</p>
      </section>

      <div className="three-col">
        {st.byCountry.some((c) => c.key) && (
          <section className="card">
            <h2>Nach Land</h2>
            <BarList items={st.byCountry.map((c) => ({ label: c.key ? countryName(c.key) : "ohne Angabe", value: c.amount }))} format={m} />
          </section>
        )}
        <section className="card">
          <h2>Nach Währung</h2>
          <table className="list compact">
            <tbody>
              {st.byCurrency.map((c) => (
                <tr key={c.currency}>
                  <td>{c.currency}</td>
                  <td className="r">{money(c.original, c.currency)}</td>
                  <td className="r muted">{c.currency !== trip.currency ? `≈ ${m(c.home)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {sum.shared && !mine && (
          <section className="card">
            <h2>Pro Person</h2>
            <table className="list compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="r">Anteil</th>
                  <th className="r">pro Tag</th>
                  <th className="r">ausgelegt</th>
                </tr>
              </thead>
              <tbody>
                {sum.settlement.rows.map((r) => (
                  <tr key={r.personId}>
                    <td>
                      <PersonDot person={sum.person(r.personId)} size={16} /> {sum.name(r.personId)}
                    </td>
                    <td className="r">{m(r.share)}</td>
                    <td className="r muted">{m(r.share / Math.max(1, st.days))}</td>
                    <td className="r">{m(r.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}
