import { lazy, Suspense, useEffect, useState } from "react";

import { MAP_LEGEND, type MapPoint } from "@/lib/map-points";
import { cn } from "@/lib/utils";

// Leaflet needs `window`, so the map only loads in the browser after hydration.
const ComplaintMapClient = lazy(() => import("./complaint-map-client"));

export function ComplaintMap({ points, className }: { points: MapPoint[]; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      className={cn("isolate overflow-hidden rounded-lg border bg-muted", className)}
      role="region"
      aria-label="Map of complaints in Ward 109"
    >
      {mounted ? (
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
          <ComplaintMapClient points={points} />
        </Suspense>
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
      )}
    </div>
  );
}

export function MapLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {MAP_LEGEND.map((l) => (
        <li key={l.label} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full ring-2 ring-white"
            style={{ backgroundColor: l.color }}
          />
          {l.label}
        </li>
      ))}
    </ul>
  );
}
