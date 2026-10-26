import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clearMapRectangle } from '../lib/map-viewport';
import { bindMapGestures } from '../lib/map-gestures';

export interface MapPoint {
  id: string;
  title: string;
  coordinates: [number, number];
}
export function MapCanvas({
  points,
  center,
  selectedId,
  onSelect,
  onPick,
  picking = false,
  route = true,
  focusRequest = 0,
  avoidOverlays = false,
  layoutKey = '',
}: {
  points: MapPoint[];
  center: [number, number];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onPick?: (coordinates: [number, number]) => void;
  picking?: boolean;
  route?: boolean;
  focusRequest?: number;
  avoidOverlays?: boolean;
  layoutKey?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const current = useRef({
    points,
    center,
    selectedId,
    onSelect,
    onPick,
    picking,
    route,
    avoidOverlays,
  });
  current.current = { points, center, selectedId, onSelect, onPick, picking, route, avoidOverlays };
  const [tileError, setTileError] = useState(false);
  const signature = JSON.stringify(points.map((p) => [p.id, p.title, p.coordinates]));
  const previousCenter = useRef(center.join(','));
  const viewMode = useRef<'fit' | 'point' | 'city'>('fit');
  function clearArea() {
    const rect = element.current!.getBoundingClientRect();
    const overlays = current.current.avoidOverlays
      ? [
          ...(element
            .current!.closest('.map-workspace')
            ?.querySelectorAll<HTMLElement>('[data-map-overlay]') || []),
        ]
          .filter((node) => node.getClientRects().length)
          .map((node) => {
            const box = node.getBoundingClientRect();
            return {
              left: box.left - rect.left,
              top: box.top - rect.top,
              right: box.right - rect.left,
              bottom: box.bottom - rect.top,
            };
          })
      : [];
    return clearMapRectangle(rect.width, rect.height, overlays);
  }
  function focus(coordinates: [number, number], zoom: number) {
    const view = map.current;
    if (!view) return;
    const area = clearArea();
    const offset = L.point((area.left + area.right) / 2, (area.top + area.bottom) / 2).subtract(
      view.getSize().divideBy(2),
    );
    const target = view.project([coordinates[1], coordinates[0]], zoom).subtract(offset);
    view.setView(view.unproject(target, zoom), zoom, { animate: false });
  }
  function fit() {
    viewMode.current = 'fit';
    const view = map.current;
    if (!view || !element.current?.clientWidth || !element.current.clientHeight) return;
    const values = current.current.points.map((p) => L.latLng(p.coordinates[1], p.coordinates[0]));
    const area = clearArea();
    const size = view.getSize();
    const labelPadding = Math.min(90, (area.right - area.left) / 4);
    if (values.length)
      view.fitBounds(L.latLngBounds(values), {
        paddingTopLeft: [area.left + labelPadding, area.top + 35],
        paddingBottomRight: [size.x - area.right + labelPadding, size.y - area.bottom + 35],
        maxZoom: 15,
        animate: false,
      });
    else focus(current.current.center, 12);
  }
  useEffect(() => {
    const view = L.map(element.current!, {
      zoomControl: false,
      scrollWheelZoom: false,
      touchZoom: true,
      zoomSnap: 0,
      minZoom: 3,
      maxZoom: 19,
      worldCopyJump: true,
    });
    map.current = view;
    view.setView([current.current.center[1], current.current.center[0]], 12);
    const releaseGestures = bindMapGestures(view);
    L.control
      .zoom({ position: 'topright', zoomInTitle: '放大地图', zoomOutTitle: '缩小地图' })
      .addTo(view);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(view);
    view.attributionControl.setPrefix(false);
    let loaded = false;
    const timeout = window.setTimeout(() => {
      if (!loaded) setTileError(true);
    }, 10000);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    })
      .on('tileerror', () => setTileError(true))
      .on('tileload', () => {
        loaded = true;
        setTileError(false);
      })
      .addTo(view);
    layer.current = L.layerGroup().addTo(view);
    view.on('click', (event) => {
      if (current.current.picking)
        current.current.onPick?.([
          Number(event.latlng.wrap().lng.toFixed(7)),
          Number(event.latlng.lat.toFixed(7)),
        ]);
    });
    return () => {
      window.clearTimeout(timeout);
      releaseGestures();
      view.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current || !layer.current) return;
    const group = layer.current;
    group.clearLayers();
    if (route && points.length > 1)
      L.polyline(
        points.map((p) => [p.coordinates[1], p.coordinates[0]] as [number, number]),
        { color: '#52735f', weight: 2, opacity: 0.75, dashArray: '5 7', interactive: false },
      ).addTo(group);
    for (const point of points) {
      const text = document.createElement('span');
      text.className = 'journey-label-text';
      text.textContent = point.title;
      const marker = L.marker([point.coordinates[1], point.coordinates[0]], {
        icon: L.divIcon({
          className: `journey-label ${point.id === selectedId ? 'selected' : ''}`,
          html: text,
          iconSize: undefined,
          iconAnchor: [0, 0],
        }),
        title: point.title,
        keyboard: true,
        riseOnHover: true,
      }).addTo(group);
      marker.getElement()?.setAttribute('aria-label', `在地图上查看${point.title}`);
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        current.current.onSelect?.(point.id);
      });
    }
  }, [signature, selectedId, route]);
  useEffect(() => {
    viewMode.current = selectedId ? 'point' : 'fit';
  }, [selectedId, signature, focusRequest]);
  useEffect(() => {
    const key = center.join(',');
    if (previousCenter.current !== key) {
      viewMode.current = 'city';
      focus(center, 12);
    }
    previousCenter.current = key;
  }, [center[0], center[1]]);
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const view = map.current;
        if (!view || !element.current?.clientWidth || !element.current.clientHeight) return;
        view.invalidateSize({ pan: false });
        const point = current.current.points.find((p) => p.id === current.current.selectedId);
        if (viewMode.current === 'city') focus(current.current.center, 12);
        else if (point && viewMode.current === 'point')
          focus(point.coordinates, Math.max(view.getZoom(), 15));
        else fit();
      });
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(element.current!);
    if (avoidOverlays)
      element
        .current!.closest('.map-workspace')
        ?.querySelectorAll('[data-map-overlay]')
        .forEach((node) => observer.observe(node));
    refresh();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [selectedId, signature, focusRequest, avoidOverlays, layoutKey]);
  return (
    <div className={`detail-map-wrap ${picking ? 'picking' : ''}`}>
      <div className="detail-map" ref={element} role="region" aria-label="详细地点地图" />
      <button className="map-fit" type="button" onClick={fit}>
        显示全部地点
      </button>
      {picking && (
        <p className="map-pick-hint" role="status">
          点击地图，选择准确位置
        </p>
      )}
      {tileError && (
        <p className="map-tile-error" role="status">
          底图暂时无法加载，请检查网络；已保存的位置仍可查看。
        </p>
      )}
    </div>
  );
}
