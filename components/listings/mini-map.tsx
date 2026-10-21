"use client";

import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, MapContainer, TileLayer } from "react-leaflet";

/** Small static map. `approx` draws a ~600 m circle instead of a pin. */
export default function MiniMap({ lat, lng, approx }: { lat: number; lng: number; approx: boolean }) {
  return (
    <MapContainer center={[lat, lng]} zoom={approx ? 14 : 16} scrollWheelZoom={false} className="h-64 w-full" style={{ zIndex: 0 }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {approx ? (
        <Circle center={[lat, lng]} radius={600} pathOptions={{ color: "#1f6b4f", fillColor: "#1f6b4f", fillOpacity: 0.18 }} />
      ) : (
        <CircleMarker center={[lat, lng]} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#e9a93c", fillOpacity: 1 }} />
      )}
    </MapContainer>
  );
}
