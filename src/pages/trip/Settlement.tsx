import { useState } from "react";
import type { TripTab } from "../../App";
import { PersonDot, PersonSelect } from "../../components/common";
import { Empty, NumberInput } from "../../components/ui";
import { newPayment, today } from "../../lib/defaults";
import { exportSettlementCsv, settlementText } from "../../lib/export";
import { money } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { Payment, Trip } from "../../lib/types";

export default function Settlement({ trip, sum, go }: { trip: Trip; sum: TripSummary; go: (t: TripTab) => void }) {
  const store = useStore();
  const [copied, setCopied] = useState(false);
  const m = (n: number) => money(n, trip.currency);
  const s = sum.settlement;
  const setP = (p: Payment, patch: Partial<Payment>) => store.save("payments", { ...p, ...patch });

  if (!sum.shared) return <Empty>Allein unterwegs – es gibt nichts abzurechnen. Mitreisende trägst du im Überblick ein.</Empty>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(settlementText(trip, sum));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };

  return (
    <div className="split">
      <div className="main-col">
        <section className="card">
          <div className="card-head">
            <h2>Wer hat was bezahlt?</h2>
            <div className="row">
              <button className="ghost small" onClick={copy}>
                {copied ? "Kopiert ✓" : "Als Text kopieren"}
              </button>
              <button className="ghost small" onClick={() => exportSettlementCsv(trip, sum)}>
                CSV
              </button>
            </div>
          </div>
          <table className="list">
            <thead>
              <tr>
                <th>Name</th>
                <th className="r">ausgelegt</th>
                <th className="r">Zahlungen</th>
                <th className="r">Anteil</th>
                <th className="r">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.personId}>
                  <td>
                    <PersonDot person={sum.person(r.personId)} size={18} /> {sum.name(r.personId)}
                  </td>
                  <td className="r">{m(r.paid)}</td>
                  <td className="r">{r.transferred ? m(r.transferred) : "–"}</td>
                  <td className="r">{m(r.share)}</td>
                  <td className={`r ${r.balance < 0 ? "neg" : r.balance > 0 ? "pos" : ""}`}>
                    <strong>
                      {r.balance > 0 ? "+" : ""}
                      {m(r.balance)}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>Gesamt</td>
                <td className="r">{m(s.total)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
          {s.withoutPayer > 0 && (
            <div className="alert">
              {s.withoutPayer} Ausgabe(n) ohne „bezahlt von“ – sie werden verteilt, aber niemandem gutgeschrieben.{" "}
              <button className="link small" onClick={() => go("expenses")}>
                → Ausgaben
              </button>
            </div>
          )}
          {sum.missingRates.length > 0 && <div className="alert">Wechselkurs fehlt für {sum.missingRates.join(", ")} – diese Beträge sind noch nicht enthalten.</div>}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Bereits gezahlt</h2>
            <button className="ghost small" onClick={() => store.save("payments", newPayment(trip.id, "", "", today()))}>
              + Zahlung
            </button>
          </div>
          <p className="muted small">Geld, das schon geflossen ist: Ausgleichszahlungen, Bargeld für die Reisekasse, Vorschüsse. Beträge in {trip.currency}.</p>
          {sum.payments.length > 0 && (
            <table className="edit payments-table">
              <tbody>
                {sum.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="w-date">
                      <input type="date" value={p.date} onChange={(e) => e.target.value && setP(p, { date: e.target.value })} />
                    </td>
                    <td>
                      <PersonSelect people={sum.travelers} value={p.from} onChange={(from) => setP(p, { from })} emptyLabel="Von …" />
                    </td>
                    <td className="arrow">→</td>
                    <td>
                      <PersonSelect people={sum.travelers} value={p.to} onChange={(to) => setP(p, { to })} emptyLabel="An …" />
                    </td>
                    <td className="w-amount">
                      <NumberInput value={p.amount} min={0} suffix={trip.currency} onChange={(v) => setP(p, { amount: v ?? 0 })} />
                    </td>
                    <td>
                      <input value={p.notes} placeholder="Notiz" onChange={(e) => setP(p, { notes: e.target.value })} />
                    </td>
                    <td className="w-act">
                      <button className="icon danger" onClick={() => store.remove("payments", p.id)} title="Löschen">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <aside className="side-col">
        <section className="card">
          <h2>Wer zahlt wem?</h2>
          {s.transfers.length === 0 ? (
            <p className="muted">Alles ausgeglichen 👍</p>
          ) : (
            <ul className="transfers">
              {s.transfers.map((t) => (
                <li key={`${t.from}-${t.to}`}>
                  <span className="grow">
                    {sum.name(t.from)} <span className="arrow">→</span> {sum.name(t.to)}
                  </span>
                  <strong>{m(t.amount)}</strong>
                  <button
                    className="icon"
                    title="Als bezahlt eintragen"
                    onClick={() => store.save("payments", { ...newPayment(trip.id, t.from, t.to, today()), amount: t.amount, notes: "Ausgleich" })}
                  >
                    ✓
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Möglichst wenige Überweisungen. Mit ✓ als bezahlt eintragen.</p>
        </section>
      </aside>
    </div>
  );
}
