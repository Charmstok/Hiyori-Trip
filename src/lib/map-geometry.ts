import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, MultiPolygon } from 'geojson';
import japan from '../data/japan.json';

const geometry = japan.geometry as MultiPolygon;
const main: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: geometry.coordinates.filter(
    (p) => p[0].some((c) => c[1] >= 30) && p[0].some((c) => c[0] >= 128),
  ),
};
const islands: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: geometry.coordinates.filter((p) => p[0].every((c) => c[1] < 30 && c[0] < 130)),
};
export const projection = geoMercator().fitExtent(
  [
    [75, 24],
    [654, 475],
  ],
  main,
);
export const islandProjection = geoMercator().fitExtent(
  [
    [67, 380],
    [154, 449],
  ],
  islands,
);
export const mainMapPath = geoPath(projection)(main) || '';
export const islandMapPath = geoPath(islandProjection)(islands) || '';
export const mapPoint = (coordinate: [number, number]) =>
  (coordinate[1] < 30 ? islandProjection(coordinate) : projection(coordinate)) as [number, number];
export const mapFeature = {
  type: 'Feature',
  properties: {},
  geometry: main,
} as Feature<MultiPolygon>;
