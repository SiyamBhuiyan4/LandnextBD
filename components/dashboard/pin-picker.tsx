"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function PinPicker({
  center,
  value,
  onChange,
}: {
  center: [number, number];
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
}) {
  return (
    <MapContainer center={value ? [value.lat, value.lng] : center} zoom={14} className="h-72 w-full rounded-xl" style={{ zIndex: 0 }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onPick={(lat, lng) => onChange({ lat, lng })} />
      {!value && <Recenter lat={center[0]} lng={center[1]} />}
      {value && <CircleMarker center={[value.lat, value.lng]} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#e9a93c", fillOpacity: 1 }} />}
    </MapContainer>
  );
}
