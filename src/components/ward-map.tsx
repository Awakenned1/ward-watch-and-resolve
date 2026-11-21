import { lazy, Suspense, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// Leaflet needs `window`, so the map only loads in the browser after hydration.
const WardMapClient = lazy(() => import("./ward-map-client"));

function MapPlaceholder() {
  return <div className="h-full w-full animate-pulse bg-muted" aria-hidden />;
}

export function WardMap({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      className={cn("isolate overflow-hidden rounded-xl border bg-muted", className)}
      role="region"
      aria-label="Map of the Ward 109 area"
    >
      {mounted ? (
        <Suspense fallback={<MapPlaceholder />}>
          <WardMapClient />
        </Suspense>
      ) : (
        <MapPlaceholder />
      )}
    </div>
  );
}
