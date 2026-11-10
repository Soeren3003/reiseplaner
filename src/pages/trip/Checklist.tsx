import { useState } from "react";
import { PersonSelect } from "../../components/common";
import { templateItems, newChecklistItem, today } from "../../lib/defaults";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { ChecklistItem, ChecklistKind, Trip } from "../../lib/types";

export default function Checklist({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  return (
    <div className="two-col stack-narrow">
      <List trip={trip} sum={sum} kind="todo" title="Vor der Reise erledigen" />
      <List trip={trip} sum={sum} kind="pack" title="Packliste" />
    </div>
  );
}

function List({ trip, sum, kind, title }: { trip: Trip; sum: TripSummary; kind: ChecklistKind; title: string }) {
  const store = useStore();
  const [hideDone, setHideDone] = useState(false);
  const items = sum.checklist.filter((c) => c.kind === kind);
  const done = items.filter((c) => c.done).length;
  const groups = [...new Set(items.map((c) => c.group))];
  const set = (c: ChecklistItem, patch: Partial<ChecklistItem>) => store.save("checklist", { ...c, ...patch });
  const t0 = today();

  const fillTemplate = () => {
    const have = new Set(items.map((c) => c.title.trim().toLowerCase()));
    const tpl = kind === "todo" ? store.settings.todoTemplate : store.settings.packTemplate;
    for (const c of templateItems(trip.id, kind, tpl)) if (!have.has(c.title.toLowerCase())) store.save("checklist", c);
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          {title} <span className="muted small">{items.length ? `${done} / ${items.length}` : ""}</span>
        </h2>
        <div className="row">
          <label className="check small">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            Erledigte ausblenden
          </label>
          <button className="ghost small" onClick={fillTemplate} title="Fehlende Einträge aus der Vorlage (Einstellungen) ergänzen">
            Vorlage ergänzen
          </button>
        </div>
      </div>
      {items.length > 0 && (
        <div className="progress">
          <div style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      {(groups.length ? groups : [""]).map((g) => (
        <div key={g || "-"}>
          {g && <h3 className="check-group">{g}</h3>}
          <ul className="checklist">
            {items
              .filter((c) => c.group === g && (!hideDone || !c.done))
              .map((c) => (
                <li key={c.id} className={c.done ? "done" : ""}>
                  <input type="checkbox" checked={c.done} onChange={(e) => set(c, { done: e.target.checked })} />
                  <input className="plain-input grow" value={c.title} onChange={(e) => set(c, { title: e.target.value })} />
                  {kind === "todo" && (
                    <input type="date" className={`w-date ${c.due && c.due < t0 && !c.done ? "invalid" : ""}`} value={c.due} title="erledigen bis" onChange={(e) => set(c, { due: e.target.value })} />
                  )}
                  {sum.shared && <PersonSelect people={sum.travelers} value={c.assignee} onChange={(assignee) => set(c, { assignee })} emptyLabel={kind === "pack" ? "alle" : "–"} />}
                  <button className="icon danger" onClick={() => store.remove("checklist", c.id)} title="Löschen">
                    ×
                  </button>
                </li>
              ))}
          </ul>
          <AddRow onAdd={(t) => store.save("checklist", newChecklistItem(trip.id, kind, t, g))} placeholder={g ? `+ ${g}` : "+ Neuer Eintrag"} />
        </div>
      ))}
      {kind === "pack" && <AddGroup onAdd={(g, t) => store.save("checklist", newChecklistItem(trip.id, kind, t, g))} />}
    </section>
  );
}

function AddRow({ onAdd, placeholder }: { onAdd: (title: string) => void; placeholder: string }) {
  const [text, setText] = useState("");
  return (
    <input
      className="add-input"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && text.trim()) {
          onAdd(text.trim());
          setText("");
        }
      }}
    />
  );
}

function AddGroup({ onAdd }: { onAdd: (group: string, title: string) => void }) {
  const [group, setGroup] = useState("");
  const [title, setTitle] = useState("");
  const submit = () => {
    if (!group.trim() || !title.trim()) return;
    onAdd(group.trim(), title.trim());
    setGroup("");
    setTitle("");
  };
  return (
    <div className="row nowrap add-group">
      <input value={group} placeholder="Neuer Abschnitt" onChange={(e) => setGroup(e.target.value)} />
      <input value={title} placeholder="erster Eintrag" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="ghost small" onClick={submit} disabled={!group.trim() || !title.trim()}>
        Hinzufügen
      </button>
    </div>
  );
}
