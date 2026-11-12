import { useEffect, useMemo, useState } from "react";
import { BarList } from "../../components/charts";
import { CurrencySelect, MethodSelect, MoneyField } from "../../components/booking";
import { CountrySelect } from "../../components/CountryPicker";
import { countryName } from "../../lib/countries";
import { PersonDot, PersonPicker, PersonSelect } from "../../components/common";
import { Empty, Field, Modal, NumberInput } from "../../components/ui";
import { budgetTotal, expenseDays, homeAmount, rateOf, splitIds, tripCurrencies } from "../../lib/calc";
import { CATEGORIES, newExpense, today } from "../../lib/defaults";
import { exportExpensesCsv } from "../../lib/export";
import { date, dayLabel, fixed, money, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { Expense, ExpenseCategory, Trip } from "../../lib/types";

const NO_PAYER = "__ohne";

const SOURCE_LABEL = { transport: "Transport", stay: "Unterkünfte", activity: "Aktivitäten" } as const;

export default function Expenses({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const [edit, setEdit] = useState("");
  const [cat, setCat] = useState<"" | ExpenseCategory>("");
  const [who, setWho] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const m = (n: number) => money(n, trip.currency);
  const editing = sum.expenses.find((e) => e.id === edit);

  const list = sum.expenses.filter(
    (e) =>
      (!cat || e.category === cat) &&
      (method === null || (e.method || "") === method) &&
      (!who || (who === NO_PAYER ? !e.paidBy : e.paidBy === who || splitIds(e, trip).includes(who))) &&
      (!q || `${e.title} ${e.notes} ${countryName(e.country)} ${CATEGORIES[e.category].label}`.toLowerCase().includes(q.toLowerCase())),
  );
  const days = useMemo(() => [...new Set(list.map((e) => e.date))], [list]);
  const filtered = list.length !== sum.expenses.length;

  return (
    <div className="split">
      <div className="main-col">
        <QuickAdd trip={trip} sum={sum} />
        {sum.shared && sum.settlement.withoutPayer > 0 && <MissingPayer sum={sum} onShow={() => setWho(NO_PAYER)} />}
        <section className="card">
          <div className="card-head">
            <h2>Ausgaben</h2>
            <div className="row">
              <input className="search" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory | "")}>
                <option value="">Alle Kategorien</option>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.icon} {v.label}
                  </option>
                ))}
              </select>
              {sum.shared && (
                <select value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">Alle Personen</option>
                  {sum.travelers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || "Ohne Namen"}
                    </option>
                  ))}
                  <option value={NO_PAYER}>– ohne „bezahlt von“ –</option>
                </select>
              )}
              <select value={method ?? "*"} onChange={(e) => setMethod(e.target.value === "*" ? null : e.target.value)} title="Zahlungsmittel">
                <option value="*">Alle Zahlungsmittel</option>
                {[...new Set(sum.expenses.map((e) => e.method || ""))].sort().map((x) => (
                  <option key={x || "-"} value={x}>
                    {x || "ohne Angabe"}
                  </option>
                ))}
              </select>
              <button className="ghost small" onClick={() => exportExpensesCsv(trip, sum)} disabled={!sum.expenses.length}>
                CSV
              </button>
            </div>
          </div>
          {sum.expenses.length === 0 ? (
            <Empty>
              Noch keine Ausgaben. Oben schnell erfassen – gebuchte Flüge, Unterkünfte und Aktivitäten erscheinen hier automatisch.
            </Empty>
          ) : list.length === 0 ? (
            <p className="muted">Keine Ausgaben für diesen Filter.</p>
          ) : (
            <>
              {filtered && (
                <p className="muted small">
                  {list.length} von {sum.expenses.length} Ausgaben · {m(list.reduce((a, e) => a + homeAmount(e, trip), 0))}
                </p>
              )}
              {days.map((d) => {
                const items = list.filter((e) => e.date === d);
                const dayNo = d >= trip.startDate && d <= trip.endDate ? Math.round((new Date(`${d}T12:00:00`).getTime() - new Date(`${trip.startDate}T12:00:00`).getTime()) / 86_400_000) + 1 : 0;
                return (
                  <div key={d} className="day-group">
                    <h3 className="row between">
                      <span>
                        {dayLabel(d)} <span className="muted small">{dayNo ? `Tag ${dayNo}` : d < trip.startDate ? "vor der Reise" : "nach der Reise"}</span>
                      </span>
                      <span className="nowrap">{m(items.reduce((a, e) => a + homeAmount(e, trip), 0))}</span>
                    </h3>
                    <ul className="expense-list">
                      {items.map((e) => (
                        <ExpenseRow key={e.id} trip={trip} sum={sum} e={e} onClick={() => setEdit(e.id)} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          )}
        </section>
      </div>
      <aside className="side-col">
        <BudgetCard trip={trip} sum={sum} />
        <RatesCard trip={trip} sum={sum} />
        {sum.stats.byCategory.length > 0 && (
          <section className="card">
            <h2>Nach Kategorie</h2>
            <BarList items={sum.stats.byCategory.map((c) => ({ label: `${CATEGORIES[c.key].icon} ${CATEGORIES[c.key].label}`, value: c.amount, onClick: () => setCat(c.key) }))} format={m} />
          </section>
        )}
      </aside>
      {editing && <ExpenseEditor trip={trip} sum={sum} e={editing} onClose={() => setEdit("")} />}
    </div>
  );
}

function ExpenseRow({ trip, sum, e, onClick }: { trip: Trip; sum: TripSummary; e: Expense; onClick: () => void }) {
  const home = homeAmount(e, trip);
  const missing = rateOf(e, trip) === null;
  const ids = splitIds(e, trip);
  const spread = expenseDays(e).length;
  return (
    <li onClick={onClick}>
      <span className="exp-icon" title={CATEGORIES[e.category].label}>
        {CATEGORIES[e.category].icon}
      </span>
      <div className="grow">
        <div>
          {e.title || CATEGORIES[e.category].label}
          {e.source && <span className="badge badge-blue small-badge">{SOURCE_LABEL[e.source]}</span>}
        </div>
        <div className="muted small">
          {[
            spread > 1 && `verteilt auf ${spread} Tage bis ${date(e.endDate)}`,
            e.country && countryName(e.country),
            e.method,
            e.excludeFromDaily && "nicht im Tagesdurchschnitt",
            e.notes,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {sum.shared && (
        <span className="exp-people" title={`bezahlt von ${e.paidBy ? sum.name(e.paidBy) : "– fehlt –"} · für ${ids.length === trip.travelers.length ? "alle" : ids.map(sum.name).join(", ")}`}>
          {e.paidBy ? <PersonDot person={sum.person(e.paidBy)} size={20} /> : <span className="no-payer" title="„bezahlt von“ fehlt">?</span>}
          {ids.length !== trip.travelers.length && <span className="muted small">→ {ids.length}</span>}
        </span>
      )}
      <span className="r exp-amount">
        {e.currency !== trip.currency && <div className="muted small">{money(e.amount, e.currency)}</div>}
        <strong className={missing ? "neg" : ""}>{missing ? "Kurs fehlt" : money(home, trip.currency)}</strong>
      </span>
    </li>
  );
}

/** Schnell erfassen wie am Handy: Betrag, Währung, Kategorie, fertig. */
function QuickAdd({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const t0 = today();
  const defaultDate = t0 >= trip.startDate && t0 <= trip.endDate ? t0 : trip.startDate;
  const me = sum.travelers.some((p) => p.id === store.me) ? store.me : (sum.travelers[0]?.id ?? "");
  // zuletzt verwendete Fremdwährung vorschlagen
  const lastManual = sum.expenses.find((e) => !e.source);
  const [d, setD] = useState({ date: defaultDate, amount: 0, currency: lastManual?.currency ?? trip.currency, category: "food" as ExpenseCategory, title: "", paidBy: me, method: lastManual?.method ?? "" });
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (sum.shared && !sum.travelers.some((p) => p.id === d.paidBy)) setD((x) => ({ ...x, paidBy: me }));
  }, [sum.shared, sum.travelers, d.paidBy, me]);

  const add = () => {
    if (!d.amount) return;
    store.save("expenses", { ...newExpense(trip, d.paidBy, d.date, d.currency), amount: d.amount, category: d.category, title: d.title.trim(), method: d.method });
    setD({ ...d, amount: 0, title: "" });
    setKey((k) => k + 1);
  };

  return (
    <section className="card quick-add" onKeyDown={(e) => e.key === "Enter" && add()}>
      <div className="quick-grid">
        <input type="date" value={d.date} onChange={(e) => e.target.value && setD({ ...d, date: e.target.value })} />
        <div className="amount-cell">
          <NumberInput key={key} value={d.amount || null} placeholder="Betrag" allowEmpty onChange={(v) => setD({ ...d, amount: v ?? 0 })} />
          <CurrencySelect trip={trip} value={d.currency} onChange={(currency) => setD({ ...d, currency })} />
        </div>
        <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as ExpenseCategory })}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
        <input value={d.title} placeholder="Wofür? (optional)" onChange={(e) => setD({ ...d, title: e.target.value })} />
        <MethodSelect value={d.method} onChange={(method) => setD({ ...d, method })} emptyLabel="Zahlungsmittel …" />
        {sum.shared && <PersonSelect people={sum.travelers} value={d.paidBy} onChange={(paidBy) => setD({ ...d, paidBy })} emptyLabel="bezahlt von …" />}
        <button className="primary" onClick={add} disabled={!d.amount}>
          + Ausgabe
        </button>
      </div>
      {sum.shared && <p className="muted small">Wird auf alle Mitreisenden aufgeteilt – zum Ändern die Ausgabe anklicken.</p>}
    </section>
  );
}

function BudgetCard({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const m = (n: number) => money(n, trip.currency);
  const st = sum.stats;
  const budget = budgetTotal(trip);
  return (
    <section className="card">
      <h2>Stand</h2>
      {budget > 0 && (
        <div className="progress">
          <div style={{ width: `${Math.min(100, (st.total / budget) * 100)}%`, background: st.total > budget ? "var(--danger)" : undefined }} />
        </div>
      )}
      <dl className="kv-list">
        <dt>Ausgaben gesamt</dt>
        <dd>
          <strong>{m(st.total)}</strong>
        </dd>
        {budget > 0 && (
          <>
            <dt>Budget</dt>
            <dd>{m(budget)}</dd>
            <dt>übrig</dt>
            <dd className={budget - st.total < 0 ? "neg" : ""}>{m(budget - st.total)}</dd>
          </>
        )}
        <dt className="sep">Ø pro Tag</dt>
        <dd className="sep">{m(st.perDay)}</dd>
        {trip.budgetType === "daily" && (
          <>
            <dt>Tagesbudget</dt>
            <dd>{m(trip.budget)}</dd>
          </>
        )}
        {sum.travelers.length > 1 && (
          <>
            <dt>pro Person</dt>
            <dd>{m(st.total / sum.travelers.length)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** Wechselkurse der Reise: in beide Richtungen eingebbar */
function RatesCard({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const [add, setAdd] = useState("");
  const currencies = tripCurrencies(trip, sum.expenses, sum.bookings).filter((c) => c !== trip.currency);
  const setRate = (c: string, v: number | null) => {
    const rates = { ...trip.rates };
    if (v && v > 0) rates[c] = v;
    else if (v === null) delete rates[c];
    else rates[c] = 0;
    store.save("trips", { ...trip, rates });
  };
  return (
    <section className="card">
      <h2>Wechselkurse</h2>
      <p className="muted small">Von Hand gepflegt, z. B. laut Kreditkartenabrechnung. Einzelne Ausgaben können einen eigenen Kurs haben.</p>
      {currencies.map((c) => {
        const r = trip.rates[c] ?? 0;
        return (
          <div key={c} className={`rate-line ${r ? "" : "missing"}`}>
            <span className="nowrap">1 {trip.currency} =</span>
            <NumberInput value={r ? 1 / r : null} digits={4} allowEmpty onChange={(v) => setRate(c, v ? 1 / v : 0)} />
            <span>{c}</span>
            <span className="muted small nowrap" title={`1 ${c} = ${fixed(r, 6)} ${trip.currency}`}>
              {r ? `1 ${c} = ${num(r, r < 0.01 ? 6 : 4)}` : "fehlt"}
            </span>
          </div>
        );
      })}
      <div className="row nowrap">
        <input value={add} maxLength={3} placeholder="z. B. USD" onChange={(e) => setAdd(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
        <button
          className="ghost small"
          disabled={add.length !== 3 || add === trip.currency || add in trip.rates}
          onClick={() => {
            store.save("trips", { ...trip, rates: { ...trip.rates, [add]: 0 } });
            setAdd("");
          }}
        >
          + Währung
        </button>
      </div>
    </section>
  );
}

function ExpenseEditor({ trip, sum, e, onClose }: { trip: Trip; sum: TripSummary; e: Expense; onClose: () => void }) {
  const store = useStore();
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<Expense>) => store.updateExpense(e, patch);
  const linked = !!e.source;
  return (
    <Modal
      title={`${CATEGORIES[e.category].icon} ${e.title || CATEGORIES[e.category].label}`}
      onClose={onClose}
      footer={
        <>
          {!linked &&
            (confirm ? (
              <button
                className="danger"
                onClick={async () => {
                  await store.remove("expenses", e.id);
                  onClose();
                }}
              >
                Wirklich löschen
              </button>
            ) : (
              <button className="ghost danger" onClick={() => setConfirm(true)}>
                Löschen
              </button>
            ))}
          <span className="grow" />
          <button className="primary" onClick={onClose}>
            Fertig
          </button>
        </>
      }
    >
      {linked && (
        <div className="alert">
          Automatisch aus „{SOURCE_LABEL[e.source as keyof typeof SOURCE_LABEL]}“ übernommen. Betrag und Datum dort ändern, Löschen über den Status der Buchung. „Bezahlt
          von“, „Aufgeteilt auf“ und das Zahlungsmittel lassen sich hier ändern und gelten dann auch für die Buchung.
        </div>
      )}
      <div className="form-grid">
        <Field label="Wofür" wide>
          <input value={e.title} disabled={linked} autoFocus={!e.title && !linked} placeholder={CATEGORIES[e.category].label} onChange={(ev) => set({ title: ev.target.value })} />
        </Field>
        <Field label="Kategorie">
          <select value={e.category} onChange={(ev) => set({ category: ev.target.value as ExpenseCategory })}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </select>
        </Field>
        {linked ? (
          <Field label="Betrag">
            <input disabled value={money(e.amount, e.currency)} />
          </Field>
        ) : (
          <MoneyField trip={trip} amount={e.amount} currency={e.currency} rate={e.rate} onAmount={(amount) => set({ amount })} onCurrency={(currency) => set({ currency })} />
        )}
        <Field label="Datum">
          <input type="date" value={e.date} disabled={linked} onChange={(ev) => ev.target.value && set({ date: ev.target.value, endDate: e.endDate && e.endDate <= ev.target.value ? "" : e.endDate })} />
        </Field>
        <Field label="Verteilen bis" hint="z. B. Mietwagen oder Rail-Pass über mehrere Tage">
          <input type="date" value={e.endDate} min={e.date} disabled={linked} onChange={(ev) => set({ endDate: ev.target.value > e.date ? ev.target.value : "" })} />
        </Field>
        {e.currency !== trip.currency && (
          <Field label="Eigener Kurs" hint={`1 ${e.currency} = … ${trip.currency}; leer = Kurs der Reise (${trip.rates[e.currency] ? num(trip.rates[e.currency], 6) : "fehlt"})`}>
            <NumberInput value={e.rate} digits={6} allowEmpty min={0} onChange={(rate) => set({ rate: rate || null })} />
          </Field>
        )}
        {sum.shared && (
          <>
            <Field label="Bezahlt von" hint="Wer hat das Geld ausgelegt?">
              <span className={e.paidBy ? "" : "missing-select"}>
                <PersonSelect people={sum.travelers} value={e.paidBy} onChange={(paidBy) => set({ paidBy })} emptyLabel="Bitte wählen" />
              </span>
            </Field>
            <Field label="Aufgeteilt auf" wide hint="Wer trägt die Kosten? „Alle“ = gleichmäßig auf alle Mitreisenden. Nicht: wer bezahlt hat.">
              <PersonPicker people={sum.travelers} selected={e.splitAmong} onChange={(splitAmong) => set({ splitAmong })} allLabel="Alle" />
            </Field>
          </>
        )}
        <Field label="Land">
          <CountrySelect value={e.country} first={trip.countries} onChange={(country) => set({ country })} />
        </Field>
        <Field label="Zahlungsmittel">
          <MethodSelect value={e.method} onChange={(method) => set({ method })} />
        </Field>
        <label className="check wide">
          <input type="checkbox" checked={e.excludeFromDaily} onChange={(ev) => set({ excludeFromDaily: ev.target.checked })} />
          Nicht im Tagesdurchschnitt (z. B. Anreise, vorab bezahlte Versicherung)
        </label>
        <Field label="Notiz" wide>
          <textarea rows={2} value={e.notes} onChange={(ev) => set({ notes: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/** Hinweis mit Filter und Sammel-Aktion für Ausgaben ohne „bezahlt von“ */
function MissingPayer({ sum, onShow }: { sum: TripSummary; onShow: () => void }) {
  const store = useStore();
  const [who, setWho] = useState(sum.travelers.some((p) => p.id === store.me) ? store.me : "");
  const missing = sum.expenses.filter((e) => !e.paidBy);
  return (
    <div className="alert row">
      <span className="grow">
        {missing.length} Ausgabe(n) ohne „bezahlt von“ – sie werden aufgeteilt, aber niemandem gutgeschrieben.{" "}
        <button className="link small" onClick={onShow}>
          Anzeigen
        </button>
      </span>
      <span className="row nowrap">
        alle auf
        <PersonSelect people={sum.travelers} value={who} onChange={setWho} emptyLabel="Person wählen" />
        <button
          className="small"
          disabled={!who}
          onClick={() => {
            // Buchungen nur einmal ändern (Preis und Kurtaxe gehören zur selben Unterkunft)
            const seen = new Set<string>();
            for (const e of missing) {
              const key = e.source ? `${e.source}/${e.sourceId}` : e.id;
              if (seen.has(key)) continue;
              seen.add(key);
              store.updateExpense(e, { paidBy: who });
            }
          }}
        >
          setzen
        </button>
      </span>
    </div>
  );
}
