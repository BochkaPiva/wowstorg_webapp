/** Scroll the table and its enclosing workspace while a pointer drag stays near an edge. */
export function startEstimateEdgeScroll(source: HTMLElement, x: number, y: number, onFrame: (x: number, y: number) => void) {
  let pointerX = x, pointerY = y, frame = 0, stopped = false;
  const ancestors: HTMLElement[] = [];
  for (let node = source.parentElement; node; node = node.parentElement) ancestors.push(node);
  const scrollables = ancestors.map((node) => {
    const style = getComputedStyle(node);
    return {node, horizontal: /auto|scroll/.test(style.overflowX), vertical: /auto|scroll/.test(style.overflowY)};
  }).filter((item) => item.horizontal || item.vertical);
  const speed = (value: number, min: number, max: number) => value < min + 48
    ? -Math.min(20, Math.max(0, (min + 48 - value) / 3))
    : value > max - 48 ? Math.min(20, Math.max(0, (value - max + 48) / 3)) : 0;
  const move = (event: PointerEvent) => { pointerX = event.clientX; pointerY = event.clientY; };
  const tick = () => {
    if (stopped) return;
    let verticalHandled = false, horizontalHandled = false;
    for (const {node, horizontal, vertical} of scrollables) {
      const rect = node.getBoundingClientRect();
      if (!horizontalHandled && horizontal && node.scrollWidth > node.clientWidth) {
        node.scrollLeft += speed(pointerX, Math.max(0, rect.left), Math.min(innerWidth, rect.right)); horizontalHandled = true;
      }
      if (!verticalHandled && vertical && node.scrollHeight > node.clientHeight) {
        const before = node.scrollTop;
        node.scrollTop += speed(pointerY, Math.max(100, rect.top), Math.min(innerHeight, rect.bottom));
        verticalHandled = before !== node.scrollTop;
      }
    }
    if (!verticalHandled) window.scrollBy(0, speed(pointerY, 100, innerHeight));
    const viewport = scrollables.find((item) => item.vertical)?.node;
    const bounds = viewport?.getBoundingClientRect();
    // Hit-test inside the sheet even when the pointer is being held beyond its edge.
    onFrame(
      Math.max(bounds ? Math.max(1, bounds.left + 2) : 1, Math.min(bounds ? Math.min(innerWidth - 2, bounds.right - 2) : innerWidth - 2, pointerX)),
      Math.max(bounds ? Math.max(101, bounds.top + 34) : 101, Math.min(bounds ? Math.min(innerHeight - 2, bounds.bottom - 2) : innerHeight - 2, pointerY)),
    );
    frame = requestAnimationFrame(tick);
  };
  window.addEventListener("pointermove", move, { passive: true });
  frame = requestAnimationFrame(tick);
  return () => { stopped = true; cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); };
}
