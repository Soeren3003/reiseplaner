const moneyFormats = new Map<string, Intl.NumberFormat>();

/** Betrag mit Währung; unbekannte Codes (Tippfehler) werden als „12,50 XYZ“ angezeigt. */
export function money(n: number, currency = "EUR") {
  const v = Number.isFinite(n) ? n : 0;
  let f = moneyFormats.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("de-DE", { style: "currency", currency });
    } catch {
      return `${fixed(v, 2)} ${currency}`;
    }
    moneyFormats.set(currency, f);
  }
  return f.format(v);
}

/** Kurz für Achsen und Kacheln: „1,2 Tsd. €“ */
export function moneyShort(n: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
  } catch {
    return `${num(n, 0)} ${currency}`;
  }
}

/** Währungssymbol für Eingabefelder: € statt EUR, sonst der Code */
export function currencySymbol(currency: string) {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency;
}

export function num(n: number, digits = 2) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n || 0);
}

export function fixed(n: number, digits = 2) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n || 0);
}

/** „22,99“ oder „22.99“ → 22.99; ungültig → null. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!t) return 0;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Minuten → „1:35“ */
export function duration(minutes: number) {
  const m = Math.round(minutes || 0);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** „1:35“, „1h 35m“, „95m“, „1,5“ (Stunden) → Minuten; ungültig → null. */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return 0;
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (m && (m[1] || m[2])) return Math.round(Number((m[1] ?? "0").replace(",", ".")) * 60) + Number(m[2] ?? 0);
  const n = parseNum(t);
  return n === null ? null : Math.round(n * 60);
}

export function date(iso: string) {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE");
}

/** „Mo., 03.03.“ */
export function dayLabel(iso: string) {
  if (!iso) return "–";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/** „Montag, 3. März 2026“ */
export function longDate(iso: string) {
  if (!iso) return "–";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Zeitraum „03.03. – 17.03.2026“ */
export function dateRange(a: string, b: string) {
  if (!a) return "–";
  if (!b || a === b) return date(a);
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  const sameYear = da.getFullYear() === db.getFullYear();
  const first = da.toLocaleDateString("de-DE", sameYear ? { day: "2-digit", month: "2-digit" } : undefined);
  return `${first} – ${db.toLocaleDateString("de-DE")}`;
}

export function dateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${num(n / 1024, 0)} KB`;
  return `${num(n / 1024 / 1024, 1)} MB`;
}

export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
}
