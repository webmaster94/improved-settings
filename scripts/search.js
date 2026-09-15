/** Literal, accent-insensitive search. All words must match, in any order. */
export function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

export function terms(query) {
  return normalize(query).split(/\s+/u).filter(Boolean);
}

export function matches(text, query) {
  const haystack = normalize(text);
  return terms(query).every(word => haystack.includes(word));
}

/** Coordinates are viewport pixels; callers convert to the application's scale. */
export function beside(parent, child, viewport, { gap = 12, margin = 8, minWidth = 340 } = {}) {
  const leftSpace = Math.max(0, parent.left - gap - margin);
  const rightSpace = Math.max(0, viewport.width - parent.right - gap - margin);
  const side = rightSpace >= leftSpace ? "right" : "left";
  const space = Math.max(leftSpace, rightSpace);
  const width = Math.min(child.width, Math.max(minWidth, space), viewport.width - 2 * margin);
  const height = Math.min(child.height, viewport.height - 2 * margin);
  const preferred = side === "right" ? parent.right + gap : parent.left - gap - width;
  return {
    side, width, height,
    left: Math.max(margin, Math.min(preferred, viewport.width - width - margin)),
    top: Math.max(margin, Math.min(parent.top, viewport.height - height - margin)),
    overlaps: space < width
  };
}
