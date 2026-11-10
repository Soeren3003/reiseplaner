import { useState } from "react";
import { BarList, Legend, StackedColumns } from "../../components/charts";
import { PersonDot } from "../../components/common";
import { Empty } from "../../components/ui";
import { tripStats } from "../../lib/calc";
import { CATEGORIES, PAYMENT_METHODS } from "../../lib/defaults";
import { exportExpensesCsv, exportPdf } from "../../lib/export";
import { dayLabel, money, moneyShort, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { ExpenseCategory, Trip } from "../../lib/types";

const SLOTS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"];

/** Tagesverlauf: die fünf größten Kategorien einzeln, der Rest zusammengefasst */
export function categorySeries(byCategory: { key: ExpenseCategory; amount: number }[]) {
  const sorted = byCategory.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, SLOTS.length).map((c) => c.key);
  const rest = sorted.length > top.length;
  const series = [...top.map((k, i) => ({ name: CATEGORIES[k].label, color: SLOTS[i] })), ...(rest ? [{ name: "Übrige", color: "var(--viz-other)" }] : [])];
  const values = (by: Partial<Record<ExpenseCategory, number>>) => {
    const v = top.map((k) => by[k] ?? 0);
    if (rest) v.push(Object.entries(by).reduce((a, [k, x]) => a + (top.includes(k as ExpenseCategory) ? 0 : x ?? 0), 0));
    return v;
  };
  return { series, values };
}

export default function Analysis({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const meIn = sum.shared && trip.travelers.includes(store.me);
  const [mine, setMine] = useState(false);
  const st = mine && meIn ? tripStats(trip, sum.expenses, store.me) : sum.stats;
  const m = (n: number) => money(n, trip.currency);
  const short = (n: number) => moneyShort(n, trip.currency);

  if (!sum.expenses.length) return <Empty>Noch keine Ausgaben – die Auswertung erscheint, sobald etwas erfasst ist.</Empty>;

  // nur Kategorien, die im Tagesverlauf vorkommen (Flüge sind meist ausgenommen)
  const dailyCats = new Map<ExpenseCategory, number>();
  for (const d of st.daily) for (const [k, v] of Object.entries(d.byCategory)) dailyCats.set(k as ExpenseCategory, (dailyCats.get(k as ExpenseCategory) ?? 0) + (v ?? 0));
  const { series, values } = categorySeries([...dailyCats.entries()].map(([key, amount]) => ({ key, amount })));
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
        <div className="stat">
          <div className="stat-label">{mine || !sum.shared ? "Ø pro Nacht Unterkunft" : "pro Person"}</div>
          <div className="stat-value">
            {mine || !sum.shared
              ? m((st.byCategory.find((c) => c.key === "stay")?.amount ?? 0) / Math.max(1, st.days - 1))
              : m(st.total / Math.max(1, sum.travelers.length))}
          </div>
          <div className="stat-sub">{mine || !sum.shared ? `${Math.max(0, st.days - 1)} Nächte` : `${sum.travelers.length} Mitreisende`}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{st.budget && !mine ? "Budget übrig" : "nicht im Tagesdurchschnitt"}</div>
          <div className={`stat-value ${st.budget && !mine && st.budget < st.total ? "neg" : ""}`}>{st.budget && !mine ? m(st.budget - st.total) : m(excluded + outside)}</div>
          <div className="stat-sub">{st.budget && !mine ? `von ${m(st.budget)}` : "Anreise, Vorab-Kosten"}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Ausgaben pro Tag</h2>
          <span className="muted small">ohne Ausgaben außerhalb des Tagesdurchschnitts · mehrtägige Ausgaben verteilt</span>
        </div>
        <StackedColumns
          data={st.daily.map((d, i) => ({ label: String(i + 1), long: `Tag ${i + 1} · ${dayLabel(d.date)}`, values: values(d.byCategory) }))}
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

      <div className="three-col">
        {st.byCountry.some((c) => c.key) && (
          <section className="card">
            <h2>Nach Land</h2>
            <BarList items={st.byCountry.map((c) => ({ label: c.key || "ohne Angabe", value: c.amount }))} format={m} />
          </section>
        )}
        {st.byMethod.some((c) => c.key) && (
          <section className="card">
            <h2>Nach Zahlungsart</h2>
            <BarList items={st.byMethod.map((c) => ({ label: c.key ? PAYMENT_METHODS[c.key] : "ohne Angabe", value: c.amount }))} format={m} />
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
