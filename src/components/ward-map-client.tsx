import "leaflet/dist/leaflet.css";

import type { GeoJsonObject } from "geojson";
import type { LatLngBoundsExpression } from "leaflet";
import { useEffect, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";

import { WARD_BOUNDARY } from "@/lib/ward109";

// Approximate Ward 109 extent, used until the boundary file loads.
const INITIAL_BOUNDS: LatLngBoundsExpression = [
  [-26.0982, 28.0636],
  [-26.0398, 28.1144],
];

export default function WardMapClient() {
  const [boundary, setBoundary] = useState<GeoJsonObject | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(WARD_BOUNDARY.url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: GeoJsonObject) => !cancelled && setBoundary(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        bounds={INITIAL_BOUNDS}
        boundsOptions={{ padding: [16, 16] }}
        scrollWheelZoom={false}
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Ward boundary &copy; Municipal Demarcation Board 2026'
          maxZoom={19}
        />
        {boundary && (
          <GeoJSON
            data={boundary}
            style={{
              color: "#123B63",
              weight: 3,
              fillColor: "#008C95",
              fillOpacity: 0.18,
            }}
          />
        )}
      </MapContainer>
      {failed && (
        <p className="absolute inset-x-3 bottom-3 z-[500] rounded-md bg-background/95 p-2 text-center text-sm text-destructive shadow">
          The ward boundary could not be loaded.
        </p>
      )}
    </div>
  );
}
