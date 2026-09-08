import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { ReactNode } from "react";

interface Props<T> {
  readonly items: readonly T[];
  readonly rowHeight: number;
  readonly minColumnWidth: number;
  readonly gap: number;
  readonly keyOf: (item: T) => string;
  readonly render: (item: T) => ReactNode;
  readonly empty?: ReactNode;
  /**
   * The item the keyboard is currently on, and how to move it.
   *
   * Supplied together or not at all. With them the grid becomes a single tab
   * stop navigated by arrow keys — which is the only way five hundred cards are
   * usable from a keyboard, because five hundred tab stops is not navigation,
   * it is a wall.
   */
  readonly activeKey?: string;
  readonly onActivate?: (item: T) => void;
  readonly label?: string;
}

/**
 * A windowed grid.
 *
 * §10 sets a target of 500 creatures in the ranch with no frame drops and asks
 * for every list to be virtualised. Five hundred creature drawings is five
 * hundred SVGs of a few hundred nodes each; mounting them all would cost
 * hundreds of thousands of DOM nodes. This mounts the rows on screen plus a
 * small overscan, which keeps the cost flat regardless of herd size.
 *
 * Hand-rolled rather than pulled from a dependency: the whole requirement is
 * forty lines, and a virtualisation library is a lot of surface area to own for
 * one grid.
 */
export function VirtualGrid<T>({
  items,
  rowHeight,
  minColumnWidth,
  gap,
  keyOf,
  render,
  empty,
  activeKey,
  onActivate,
  label,
}: Props<T>) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState({ scrollTop: 0, height: 600, width: 900 });

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = (): void =>
      setMetrics((current) => ({
        ...current,
        height: element.clientHeight,
        width: element.clientWidth,
      }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = Math.max(1, Math.floor((metrics.width + gap) / (minColumnWidth + gap)));
  const rows = Math.ceil(items.length / columns);
  const stride = rowHeight + gap;
  const overscan = 2;
  const firstRow = Math.max(0, Math.floor(metrics.scrollTop / stride) - overscan);
  const lastRow = Math.min(rows, Math.ceil((metrics.scrollTop + metrics.height) / stride) + overscan);
  const visible = items.slice(firstRow * columns, lastRow * columns);

  if (items.length === 0 && empty) return <div className="grid-empty">{empty}</div>;

  const activeIndex = activeKey === undefined ? -1 : items.findIndex((item) => keyOf(item) === activeKey);

  /**
   * Arrow keys move by one and by a row; Home and End jump to the ends.
   *
   * Moving also scrolls the target into view, because a roving focus that lands
   * outside the window is a focus the user has lost.
   */
  const move = (delta: number): void => {
    if (!onActivate || items.length === 0) return;
    const from = activeIndex < 0 ? 0 : activeIndex;
    const to = Math.max(0, Math.min(items.length - 1, from + delta));
    const target = items[to];
    if (!target) return;
    onActivate(target);
    const row = Math.floor(to / columns);
    const element = viewport.current;
    if (!element) return;
    const top = row * stride;
    if (top < element.scrollTop) element.scrollTo({ top });
    else if (top + rowHeight > element.scrollTop + element.clientHeight) {
      element.scrollTo({ top: top + rowHeight - element.clientHeight });
    }
  };

  return (
    <div
      className="virtual-viewport"
      ref={viewport}
      {...(onActivate
        ? {
            role: "grid",
            "aria-label": label,
            "aria-rowcount": rows,
            onKeyDown: (event: React.KeyboardEvent) => {
              const step: Record<string, number> = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: columns,
                ArrowUp: -columns,
                PageDown: columns * 4,
                PageUp: -columns * 4,
              };
              if (event.key in step) {
                event.preventDefault();
                move(step[event.key] as number);
              } else if (event.key === "Home") {
                event.preventDefault();
                move(-items.length);
              } else if (event.key === "End") {
                event.preventDefault();
                move(items.length);
              }
            },
          }
        : {})}
      onScroll={(event) => {
        // Read synchronously. React releases the synthetic event as soon as the
        // handler returns, so reaching for `event.currentTarget` inside the
        // updater — which React may run later, during render — finds null and
        // takes the whole app down mid-scroll.
        const { scrollTop } = event.currentTarget;
        setMetrics((current) => (current.scrollTop === scrollTop ? current : { ...current, scrollTop }));
      }}
    >
      <div style={{ height: Math.max(0, rows * stride - gap), position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: firstRow * stride,
            left: 0,
            right: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap,
          }}
        >
          {visible.map((item) => (
            <div key={keyOf(item)} style={{ height: rowHeight }} role={onActivate ? "gridcell" : undefined}>
              {render(item)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
