import { Crosshair, Loader2, MapPin, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { LatLng } from "./location-picker-client";

// Leaflet needs `window`, so the map only loads in the browser after hydration.
const LocationPickerClient = lazy(() => import("./location-picker-client"));

export type { LatLng };

export function LocationPicker({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (p: LatLng | null) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  // GPS is used only when the resident presses the button (explicit consent).
  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGpsError("Your device does not support location services.");
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. You can tap the map instead."
            : "We couldn't find your location. Tap the map instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Crosshair className="size-4" />
          )}
          Use my current location
        </Button>
        {value && (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary">
              <MapPin className="size-3.5" />
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="size-4" /> Remove pin
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Tap the map where the fault is. Your location is only used for this complaint and is only
        visible to you and the ward office.
      </p>
      {gpsError && <p className="text-sm text-destructive">{gpsError}</p>}
      <div className="isolate h-72 overflow-hidden rounded-lg border bg-muted sm:h-80">
        {mounted ? (
          <Suspense fallback={<div className="h-full animate-pulse bg-muted" />}>
            <LocationPickerClient value={value} onChange={onChange} />
          </Suspense>
        ) : (
          <div className="h-full animate-pulse bg-muted" />
        )}
      </div>
    </div>
  );
}
