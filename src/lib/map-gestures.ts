import type { Map, Point } from 'leaflet';

type Gesture = Event & { scale?: number; clientX?: number; clientY?: number };

export function bindMapGestures(map: Map): () => void {
  const element = map.getContainer();
  let touching = false;
  let gesture: { zoom: number; anchor: Point } | undefined;
  let frame = 0;
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
  function onWheel(event: WheelEvent) {
    // Chromium and Firefox encode a trackpad pinch as Ctrl + wheel.
    if (!event.ctrlKey) return;
    consume(event);
    if (gesture || !Number.isFinite(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? map.getSize().y : 1;
    const zoom = (frame ? targetZoom : map.getZoom()) - (event.deltaY * unit) / (100 * Math.LN2);
    zoomTo(zoom, map.mouseEventToContainerPoint(event));
  }
  function onTouch(event: TouchEvent) {
    touching = event.touches.length > 0;
  }
  function onGestureStart(event: Gesture) {
    // Real touchscreen pinches stay with Leaflet's touchZoom handler.
    if (touching) return;
    consume(event);
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
    element.removeEventListener('wheel', onWheel, options);
    element.removeEventListener('gesturestart', onGestureStart, options);
    element.removeEventListener('gesturechange', onGestureChange, options);
    element.removeEventListener('gestureend', onGestureEnd, options);
    element.removeEventListener('touchstart', onTouch, options);
    element.removeEventListener('touchend', onTouch, options);
    element.removeEventListener('touchcancel', onTouch, options);
  };
}
