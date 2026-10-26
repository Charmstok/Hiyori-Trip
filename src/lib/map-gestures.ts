import type { Map, Point } from 'leaflet';

type Gesture = Event & { scale?: number; clientX?: number; clientY?: number };

export function bindMapGestures(map: Map): () => void {
  const element = map.getContainer();
  let touching = false;
  let gesture: { zoom: number; anchor: Point } | undefined;
  let frame = 0;
  let panFrame = 0;
  let panX = 0;
  let panY = 0;
  let lastPanAt = 0;
  let targetZoom = map.getZoom();
  let anchor = map.getSize().divideBy(2);

  function consume(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function zoomTo(zoom: number, point: Point) {
    targetZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
    anchor = point;
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        map.setZoomAround(anchor, targetZoom, { animate: false });
      });
  }
  function clearPan() {
    cancelAnimationFrame(panFrame);
    panFrame = 0;
    panX = 0;
    panY = 0;
    lastPanAt = 0;
  }
  function onWheel(event: WheelEvent) {
    consume(event);
    if (gesture || !Number.isFinite(event.deltaY)) return;
    const size = map.getSize();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.y : 1;
    // Pinching produces Ctrl + wheel; a two-finger swipe produces ordinary wheel deltas.
    if (event.ctrlKey) {
      clearPan();
      const zoom = (frame ? targetZoom : map.getZoom()) - (event.deltaY * unit) / (100 * Math.LN2);
      zoomTo(zoom, map.mouseEventToContainerPoint(event));
    } else {
      if (!Number.isFinite(event.deltaX) || (!event.deltaX && !event.deltaY)) return;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        map.setZoomAround(anchor, targetZoom, { animate: false });
      }
      if (!lastPanAt || event.timeStamp - lastPanAt > 180) {
        clearPan();
        map.stop();
      }
      lastPanAt = event.timeStamp;
      panX += event.deltaX * (event.deltaMode === 2 ? size.x : unit);
      panY += event.deltaY * unit;
      if (!panFrame)
        panFrame = requestAnimationFrame(() => {
          panFrame = 0;
          const x = Math.trunc(panX),
            y = Math.trunc(panY);
          panX -= x;
          panY -= y;
          if (x || y) {
            map.panBy([x, y], { animate: false });
          }
        });
    }
  }
  function onTouch(event: TouchEvent) {
    touching = event.touches.length > 0;
  }
  function onGestureStart(event: Gesture) {
    // Real touchscreen pinches stay with Leaflet's touchZoom handler.
    if (touching) return;
    consume(event);
    clearPan();
    cancelAnimationFrame(frame);
    frame = 0;
    map.stop();
    gesture = {
      zoom: map.getZoom(),
      anchor:
        Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
          ? map.mouseEventToContainerPoint(event as MouseEvent)
          : map.getSize().divideBy(2),
    };
  }
  function onGestureChange(event: Gesture) {
    if (!gesture) return;
    consume(event);
    if (typeof event.scale === 'number' && Number.isFinite(event.scale) && event.scale > 0)
      zoomTo(map.getScaleZoom(event.scale, gesture.zoom), gesture.anchor);
  }
  function onGestureEnd(event: Gesture) {
    onGestureChange(event);
    gesture = undefined;
  }

  // Capture only inside the map; never disable page zoom on the document.
  const options = { passive: false, capture: true };
  element.addEventListener('wheel', onWheel, options);
  element.addEventListener('gesturestart', onGestureStart, options);
  element.addEventListener('gesturechange', onGestureChange, options);
  element.addEventListener('gestureend', onGestureEnd, options);
  element.addEventListener('touchstart', onTouch, { passive: true, capture: true });
  element.addEventListener('touchend', onTouch, { passive: true, capture: true });
  element.addEventListener('touchcancel', onTouch, { passive: true, capture: true });
  return () => {
    cancelAnimationFrame(frame);
    clearPan();
    element.removeEventListener('wheel', onWheel, options);
    element.removeEventListener('gesturestart', onGestureStart, options);
    element.removeEventListener('gesturechange', onGestureChange, options);
    element.removeEventListener('gestureend', onGestureEnd, options);
    element.removeEventListener('touchstart', onTouch, options);
    element.removeEventListener('touchend', onTouch, options);
    element.removeEventListener('touchcancel', onTouch, options);
  };
}
