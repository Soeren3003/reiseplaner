import { useEffect, useMemo, useState } from "react";
import type { TripTab } from "../../App";
import { MODE_COLOR, RouteMap } from "../../components/RouteMap";
import { Badge, Empty } from "../../components/ui";
import { TRANSPORT_MODES, uid, now } from "../../lib/defaults";
import { dayLabel, num } from "../../lib/format";
import { loadPlaces, type GeoPoint, type PlaceIndex } from "../../lib/places";
import { buildRoute, type RoutePlace } from "../../lib/route";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { TransportMode, Trip } from "../../lib/types";

const KIND_LABEL = { city: "Stadt", airport: "Flughafen", custom: "selbst gesetzt" } as const;

export default function Route({ trip, sum, go }: { trip: Trip; sum: TripSummary; go: (t: TripTab) => void }) {
  const store = useStore();
  const [index, setIndex] = useState<PlaceIndex | null>(null);
  const [picking, setPicking] = useState<RoutePlace | null>(null);
  const [focusLeg, setFocusLeg] = useState("");
  const [local, setLocal] = useState(false);

  useEffect(() => {
    loadPlaces().then(setIndex);
  }, []);

  const route = useMemo(() => buildRoute(trip, sum.transports, sum.stays, index, store.places), [trip, sum.transports, sum.stays, index, store.places]);
  // „Vor Ort“: Orte in den Reiseländern (ohne Heimat- und Umsteigeorte), selbst gesetzte immer
  const localPoints = useMemo(
    () =>
      [...route.legs.flatMap((l) => [l.from, l.to]), ...route.stays.map((s) => s.point)].filter(
        (p): p is GeoPoint => !!p && (p.kind === "custom" || trip.countries.includes(p.cc)),
      ),
    [route, trip.countries],
  );
  // stabil halten, sonst springt die Karte nach jedem Verschieben zurück
  const focus = useMemo((): GeoPoint[] | null => {
    const leg = route.legs.find((l) => l.transport.id === focusLeg);
    if (leg?.from && leg.to) return [leg.from, leg.to];
    return local && localPoints.length ? localPoints : null;
  }, [route, focusLeg, local, localPoints]);

  if (!sum.transports.length && !sum.stays.length)
    return (
      <Empty>
        Noch keine Verbindungen oder Unterkünfte. Sobald unter „Transport“ Start und Ziel eingetragen sind, erscheint hier die Route.{" "}
        <button className="link" onClick={() => go("transport")}>
          → Transport
        </button>
      </Empty>
    );

  const usedModes = [...new Set(route.legs.map((l) => l.transport.mode))] as TransportMode[];
  const open = route.places.filter((p) => !p.point);
  const totalKm = route.legs.reduce((a, l) => a + (l.km ?? 0), 0);


  const setPlace = (p: RoutePlace, lat: number, lon: number) => {
    const existing = store.places.find((x) => x.key === p.key);
    store.save("places", existing ? { ...existing, lat, lon, name: p.text } : { id: uid(), createdAt: now(), updatedAt: now(), key: p.key, name: p.text, lat, lon });
    setPicking(null);
  };
  const resetPlace = (p: RoutePlace) => {
    const existing = store.places.find((x) => x.key === p.key);
    if (existing) void store.remove("places", existing.id);
  };

  return (
    <div className="split wide-side">
      <div className="main-col">
        <section className="card flush map-card">
          <RouteMap
            route={route}
            tripCountries={trip.countries}
            picking={!!picking}
            onPick={(lat, lon) => picking && setPlace(picking, lat, lon)}
            focus={focus}
            highlight={focusLeg}
          />
          <div className="map-legend">
            <div className="segmented">
              <button
                className={!local && !focusLeg ? "active" : ""}
                onClick={() => {
                  setLocal(false);
                  setFocusLeg("");
                }}
              >
                Ganze Route
              </button>
              <button
                className={local && !focusLeg ? "active" : ""}
                disabled={!localPoints.length}
                title={trip.countries.length ? "Nur die Orte in den Ländern der Reise" : "Erst im Überblick die Länder der Reise eintragen"}
                onClick={() => {
                  setLocal(true);
                  setFocusLeg("");
                }}
              >
                Vor Ort
              </button>
            </div>
            {usedModes.map((m) => (
              <span key={m}>
                <i className={`lg-line mode-${m}`} style={{ borderColor: MODE_COLOR[m] }} /> {TRANSPORT_MODES[m].icon} {TRANSPORT_MODES[m].label}
              </span>
            ))}
            {route.stays.some((s) => s.point) && <span>🏠 Unterkunft</span>}
            <span className="muted small">Luftlinie · noch nicht gebuchte Verbindungen blasser</span>
          </div>
        </section>
        {picking && (
          <div className="alert row">
            <span className="grow">
              Ort für „{picking.text}“ setzen: auf die Karte klicken (vorher hineinzoomen, dann wird es genauer).
            </span>
            <button className="small" onClick={() => setPicking(null)}>
              Abbrechen
            </button>
          </div>
        )}
      </div>

      <aside className="side-col">
        <section className="card">
          <h2>Strecken</h2>
          {route.legs.length === 0 ? (
            <p className="muted small">Keine Verbindungen.</p>
          ) : (
            <ol className="plain leg-list">
              {route.legs.map((l) => {
                const t = l.transport;
                return (
                  <li key={t.id} className={`clickable ${focusLeg === t.id ? "active" : ""}`} onClick={() => setFocusLeg(focusLeg === t.id ? "" : t.id)} title="Auf diese Strecke zoomen">
                    <span className="leg-swatch" style={{ background: MODE_COLOR[t.mode] }} />
                    <div className="grow">
                      <div>
                        {TRANSPORT_MODES[t.mode].icon} {t.from || "?"} → {t.to || "?"}
                      </div>
                      <div className="muted small">
                        {dayLabel(t.departDate)}
                        {t.number && ` · ${t.number}`}
                        {l.km !== null ? ` · ${num(l.km, 0)} km` : " · Ort fehlt"}
                        {t.status !== "booked" && " · noch nicht gebucht"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {totalKm > 0 && (
            <dl className="kv-list">
              {usedModes
                .filter((m) => route.kmByMode[m])
                .map((m) => (
                  <Kv key={m} k={`${TRANSPORT_MODES[m].icon} ${TRANSPORT_MODES[m].label}`} v={`${num(route.kmByMode[m] ?? 0, 0)} km`} />
                ))}
              <dt className="sep">Gesamt (Luftlinie)</dt>
              <dd className="sep">
                <strong>{num(totalKm, 0)} km</strong>
              </dd>
            </dl>
          )}
        </section>

        <section className="card">
          <h2>
            Orte {open.length > 0 && <Badge color="yellow">{open.length} ohne Position</Badge>}
          </h2>
          <p className="muted small">
            Gefunden über Flughafen-Codes wie „(FRA)“ und eine mitgelieferte Städteliste. Kleinere Orte und Hotels lassen sich per Klick auf die Karte
            setzen; das gilt dann für alle Reisen mit demselben Ortsnamen.
          </p>
          {!index && <p className="muted small">Ortsliste wird geladen …</p>}
          <ul className="plain place-list">
            {route.places
              .slice()
              .sort((a, b) => Number(!!a.point) - Number(!!b.point))
              .map((p) => (
                <li key={p.key} className={p.point ? "" : "missing"}>
                  <div className="grow">
                    <div>{p.text}</div>
                    <div className="muted small">
                      {p.point ? `${KIND_LABEL[p.point.kind]}: ${p.point.label}${p.point.cc && p.point.kind !== "custom" ? ` (${p.point.cc})` : ""}` : "nicht gefunden"}
                    </div>
                  </div>
                  <button className={p.point ? "ghost small" : "small"} onClick={() => setPicking(picking?.key === p.key ? null : p)}>
                    {picking?.key === p.key ? "…" : p.point ? "Ändern" : "Setzen"}
                  </button>
                  {p.point?.kind === "custom" && (
                    <button className="icon" title="Selbst gesetzten Ort entfernen" onClick={() => resetPlace(p)}>
                      ×
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
