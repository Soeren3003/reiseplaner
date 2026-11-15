import { geoInterpolate, geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TRANSPORT_MODES } from "../lib/defaults";
import type { GeoPoint } from "../lib/places";
import type { Route } from "../lib/route";
import type { TransportMode } from "../lib/types";
import { loadCountries } from "./WorldMap";

/** Feste Farbe je Verkehrsmittel (Farbe folgt dem Verkehrsmittel, nie der Reihenfolge) */
export const MODE_COLOR: Record<TransportMode, string> = {
  flight: "var(--viz-1)",
  train: "var(--viz-3)",
  bus: "var(--viz-4)",
  ferry: "var(--viz-7)",
  car: "var(--viz-2)",
  rentalcar: "var(--viz-2)",
  taxi: "var(--viz-5)",
  local: "var(--viz-5)",
  bike: "var(--viz-6)",
  other: "var(--viz-other)",
};

const MAX_ZOOM = 40;
type Countries = Awaited<ReturnType<typeof loadCountries>>;

interface Stop {
  point: GeoPoint;
  no: number;
  label: string;
}

/**
 * Reiseroute als Karte: Verbindungen als Luftlinie (Großkreis) in der Farbe des Verkehrsmittels,
 * Stationen nummeriert in Reihenfolge, Unterkünfte als Haus. Mit `picking` setzt ein Klick einen Ort.
 */
export function RouteMap({
  route,
  tripCountries,
  picking,
  onPick,
  focus,
  highlight,
  height = 560,
}: {
  route: Route;
  tripCountries: string[];
  picking: boolean;
  onPick: (lat: number, lon: number) => void;
  /** auf diese Orte zoomen (null = ganze Route) */
  focus: GeoPoint[] | null;
  /** hervorgehobene Verbindung (Transport-ID) */
  highlight?: string;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [countries, setCountries] = useState<Countries | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    loadCountries().then(setCountries);
  }, []);

  useEffect(() => {
    if (!box.current) return;
    setWidth(Math.round(box.current.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // Stationen in Reihenfolge der Verbindungen; gleiche Orte bekommen eine Nummer
  const stops = useMemo(() => {
    const out: Stop[] = [];
    const key = (p: GeoPoint) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    const seen = new Map<string, Stop>();
    for (const l of route.legs)
      for (const p of [l.from, l.to]) {
        if (!p || seen.has(key(p))) continue;
        const s = { point: p, no: out.length + 1, label: p.label.replace(/^[A-Z]{3} – /, "") };
        seen.set(key(p), s);
        out.push(s);
      }
    return out;
  }, [route]);

  const allPoints = useMemo(() => [...stops.map((s) => s.point), ...route.stays.flatMap((s) => (s.point ? [s.point] : []))], [stops, route]);

  // Projektion auf die Route zugeschnitten; ohne Orte die ganze Welt
  const projection = useMemo((): GeoProjection | null => {
    if (!width) return null;
    const lons = allPoints.map((p) => p.lon);
    const center = lons.length ? (Math.min(...lons) + Math.max(...lons)) / 2 : 10;
    const p = geoNaturalEarth1().rotate([-center, 0]);
    const pad = 48;
    if (!allPoints.length) return p.fitExtent([[8, 8], [width - 8, height - 8]], { type: "Sphere" });
    // Ausschnitt mindestens etwa 3° um die Orte, damit bei nahen Orten nicht übermäßig hineingezoomt wird
    const coords = allPoints.flatMap((q) => [
      [q.lon - 1.5, q.lat - 1.5],
      [q.lon + 1.5, q.lat + 1.5],
    ]);
    return p.fitExtent([[pad, pad], [width - pad, height - pad]], { type: "MultiPoint", coordinates: coords });
  }, [width, height, allPoints]);

  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const land = useMemo(
    () => (path && countries ? countries.map((f) => ({ code: f.id, d: path(f) ?? "" })) : []),
    [path, countries],
  );

  // auf ausgewählte Orte zoomen (Strecke aus der Liste, „Vor Ort“), sonst ganze Route
  useEffect(() => {
    if (!projection || !focus?.length) return setView({ k: 1, x: 0, y: 0 });
    const pts = focus.map((p) => projection([p.lon, p.lat]) ?? [0, 0]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(MAX_ZOOM, Math.max(1, 0.7 / Math.max((x1 - x0) / width, (y1 - y0) / height, 0.02)));
    setView({ k, x: width / 2 - k * ((x0 + x1) / 2), y: height / 2 - k * ((y0 + y1) / 2) });
  }, [projection, focus, width, height]);

  const clamp = useCallback((v: { k: number; x: number; y: number }) => {
    const k = Math.min(MAX_ZOOM, Math.max(0.5, v.k));
    return { k, x: v.x, y: v.y };
  }, []);
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) =>
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(0.5, v.k * factor));
        const f = k / v.k;
        return clamp({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f });
      }),
    [clamp],
  );

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, projection]);

  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !e.buttons) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      setHover(null);
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    setTimeout(() => (drag.current = null), 0);
    if (!picking || !projection || !svg.current || d?.moved) return;
    // Klickpunkt zurück in Längen- und Breitengrad
    const r = svg.current.getBoundingClientRect();
    const px = (e.clientX - r.left - view.x) / view.k;
    const py = (e.clientY - r.top - view.y) / view.k;
    const ll = projection.invert?.([px, py]);
    if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) onPick(Math.round(ll[1] * 1000) / 1000, Math.round(ll[0] * 1000) / 1000);
  };

  const tip = (text: string, e: ReactPointerEvent) => {
    if (drag.current?.moved || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setHover({ text, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const xy = (p: GeoPoint) => projection?.([p.lon, p.lat]) ?? [0, 0];
  const s = 1 / view.k;

  // Beschriftungen ohne Überlappung: in Reihenfolge der Stationen, überdeckte weglassen (Nummer bleibt sichtbar)
  const shownLabels = new Set<number>();
  {
    const boxes: [number, number, number, number][] = [];
    for (const st of stops) {
      const [px, py] = xy(st.point);
      const x = px * view.k + view.x + 13;
      const y = py * view.k + view.y - 8;
      const b: [number, number, number, number] = [x - 24, y, x + st.label.length * 7, y + 16];
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b);
      shownLabels.add(st.no);
    }
  }

  return (
    <div className={`world-map route-map ${picking ? "picking" : ""}`} ref={box} style={{ height }}>
      {(!projection || !countries) && <div className="world-loading muted">Karte wird geladen …</div>}
      {projection && path && (
        <svg ref={svg} width={width} height={height} role="img" aria-label="Reiseroute auf der Karte" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => setHover(null)}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <path d={path({ type: "Sphere" }) ?? ""} className="ocean" />
            {land.map((c, i) => (
              <path key={i} d={c.d} className={`country ${tripCountries.includes(c.code) ? "trip" : ""}`} vectorEffect="non-scaling-stroke" />
            ))}
            {route.legs.map((l) => {
              if (!l.from || !l.to) return null;
              const t = l.transport;
              const m = TRANSPORT_MODES[t.mode];
              const line = path({ type: "LineString", coordinates: [[l.from.lon, l.from.lat], [l.to.lon, l.to.lat]] }) ?? "";
              const mid = projection(geoInterpolate([l.from.lon, l.from.lat], [l.to.lon, l.to.lat])(0.5)) ?? [0, 0];
              const label = `${m.label}${t.number ? ` ${t.number}` : ""}: ${t.from} → ${t.to}${l.km ? ` · ${l.km.toLocaleString("de-DE")} km Luftlinie` : ""}`;
              return (
                <g key={t.id} className={`leg mode-${t.mode} ${t.status !== "booked" ? "unbooked" : ""} ${highlight === t.id ? "highlight" : ""} ${highlight && highlight !== t.id ? "dimmed" : ""}`} onPointerMove={(e) => tip(label, e)}>
                  <path d={line} className="leg-hit" vectorEffect="non-scaling-stroke" />
                  <path d={line} className="leg-line" stroke={MODE_COLOR[t.mode]} vectorEffect="non-scaling-stroke" />
                  <g transform={`translate(${mid[0]},${mid[1]}) scale(${s})`}>
                    <circle r={11} className="leg-badge" stroke={MODE_COLOR[t.mode]} />
                    <text className="leg-icon" textAnchor="middle" dy="0.35em">
                      {m.icon}
                    </text>
                  </g>
                </g>
              );
            })}
            {route.stays.map((r) => {
              if (!r.point) return null;
              const [x, y] = xy(r.point);
              return (
                <g key={r.stay.id} transform={`translate(${x},${y}) scale(${s})`} className="stay-pin" onPointerMove={(e) => tip(`🏠 ${r.stay.name || "Unterkunft"}`, e)}>
                  <text textAnchor="middle" dy="-0.6em" className="stay-icon-map">
                    🏠
                  </text>
                </g>
              );
            })}
            {stops.map((st) => {
              const [x, y] = xy(st.point);
              return (
                <g key={st.no} transform={`translate(${x},${y}) scale(${s})`} className="stop" onPointerMove={(e) => tip(`${st.no}. ${st.point.label}`, e)}>
                  <circle r={9} className="stop-dot" />
                  <text className="stop-no" textAnchor="middle" dy="0.35em">
                    {st.no}
                  </text>
                  {shownLabels.has(st.no) && (
                    <text className="stop-label" x={13} dy="0.35em">
                      {st.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
      <div className="map-zoom">
        <button className="icon" onClick={() => zoomAt(1.6, width / 2, height / 2)} aria-label="Hineinzoomen">
          +
        </button>
        <button className="icon" onClick={() => zoomAt(1 / 1.6, width / 2, height / 2)} aria-label="Herauszoomen">
          −
        </button>
        <button className="icon" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Ganze Route" title="Ganze Route">
          ⌂
        </button>
      </div>
      {picking && <div className="pick-hint">Klick auf die Karte setzt den Ort · vorher hineinzoomen für mehr Genauigkeit</div>}
      {hover && (
        <div className="viz-tip map-tip" style={{ left: hover.x, top: hover.y - 10 }}>
          {hover.text}
        </div>
      )}
    </div>
  );
}
