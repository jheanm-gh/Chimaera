import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props<T> {
  readonly items: readonly T[];
  readonly rowHeight: number;
  readonly minColumnWidth: number;
  readonly gap: number;
  readonly keyOf: (item: T) => string;
  readonly render: (item: T) => ReactNode;
  readonly empty?: ReactNode;
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

  return (
    <div
      className="virtual-viewport"
      ref={viewport}
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
            <div key={keyOf(item)} style={{ height: rowHeight }}>
              {render(item)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
