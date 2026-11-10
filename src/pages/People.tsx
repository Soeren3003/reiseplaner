import { useState } from "react";
import type { Nav } from "../App";
import { PersonDot } from "../components/common";
import { Badge, Empty, Field } from "../components/ui";
import { confirmDialog } from "../lib/api";
import { PALETTE, TRIP_STATUS, newPerson } from "../lib/defaults";
import { dateRange } from "../lib/format";
import { useStore } from "../lib/store";
import type { Person } from "../lib/types";

export default function People({ selected, nav }: { selected?: string; nav: Nav }) {
  const store = useStore();
  const [sel, setSel] = useState(selected ?? store.people[0]?.id ?? "");
  const [q, setQ] = useState("");
  const p = store.people.find((x) => x.id === sel);
  const list = store.people
    .filter((x) => !q || `${x.name} ${x.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const add = () => {
    const x = newPerson(store.people.length);
    store.save("people", x);
    setSel(x.id);
    setQ("");
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Mitreisende</h1>
        <div className="toolbar">
          <button className="primary" onClick={add}>
            + Person
          </button>
        </div>
      </div>
      {store.people.length === 0 ? (
        <Empty>
          Noch niemand eingetragen. Lege dich selbst an und markiere dich mit „Das bin ich“ – dann wirst du bei neuen Reisen automatisch eingetragen.
          <br />
          Wer mit anderen reist, legt sie hier an und kann Ausgaben aufteilen. Allein unterwegs ist das nicht nötig.
        </Empty>
      ) : (
        <div className="master-detail">
          <div className="card master">
            <div className="master-filter">
              <input className="search" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="pick-list">
              {list.map((x) => (
                <li key={x.id} className={x.id === sel ? "active" : ""} onClick={() => setSel(x.id)}>
                  <PersonDot person={x} />
                  <div>
                    <div>
                      {x.name || "Ohne Namen"} {store.me === x.id && <span className="muted small">(ich)</span>}
                    </div>
                    <div className="muted small">{store.trips.filter((t) => t.travelers.includes(x.id)).length} Reise(n)</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="muted small master-count">
              {list.length} von {store.people.length}
            </div>
          </div>
          {p ? <PersonEditor key={p.id} p={p} nav={nav} onDeleted={() => setSel("")} /> : <Empty>Person links auswählen.</Empty>}
        </div>
      )}
    </div>
  );
}

function PersonEditor({ p, nav, onDeleted }: { p: Person; nav: Nav; onDeleted: () => void }) {
  const store = useStore();
  const set = (patch: Partial<Person>) => store.save("people", { ...p, ...patch });
  const trips = store.trips.filter((t) => t.travelers.includes(p.id)).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const money =
    store.expenses.some((e) => e.paidBy === p.id || e.splitAmong.includes(p.id)) ||
    store.payments.some((x) => x.from === p.id || x.to === p.id) ||
    [...store.transports, ...store.stays, ...store.activities].some((b) => b.paidBy === p.id || b.travelers.includes(p.id));

  const remove = async () => {
    if (trips.length || money) {
      await confirmDialog(`${p.name || "Diese Person"} ist bei ${trips.length || "einer"} Reise(n) eingetragen oder kommt in Ausgaben vor und kann deshalb nicht gelöscht werden – sonst stimmen die Abrechnungen nicht mehr.`);
      return;
    }
    if (!(await confirmDialog(`${p.name || "Person"} löschen?`))) return;
    await store.deletePerson(p.id);
    onDeleted();
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{p.name || "Neue Person"}</h2>
        <div className="row">
          {store.me === p.id ? (
            <span className="badge badge-green">Das bin ich</span>
          ) : (
            <button className="ghost small" onClick={() => store.setMe(p.id)} title="Wird nur auf diesem Rechner gespeichert: bei neuen Reisen automatisch eingetragen, bei Ausgaben als „bezahlt von“ vorausgewählt, und „mein Anteil“ in der Auswertung.">
              Das bin ich
            </button>
          )}
          <button className="ghost small danger" onClick={remove}>
            Löschen
          </button>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Name">
          <input value={p.name} autoFocus={!p.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="E-Mail">
          <input type="email" value={p.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Telefon">
          <input value={p.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Farbe">
          <div className="color-row">
            {PALETTE.map((c) => (
              <button key={c} className={`swatch ${p.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => set({ color: c })} aria-label={c} />
            ))}
          </div>
        </Field>
        <Field label="Notizen" wide>
          <textarea rows={3} value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <h3>Reisen</h3>
      {trips.length === 0 ? (
        <p className="muted small">Noch bei keiner Reise dabei.</p>
      ) : (
        <table className="list compact">
          <tbody>
            {trips.map((t) => (
              <tr key={t.id} onClick={() => nav({ page: "trip", id: t.id })}>
                <td>
                  {t.emoji} {t.name}
                </td>
                <td>{dateRange(t.startDate, t.endDate)}</td>
                <td>
                  <Badge color={TRIP_STATUS[t.status].color}>{TRIP_STATUS[t.status].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
