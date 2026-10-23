import { useId } from 'react';
import { geoArea, geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import regionData from '../data/regions.json';
import japan from '../data/japan.json';
import { places } from '../data/places';
import { mainMapPath, islandMapPath, mapPoint } from '../lib/map-geometry';
import type { Place } from '../types';

const regionFeatures = (regionData as FeatureCollection).features;
const featured = ['札幌', '仙台', '东京', '金泽', '京都', '大阪', '广岛', '福冈', '那霸'];
const polygonsOf = (geometry: Geometry): Polygon['coordinates'][] =>
  geometry.type === 'GeometryCollection'
    ? geometry.geometries.flatMap(polygonsOf)
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : [];

function focusProjection(region: string) {
  const feature = regionFeatures.find((f) => f.properties?.name === region);
  if (!feature) return undefined;
  const geometries =
    feature.geometry.type === 'GeometryCollection'
      ? feature.geometry.geometries
      : [feature.geometry];
  // Fit each prefecture's main landmass, keeping distant ocean islands from shrinking the region view.
  const coordinates = geometries
    .map(
      (g) =>
        [...polygonsOf(g)].sort(
          (a, b) =>
            geoArea({ type: 'Polygon', coordinates: b }) -
            geoArea({ type: 'Polygon', coordinates: a }),
        )[0],
    )
    .filter(Boolean);
  return geoMercator().fitExtent(
    [
      [177, 48],
      [523, 430],
    ],
    { type: 'MultiPolygon', coordinates },
  );
}
const focusedMaps = new Map(
  regionFeatures.map((feature) => {
    const region = feature.properties!.name as string;
    const project = focusProjection(region)!;
    return [
      region,
      {
        project,
        land: geoPath(project)(japan as unknown as Feature) || '',
        highlight: geoPath(project)(feature) || '',
      },
    ];
  }),
);
const offsets: Record<string, [number, number]> = {
  京都: [20, -30],
  大阪: [20, 30],
  奈良: [60, 0],
  神户: [-20, -3],
  那霸: [18, 8],
};
function labelsFor(visible: Place[]) {
  const occupied: { x: number; y: number; width: number }[] = [];
  return new Map(
    visible.map((place) => {
      const [px, py] = mapPoint(place.coordinates),
        preferred = offsets[place.name] || [16, -3],
        width = place.name.length * 13 + 8;
      for (const dy of [
        preferred[1],
        preferred[1] - 25,
        preferred[1] + 25,
        preferred[1] - 50,
        preferred[1] + 50,
      ])
        for (const dx of [preferred[0], -preferred[0]]) {
          const x = px + dx - (dx < 0 ? width : 0),
            y = py + dy;
          if (
            x < 10 ||
            x + width > 690 ||
            y < 15 ||
            y > 495 ||
            occupied.some(
              (r) => x < r.x + r.width + 6 && x + width + 6 > r.x && Math.abs(y - r.y) < 23,
            )
          )
            continue;
          occupied.push({ x, y, width });
          return [place.name, [dx, dy]] as const;
        }
      return [place.name, preferred] as const;
    }),
  );
}
function calloutsFor(visible: Place[], point: (coordinate: [number, number]) => [number, number]) {
  const ordered = [...visible].sort((a, b) => point(a.coordinates)[0] - point(b.coordinates)[0]);
  const left = ordered.slice(0, Math.ceil(ordered.length / 2)),
    right = ordered.slice(left.length);
  return [left, right].flatMap((side, lane) => {
    const items = side
      .map((place) => ({ place, point: point(place.coordinates) }))
      .sort((a, b) => a.point[1] - b.point[1]);
    const ys = items.map(
      (item, i) => Math.max(48, Math.min(414, item.point[1] - 26)) + (i % 2 ? 8 : -8),
    );
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 78);
    if (ys.length && ys.at(-1)! > 418) {
      const delta = ys.at(-1)! - 418;
      for (let i = 0; i < ys.length; i++) ys[i] -= delta;
    }
    return items.map((item, i) => ({
      ...item,
      x: lane === 0 ? 14 + (i % 2) * 9 : 536 - (i % 2) * 9,
      y: ys[i],
      left: lane === 0,
    }));
  });
}
interface Props {
  selected?: string;
  region?: string;
  route?: string[];
  onSelect?: (place: Place) => void;
  compact?: boolean;
}
export function JapanMap({
  selected,
  region = '全部',
  route = [],
  onSelect,
  compact = false,
}: Props) {
  const uid = useId().replaceAll(':', ''),
    focus = focusedMaps.get(region),
    focused = !!focus;
  const point = (coordinate: [number, number]) =>
    (focus ? focus.project(coordinate) : mapPoint(coordinate)) as [number, number];
  const visible = places.filter((p) =>
    focused
      ? p.region === region
      : featured.includes(p.name) || p.name === selected || route.includes(p.name),
  );
  const labels = labelsFor(visible),
    callouts = focus ? calloutsFor(visible, point) : [];
  const routePlaces = route
    .map((name) => places.find((p) => p.name === name))
    .filter((p, i, all) => p && (i === 0 || p.name !== all[i - 1]?.name)) as Place[];
  const activate = (place: Place) => onSelect?.(place);
  const keyboard = (event: React.KeyboardEvent, place: Place) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(place);
    }
  };
  return (
    <svg
      className={`japan-map ${compact ? 'compact' : ''} ${focused ? 'focused' : ''}`}
      viewBox="0 0 700 510"
      aria-label={focused ? `日本目的地地图，已放大${region}` : '日本目的地地图'}
      role="group"
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0.7" y2="1">
          <stop stopColor="#b8c6b6" />
          <stop offset="1" stopColor="#d1d9c7" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <rect width="700" height="510" rx="8" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        {focused ? (
          <g key={region} className="region-focus-land">
            <path d={focus.land} className="map-context-land" />
            <path d={focus.highlight} className="map-region-highlight" />
            <text x="350" y="486" className="focus-region-label" textAnchor="middle">
              {region} · CHOOSE YOUR NEXT STOP
            </text>
          </g>
        ) : (
          <>
            <text className="map-ocean" x="245" y="140" transform="rotate(-22 245 140)">
              SEA OF JAPAN
            </text>
            <text className="map-ocean" x="410" y="425" transform="rotate(-22 410 425)">
              PACIFIC OCEAN
            </text>
            <path d={mainMapPath} className="map-land" style={{ fill: `url(#${uid}-fill)` }} />
            <path d="M52 350h118v112" className="island-border" />
            <path d={islandMapPath} className="map-land" style={{ fill: `url(#${uid}-fill)` }} />
            <text x="57" y="480" className="map-inset-label">
              沖縄諸島 · 位置示意
            </text>
          </>
        )}
        {routePlaces.length > 1 && (
          <polyline
            className="map-route"
            points={routePlaces.map((p) => point(p.coordinates).join(',')).join(' ')}
          />
        )}
        {callouts.map((c) => {
          const anchorX = c.left ? c.x + 148 : c.x,
            anchorY = c.y + 28;
          return (
            <path
              key={c.place.name}
              className={`city-callout-line ${selected === c.place.name ? 'active' : ''}`}
              d={`M${c.point[0]},${c.point[1]} C${(c.point[0] + anchorX) / 2},${c.point[1]} ${(c.point[0] + anchorX) / 2},${anchorY} ${anchorX},${anchorY}`}
            />
          );
        })}
        {visible.map((p) => {
          const [x, y] = point(p.coordinates),
            active = selected === p.name,
            [dx, dy] = labels.get(p.name)!;
          return (
            <g
              key={p.name}
              transform={`translate(${x},${y})`}
              className={`map-pin ${active ? 'active' : ''} ${route.includes(p.name) ? 'visited' : ''}`}
              role="button"
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`探索${p.name}`}
              aria-pressed={active}
              onClick={() => activate(p)}
              onKeyDown={(e) => keyboard(e, p)}
            >
              <title>
                {p.name} · {p.ja} · {p.region}
              </title>
              <circle className="pin-target" r={focused ? 15 : 12} />
              {active && <circle className="pin-halo" r="14" />}
              {!focused && (Math.abs(dy) > 12 || Math.abs(dx) > 25) && (
                <path className="pin-leader" d={`M0,0 L${dx + (dx < 0 ? 5 : -5)},${dy}`} />
              )}
              <circle className="pin-dot" r={active ? 6 : focused ? 5 : 4} />
              {!focused && (
                <text className="pin-label" x={dx} y={dy} textAnchor={dx < 0 ? 'end' : 'start'}>
                  {p.name}
                </text>
              )}
            </g>
          );
        })}
        {focused && (
          <g role="group" aria-label={`${region}城市列表`}>
            {callouts.map((c) => (
              <g
                key={c.place.name}
                className={`city-callout ${selected === c.place.name ? 'active' : ''}`}
                transform={`translate(${c.x},${c.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${c.place.name} ${c.place.ja}`}
                aria-pressed={selected === c.place.name}
                onClick={() => activate(c.place)}
                onKeyDown={(e) => keyboard(e, c.place)}
              >
                <rect width="148" height="56" rx="9" />
                <text className="callout-name" x="13" y="23">
                  {c.place.name}
                </text>
                <text
                  textLength={c.place.ja.length + c.place.en.length > 22 ? 122 : undefined}
                  lengthAdjust="spacingAndGlyphs"
                  className="callout-ja"
                  x="13"
                  y="42"
                  lang="ja"
                >
                  {c.place.ja} · {c.place.en}
                </text>
                <path d="m126 19 7 0 0 7m0-7-8 8" />
              </g>
            ))}
          </g>
        )}
      </g>
      <g transform="translate(665 452)" className="map-compass">
        <path d="M0 16V-10m-4 7 4-7 4 7" />
        <text y="-20" textAnchor="middle">
          N
        </text>
      </g>
    </svg>
  );
}
