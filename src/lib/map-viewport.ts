export interface MapRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Find a clear rectangle in the actual map, including floating panels of different sizes.
export function clearMapRectangle(
  width: number,
  height: number,
  overlays: MapRectangle[],
): MapRectangle {
  const margin = Math.min(24, width / 10, height / 10);
  const full = { left: margin, top: margin, right: width - margin, bottom: height - margin };
  const obstacles = overlays
    .map((r) => ({
      left: Math.max(full.left, r.left - 12),
      top: Math.max(full.top, r.top - 12),
      right: Math.min(full.right, r.right + 12),
      bottom: Math.min(full.bottom, r.bottom + 12),
    }))
    .filter((r) => r.right > r.left && r.bottom > r.top);
  const xs = [...new Set([full.left, full.right, ...obstacles.flatMap((r) => [r.left, r.right])])];
  const ys = [...new Set([full.top, full.bottom, ...obstacles.flatMap((r) => [r.top, r.bottom])])];
  let best = full;
  let area = 0;
  for (const left of xs)
    for (const right of xs)
      for (const top of ys)
        for (const bottom of ys) {
          if (right - left < 80 || bottom - top < 80) continue;
          if (
            obstacles.some(
              (r) => left < r.right && right > r.left && top < r.bottom && bottom > r.top,
            )
          )
            continue;
          const size = (right - left) * (bottom - top);
          if (size > area) {
            best = { left, top, right, bottom };
            area = size;
          }
        }
  return best;
}
