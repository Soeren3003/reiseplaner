import { useEffect, useState } from "react";
import { Field } from "../components/ui";
import { api, inTauri, pickFolder } from "../lib/api";
import { CURRENCIES, DEFAULT_PACKING, DEFAULT_PAYMENT_METHODS, DEFAULT_TODOS } from "../lib/defaults";
import { dateTime } from "../lib/format";
import { useStore } from "../lib/store";
import type { LocalConfig, Settings } from "../lib/types";

const TABS = [
  ["allgemein", "Vorgaben"],
  ["aufgaben", "Aufgaben-Vorlage"],
  ["packliste", "Packliste-Vorlage"],
  ["sync", "Daten & Sync"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function SettingsPage({ tab: initial }: { tab?: string }) {
  const store = useStore();
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t[0] === initial)?.[0] ?? "allgemein") as Tab);
  const s = store.settings;
  const set = (patch: Partial<Settings>) => store.saveSettings({ ...s, ...patch });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Einstellungen</h1>
      </div>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "allgemein" && (
        <>
        <section className="card narrow">
          <h2>Vorgaben</h2>
          <div className="form-grid">
            <Field label="Heimatwährung für neue Reisen" hint="In dieser Währung rechnet die Statistik über alle Reisen.">
              <select value={s.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value })}>
                {CURRENCIES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <label className="check wide">
              <input type="checkbox" checked={s.excludeFlightsFromDaily} onChange={(e) => set({ excludeFlightsFromDaily: e.target.checked })} />
              Gebuchte Flüge nicht in den Tagesdurchschnitt einrechnen (gilt für neu übernommene Flüge; je Ausgabe änderbar)
            </label>
          </div>
        </section>
        <section className="card narrow">
          <h2>Zahlungsmittel</h2>
          <p className="muted small">
            Eines pro Zeile, z. B. „Bar“, „Kreditkarte Visa“, „Revolut“, „Reisekasse“. Erscheint bei Ausgaben und Buchungen zur Auswahl und in der
            Auswertung. Umbenennen ändert bestehende Ausgaben nicht.
          </p>
          <TemplateEditor rows={7} value={s.paymentMethods} onChange={(paymentMethods) => set({ paymentMethods: [...new Set(paymentMethods)] })} />
          <button className="link small" onClick={() => set({ paymentMethods: DEFAULT_PAYMENT_METHODS })}>
            Auf Standard zurücksetzen
          </button>
        </section>
        </>
      )}

      {tab === "aufgaben" && (
        <section className="card narrow">
          <h2>Aufgaben für neue Reisen</h2>
          <p className="muted small">Eine Aufgabe pro Zeile. Bestehende Reisen lassen sich unter „Vorbereitung“ mit „Vorlage ergänzen“ aktualisieren.</p>
          <TemplateEditor value={s.todoTemplate} onChange={(todoTemplate) => set({ todoTemplate })} />
          <button className="link small" onClick={() => set({ todoTemplate: DEFAULT_TODOS })}>
            Auf Standard zurücksetzen
          </button>
        </section>
      )}

      {tab === "packliste" && (
        <section className="card narrow">
          <h2>Packliste für neue Reisen</h2>
          <p className="muted small">Ein Eintrag pro Zeile. Eine Zeile mit Doppelpunkt am Ende beginnt einen Abschnitt, z. B. „Kleidung:“.</p>
          <TemplateEditor value={s.packTemplate} onChange={(packTemplate) => set({ packTemplate })} />
          <button className="link small" onClick={() => set({ packTemplate: DEFAULT_PACKING })}>
            Auf Standard zurücksetzen
          </button>
        </section>
      )}

      {tab === "sync" && <SyncSettings />}
    </div>
  );
}

/** Zeilen werden erst beim Verlassen übernommen, damit Leerzeilen beim Tippen erhalten bleiben. */
function TemplateEditor({ value, onChange, rows = 18 }: { value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => setText(value.join("\n")), [value]);
  return (
    <textarea
      rows={rows}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        onChange(
          text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

function SyncSettings() {
  const store = useStore();
  const [cfg, setCfg] = useState<LocalConfig | null>(store.config);
  const [password, setPassword] = useState("");
  const [hasPw, setHasPw] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.hasPassword().then(setHasPw);
  }, []);

  if (!cfg) return null;
  const w = cfg.webdav;
  const setW = (patch: Partial<LocalConfig["webdav"]>) => setCfg({ ...cfg, webdav: { ...w, ...patch } });
  const dirty = JSON.stringify(cfg) !== JSON.stringify(store.config) || password !== "";

  const save = async () => {
    const keychain = await api.saveConfig(cfg, password || undefined);
    const dataChanged = cfg.dataDir !== store.config?.dataDir;
    store.setConfig(cfg);
    if (password) setHasPw(true);
    setPassword("");
    if (dataChanged) await store.reload();
    setMsg({ ok: true, text: keychain ? "Gespeichert." : "Gespeichert. Hinweis: Kein Schlüsselbund verfügbar – Passwort liegt in der lokalen Konfigurationsdatei." });
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (dirty) await save();
      setMsg({ ok: true, text: await api.testConnection() });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const last = store.sync.last;

  return (
    <>
      <section className="card">
        <h2>Datenordner</h2>
        <p className="muted small">
          Hier liegen Reisen, Mitreisende, Buchungen, Ausgaben und Dokumente. Der Ordner muss <strong>nicht</strong> im Nextcloud-Client liegen – die
          App synchronisiert selbst per WebDAV.
        </p>
        <div className="row">
          <code className="path">{cfg.dataDir}</code>
          <button className="ghost small" disabled={!inTauri} onClick={() => api.openDataDir()}>
            Öffnen
          </button>
          <button
            className="ghost small"
            disabled={!inTauri}
            onClick={async () => {
              const d = await pickFolder("Datenordner wählen");
              if (d) setCfg({ ...cfg, dataDir: d });
            }}
          >
            Ändern …
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Nextcloud / WebDAV</h2>
        <p className="muted small">
          Auf mehreren Rechnern oder gemeinsam planen: Einen Ordner in Nextcloud anlegen und ggf. mit den Mitreisenden teilen (Bearbeiten erlaubt). Jeder trägt hier seinen eigenen
          Benutzer ein und als Ordner den Pfad, unter dem der geteilte Ordner bei ihm erscheint.
        </p>
        <label className="check">
          <input type="checkbox" checked={w.enabled} onChange={(e) => setW({ enabled: e.target.checked })} />
          Synchronisation aktivieren
        </label>
        <div className="form-grid">
          <Field label="Server-Adresse" wide hint="Nextcloud-Adresse (https://cloud.example.com) oder vollständige WebDAV-URL aus Nextcloud → Dateien → Einstellungen.">
            <input value={w.url} placeholder="https://…" onChange={(e) => setW({ url: e.target.value })} />
          </Field>
          <Field label="Benutzername">
            <input value={w.username} onChange={(e) => setW({ username: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="App-Passwort" hint={hasPw ? "Gespeichert im Schlüsselbund. Nur ausfüllen zum Ändern." : "Nextcloud → Einstellungen → Sicherheit → „Neues App-Passwort erstellen“."}>
            <input type="password" value={password} placeholder={hasPw ? "••••••••" : ""} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Ordner auf dem Server" hint="Wird angelegt, falls nicht vorhanden.">
            <input value={w.remoteFolder} onChange={(e) => setW({ remoteFolder: e.target.value })} />
          </Field>
          <Field label="Automatisch synchronisieren">
            <select value={w.autoSyncMinutes} onChange={(e) => setW({ autoSyncMinutes: Number(e.target.value) })}>
              <option value={0}>Nur beim Start und manuell</option>
              <option value={5}>alle 5 Minuten</option>
              <option value={15}>alle 15 Minuten</option>
              <option value={60}>stündlich</option>
            </select>
          </Field>
        </div>
        {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`}>{msg.text}</div>}
        <div className="row">
          <button className="primary" disabled={!dirty} onClick={() => save().catch((e) => setMsg({ ok: false, text: String(e) }))}>
            Speichern
          </button>
          <button disabled={busy || !w.url || !inTauri} onClick={test}>
            Verbindung testen
          </button>
          <button disabled={!w.enabled || store.sync.running || dirty || !inTauri} onClick={() => store.runSync()}>
            {store.sync.running ? "Synchronisiere …" : "Jetzt synchronisieren"}
          </button>
        </div>
      </section>
      {(last || store.sync.error) && (
        <section className="card">
          <h2>Letzte Synchronisation</h2>
          {last && (
            <p>
              {dateTime(last.finishedAt)}: {last.uploaded} hochgeladen, {last.downloaded} heruntergeladen, {last.deletedLocal + last.deletedRemote} gelöscht.
            </p>
          )}
          {last && last.conflicts.length > 0 && (
            <div className="alert">
              {last.conflicts.length} Konflikt(e) – auf beiden Geräten geändert. Die neuere Version wurde behalten, die andere liegt im Datenordner unter
              „conflicts“:
              <ul>
                {last.conflicts.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {store.sync.error && <pre className="alert error">{store.sync.error}</pre>}
        </section>
      )}
    </>
  );
}
