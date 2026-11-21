import "leaflet/dist/leaflet.css";

import { Link } from "@tanstack/react-router";
import type { GeoJsonObject } from "geojson";
import type { LatLngBoundsExpression } from "leaflet";
import { useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from "react-leaflet";

import { pointColor, type MapPoint } from "@/lib/map-points";
import { STATUS_INFO, WARD_BOUNDARY } from "@/lib/ward109";

const WARD_BOUNDS: LatLngBoundsExpression = [
  [-26.0982, 28.0636],
  [-26.0398, 28.1144],
];

export default function ComplaintMapClient({ points }: { points: MapPoint[] }) {
  const [boundary, setBoundary] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(WARD_BOUNDARY.url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: GeoJsonObject) => !cancelled && setBoundary(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MapContainer
      bounds={WARD_BOUNDS}
      boundsOptions={{ padding: [12, 12] }}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Ward boundary &copy; MDB 2026'
        maxZoom={19}
      />
      {boundary && (
        <GeoJSON
          data={boundary}
          style={{ color: "#123B63", weight: 2.5, fillColor: "#008C95", fillOpacity: 0.08 }}
          interactive={false}
        />
      )}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={p.priority === "critical" ? 9 : 7}
          pathOptions={{
            color: "#fff",
            weight: 2,
            fillColor: pointColor(p),
            fillOpacity: 0.95,
          }}
        >
          <Popup>
            <div className="min-w-[180px] space-y-1 text-sm">
              <Link
                to="/reports/$id"
                params={{ id: p.id }}
                className="font-mono font-semibold text-primary hover:underline"
              >
                {p.tracking}
              </Link>
              <p className="font-medium">{p.title}</p>
              {p.place && <p className="text-xs text-muted-foreground">{p.place}</p>}
              <p className="text-xs">{STATUS_INFO[p.status].label}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
