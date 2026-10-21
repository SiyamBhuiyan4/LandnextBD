"use client";

import { useQuery } from "convex/react";
import { MapPin, Search } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

export type AreaOption = { _id: Id<"areas">; slug: string; areaName: string; areaNameBn?: string; district: string; division: string; activeCount: number; centerLat: number; centerLng: number };

/** Accessible area autocomplete backed by the areas search index. */
export function AreaCombobox({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  id,
}: {
  value: AreaOption | null;
  onChange: (a: AreaOption | null) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  id?: string;
}) {
  const locale = useLocale();
  const fmt = useFmt();
  const name = (a: AreaOption) => (locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName);
  const [text, setText] = useState(value ? name(value) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState("");
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(text), 150);
    return () => clearTimeout(h);
  }, [text]);
  useEffect(() => {
    setText(value ? name(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?._id, locale]);

  const results = useQuery(api.areas.autocomplete, open ? { q: value && text === name(value) ? "" : debounced, limit: 8 } : "skip");

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (a: AreaOption | null) => {
    onChange(a);
    setText(a ? name(a) : "");
    setOpen(false);
  };

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (!e.target.value) onChange(null);
        }}
        onKeyDown={(e) => {
          const n = results?.length ?? 0;
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => Math.min(i + 1, n - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)));
          else if (e.key === "Enter" && open && results?.[active]) (e.preventDefault(), choose(results[active]));
          else if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "h-11 w-full rounded-xl border bg-background pr-3 pl-9 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
          inputClassName,
        )}
      />
      {open && results && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1.5 max-h-72 w-full min-w-64 overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-elev-4">
          {results.map((a, i) => (
            <li
              key={a._id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => (e.preventDefault(), choose(a))}
              className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm", i === active && "bg-secondary")}
            >
              <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="flex-1">
                <span className="font-medium">{name(a)}</span>
                <span className="text-muted-foreground"> · {a.district}</span>
              </span>
              <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular-nums">{fmt.digits(a.activeCount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
