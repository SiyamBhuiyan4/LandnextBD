"use client";

import "leaflet/dist/leaflet.css";
import { useQuery } from "convex/react";
import L from "leaflet";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { api } from "@/convex/_generated/api";
import { useFmt } from "@/hooks/use-fmt";
import type { Id } from "@/convex/_generated/dataModel";
import type { ListingFilters } from "@/lib/constants";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

type Bounds = { south: number; west: number; north: number; east: number };

function BoundsWatcher({ onChange }: { onChange: (b: Bounds) => void }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });
  const emit = () => {
    const b = map.getBounds();
    onChange({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  };
  useEffect(() => emit(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [center, map]);
  return null;
}

/** Map with price pins from a geohash-indexed bounding-box query, synced with a side list. */
export default function MapView({
  center,
  zoom = 11,
  filters,
}: {
  center: [number, number];
  zoom?: number;
  /** The browse filters (minus sort); every one of them also applies to the pins. */
  filters: ListingFilters & { areaId?: Id<"areas"> };
}) {
  const t = useTranslations("browse");
  const tl = useTranslations("landType");
  const fmt = useFmt();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [debounced, setDebounced] = useState<Bounds | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fly, setFly] = useState<[number, number] | null>(null);
  const markers = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    const h = setTimeout(() => setDebounced(bounds), 250);
    return () => clearTimeout(h);
  }, [bounds]);

  const pins = useQuery(api.listings.inBounds, debounced ? { ...debounced, filters } : "skip");

  const icon = useMemo(
    () => (label: string, active: boolean) =>
      L.divIcon({
        className: "",
        html: `<span style="display:inline-block;transform:translate(-50%,-100%);white-space:nowrap;padding:4px 9px;border-radius:999px;font:700 12px/1.2 var(--font-jakarta),sans-serif;box-shadow:var(--elev-2);border:1.5px solid rgba(255,255,255,.85);background:${active ? "var(--warm)" : "var(--primary)"};color:${active ? "var(--warm-foreground)" : "var(--primary-foreground)"}">${label}</span>`,
        iconSize: [0, 0],
      }),
    [],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <ul className="order-2 max-h-[70vh] space-y-2 overflow-y-auto lg:order-1" aria-label={t("results", { count: pins?.length ?? 0 })}>
        {pins?.map((p) => (
          <li key={p._id}>
            <button
              type="button"
              onMouseEnter={() => setSelected(p._id)}
              onClick={() => {
                setSelected(p._id);
                setFly([p.lat, p.lng]);
                markers.current.get(p._id)?.openPopup();
              }}
              className={cn(
                "w-full rounded-xl border bg-card p-3 text-left shadow-elev-1 transition hover:border-primary/50",
                selected === p._id && "border-primary ring-1 ring-primary",
              )}
            >
              <p className="line-clamp-1 text-sm font-semibold">{p.title}</p>
              <p className="text-xs text-muted-foreground">
                {tl(p.landType)} · {fmt.size(p.sizeValue, p.sizeUnit)}
              </p>
              <p className="mt-1 font-heading font-extrabold text-price">{fmt.price(p.price)}</p>
            </button>
          </li>
        ))}
        {pins?.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("emptyTitle")}</li>}
      </ul>
      <div className="order-1 overflow-hidden rounded-2xl border shadow-elev-2 lg:order-2">
        <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-[55vh] w-full lg:h-[70vh]" style={{ zIndex: 0 }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <BoundsWatcher onChange={setBounds} />
          <FlyTo center={fly} />
          {pins?.map((p) => (
            <Marker
              key={p._id}
              position={[p.lat, p.lng]}
              icon={icon(fmt.price(p.price), selected === p._id)}
              eventHandlers={{ click: () => setSelected(p._id) }}
              ref={(m) => {
                if (m) markers.current.set(p._id, m);
              }}
            >
              <Popup>
                <Link href={listingHref(p)} className="block max-w-56 text-sm font-semibold">
                  {p.title}
                </Link>
                <span className="text-xs">{fmt.price(p.price)}</span>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <p className="border-t bg-card px-3 py-2 text-xs text-muted-foreground">{t("mapHint")}</p>
      </div>
    </div>
  );
}
