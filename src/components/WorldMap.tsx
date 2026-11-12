import { geoArea, geoCentroid, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { countryName, type CountryState } from "../lib/countries";

type Country = Feature<Geometry, GeoJsonProperties> & { id: string };

/** Ländergrenzen (Natural Earth, 1:50 Mio.) erst laden, wenn die Karte gebraucht wird */
let cache: Promise<Country[]> | null = null;
export function loadCountries() {
  cache ??= import("../generated/world.json").then((m) => {
    const topo = m.default as unknown as Topology<{ countries: GeometryCollection }>;
    return (feature(topo, topo.objects.countries) as FeatureCollection<Geometry>).features as Country[];
  });
  return cache;
}

const STATUS_LABEL = { visited: "bereist", planned: "geplant", none: "" } as const;
const MAX_ZOOM = 60;

interface View {
  k: number;
  x: number;
  y: number;
}

/**
 * Weltkarte als SVG: bereiste, geplante und gewünschte Länder eingefärbt.
 * Zoomen mit Mausrad, Trackpad oder den Knöpfen, verschieben durch Ziehen, Klick wählt ein Land und zoomt hinein.
 */
export function WorldMap({
  states,
  selected,
  onSelect,
  maxHeight = 560,
}: {
  states: Map<string, CountryState>;
  selected: string;
  onSelect: (code: string) => void;
  maxHeight?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  // Seitenverhältnis der Natural-Earth-Projektion (etwa 1,95 : 1), damit unter der Karte kein leerer Streifen bleibt
  const height = width ? Math.min(maxHeight, Math.round(width / 1.95) + 12) : 400;
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    loadCountries().then(setCountries);
  }, []);

  useEffect(() => {
    if (!box.current) return;
    // sofort messen – nicht nur auf den ResizeObserver warten (der meldet sich in ausgeblendeten Fenstern nicht)
    setWidth(Math.round(box.current.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // Projektion und Pfade nur neu berechnen, wenn sich die Größe ändert
  const geo = useMemo(() => {
    if (!countries || !width) return null;
    const projection = geoNaturalEarth1().fitExtent(
      [
        [6, 6],
        [width - 6, height - 6],
      ],
      { type: "Sphere" },
    );
    const path = geoPath(projection);
    const shapes = countries.map((f) => {
      const area = path.area(f);
      // sehr kleine Länder (Inselstaaten, Stadtstaaten) zusätzlich als Punkt, damit man sie sieht und trifft
      const c = area < 12 && geoArea(f) > 0 ? projection(geoCentroid(f)) : null;
      return { code: f.id, d: path(f) ?? "", bounds: path.bounds(f), dot: c };
    });
    return { sphere: path({ type: "Sphere" }) ?? "", shapes };
  }, [countries, width, height]);

  const clamp = useCallback(
    (v: View): View => {
      const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
      // nicht weiter verschieben, als die Karte reicht
      const x = Math.min(0, Math.max(width - width * k, v.x));
      const y = Math.min(0, Math.max(height - height * k, v.y));
      return { k, x, y };
    },
    [width, height],
  );

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) =>
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
        const f = k / v.k;
        return clamp({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f });
      }),
    [clamp],
  );

  // Mausrad / Trackpad: eigener Listener, weil React-Wheel-Events „passiv“ sind und die Seite sonst mitscrollt
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
  }, [zoomAt, geo]);

  /** auf ein Land zoomen (mehrere Flächen, z. B. Festland und Inseln, zusammen) */
  const focus = useCallback(
    (code: string) => {
      if (!geo) return;
      const parts = geo.shapes.filter((s) => s.code === code);
      if (!parts.length) return;
      let [[x0, y0], [x1, y1]] = parts[0].bounds;
      for (const p of parts.slice(1)) {
        x0 = Math.min(x0, p.bounds[0][0]);
        y0 = Math.min(y0, p.bounds[0][1]);
        x1 = Math.max(x1, p.bounds[1][0]);
        y1 = Math.max(y1, p.bounds[1][1]);
      }
      const k = Math.min(MAX_ZOOM, Math.max(1, 0.75 / Math.max((x1 - x0) / width, (y1 - y0) / height)));
      setView(clamp({ k, x: width / 2 - k * ((x0 + x1) / 2), y: height / 2 - k * ((y0 + y1) / 2) }));
    },
    [geo, width, height, clamp],
  );

  // von außen gewähltes Land (z. B. aus der Liste) anfahren
  useEffect(() => {
    if (selected) focus(selected);
  }, [selected, focus]);

  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d && e.buttons) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        if (!d.moved) (e.target as Element).setPointerCapture?.(e.pointerId);
        d.moved = true;
      }
      if (d.moved) {
        setHover(null);
        setView((v) => clamp({ ...v, x: d.vx + dx, y: d.vy + dy }));
      }
    }
  };
  const onPointerUp = () => {
    // nach dem Ziehen kein Klick auf das Land darunter
    setTimeout(() => (drag.current = null), 0);
  };
  const click = (code: string) => {
    if (drag.current?.moved) return;
    onSelect(code === selected ? "" : code);
  };
  const showTip = (code: string, e: ReactPointerEvent) => {
    if (drag.current?.moved || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setHover({ code, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const cls = (code: string) => {
    const s = states.get(code);
    return ["country", s ? s.status : "none", s?.favorite ? "favorite" : "", code === selected ? "selected" : ""].join(" ");
  };
  const hs = hover ? states.get(hover.code) : undefined;

  return (
    <div className="world-map" ref={box} style={{ height }}>
      {!geo && <div className="world-loading muted">Karte wird geladen …</div>}
      {geo && (
        <svg
          ref={svg}
          width={width}
          height={height}
          role="img"
          aria-label="Weltkarte der bereisten Länder"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          className={drag.current?.moved ? "dragging" : ""}
        >
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <path d={geo.sphere} className="ocean" onClick={() => !drag.current?.moved && onSelect("")} />
            {geo.shapes.map((s, i) => (
              <path key={i} d={s.d} className={cls(s.code)} vectorEffect="non-scaling-stroke" onClick={() => click(s.code)} onPointerMove={(e) => showTip(s.code, e)} />
            ))}
            {geo.shapes
              // Punkte nur für markierte bzw. gewählte Kleinstaaten – sonst wären die Ozeane voller grauer Punkte
              .filter((s) => s.dot && ((states.get(s.code)?.status ?? "none") !== "none" || states.get(s.code)?.favorite || s.code === selected))
              .map((s, i) => (
                <circle
                  key={`dot${i}`}
                  cx={s.dot![0]}
                  cy={s.dot![1]}
                  r={3.2 / view.k}
                  className={`dot ${cls(s.code)}`}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => click(s.code)}
                  onPointerMove={(e) => showTip(s.code, e)}
                />
              ))}
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
        <button
          className="icon"
          onClick={() => {
            setView({ k: 1, x: 0, y: 0 });
            onSelect("");
          }}
          aria-label="Ganze Welt"
          title="Ganze Welt"
        >
          ⌂
        </button>
      </div>
      {hover && (
        <div className="viz-tip map-tip" style={{ left: hover.x, top: hover.y - 10 }}>
          <strong>{countryName(hover.code)}</strong>
          {hs && hs.status !== "none" && <span className="muted"> · {STATUS_LABEL[hs.status]}</span>}
          {hs?.favorite && <span> ★</span>}
        </div>
      )}
    </div>
  );
}
