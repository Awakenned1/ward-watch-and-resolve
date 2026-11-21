import "leaflet/dist/leaflet.css";

import type { GeoJsonObject } from "geojson";
import type { LatLngBoundsExpression } from "leaflet";
import { useEffect, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { WARD_BOUNDARY } from "@/lib/ward109";

export type LatLng = { lat: number; lng: number };

const WARD_BOUNDS: LatLngBoundsExpression = [
  [-26.0982, 28.0636],
  [-26.0398, 28.1144],
];

function ClickToPin({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

function FollowPin({ value }: { value: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 16));
  }, [map, value]);
  return null;
}

export default function LocationPickerClient({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
}) {
  const [boundary, setBoundary] = useState<GeoJsonObject | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(WARD_BOUNDARY.url)
      .then((r) => (r.ok ? r.json() : null))
      .then((g: GeoJsonObject | null) => !cancelled && setBoundary(g))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MapContainer bounds={WARD_BOUNDS} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Boundary &copy; MDB 2026'
        maxZoom={19}
      />
      {boundary && (
        <GeoJSON
          data={boundary}
          interactive={false}
          style={{ color: "#123B63", weight: 2, fillColor: "#008C95", fillOpacity: 0.08 }}
        />
      )}
      {value && (
        <CircleMarker
          center={[value.lat, value.lng]}
          radius={10}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#DC2626", fillOpacity: 1 }}
        />
      )}
      <ClickToPin onPick={onChange} />
      <FollowPin value={value} />
    </MapContainer>
  );
}
