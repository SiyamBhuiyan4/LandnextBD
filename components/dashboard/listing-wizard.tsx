"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, CheckCircle2, FileText, ImagePlus, Loader2, Star, Trash2, Upload, Video } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FacilityIcon, LandTypeIcons, UtilityIcons } from "@/components/icons";
import { AreaCombobox, type AreaOption } from "@/components/search/area-combobox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFmt } from "@/hooks/use-fmt";
import { useUpload, type UploadJob } from "@/hooks/use-upload";
import { errorMessage } from "@/lib/client";
import { CONFIG, DOCUMENT_TYPES, FACILITIES, FACINGS, LAND_TYPES, UTILITIES, type DocumentType, type Facility, type Facing, type LandType, type Utility } from "@/lib/constants";
import { formatBDT } from "@/lib/format";
import { SIZE_UNITS, toSqft, type SizeUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

const PinPicker = dynamic(() => import("@/components/dashboard/pin-picker"), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-muted" /> });

const STEPS = ["basics", "location", "attributes", "documents", "photos", "videos", "review"] as const;
type Step = (typeof STEPS)[number];

type Form = {
  title: string;
  description: string;
  landType: LandType;
  sizeValue: string;
  sizeUnit: SizeUnit;
  price: string;
  negotiable: boolean;
  area: AreaOption | null;
  exactAddress: string;
  pin: { lat: number; lng: number } | null;
  plotNumber: string;
  sectorBlock: string;
  facing: Facing | "";
  roadWidthFt: string;
  landStatus: "ready" | "under_development";
  hasBoundaryWall: boolean;
  utilities: Utility[];
  nearbyFacilities: Facility[];
  documents: { type: DocumentType; fileId: Id<"media">; verified: boolean; fileName?: string }[];
  images: { mediaId: Id<"media">; url: string }[];
  coverImageId?: Id<"media">;
};

const EMPTY: Form = {
  title: "",
  description: "",
  landType: "residential",
  sizeValue: "",
  sizeUnit: "katha",
  price: "",
  negotiable: true,
  area: null,
  exactAddress: "",
  pin: null,
  plotNumber: "",
  sectorBlock: "",
  facing: "",
  roadWidthFt: "",
  landStatus: "ready",
  hasBoundaryWall: false,
  utilities: [],
  nearbyFacilities: [],
  documents: [],
  images: [],
};

const inputCls = "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block text-sm font-medium", className)}>
      {label}
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Jobs({ jobs }: { jobs: UploadJob[] }) {
  const t = useTranslations("wizard");
  if (!jobs.length) return null;
  return (
    <ul className="space-y-2" aria-live="polite">
      {jobs.map((j) => (
        <li key={j.key} className="text-xs">
          <span className="text-muted-foreground">{t("uploading", { name: j.name })}</span>
          <Progress value={j.pct} className="mt-1" />
        </li>
      ))}
    </ul>
  );
}

function DropZone({ accept, multiple, onFiles, label, icon }: { accept: string; multiple?: boolean; onFiles: (f: File[]) => void; label: string; icon: React.ReactNode }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onClick={() => input.current?.click()}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={cn(
        "grid cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        over ? "border-primary bg-secondary" : "hover:border-primary/50",
      )}
    >
      <span className="text-primary">{icon}</span>
      {label}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function ListingWizard({ listingId: initialId }: { listingId?: Id<"listings"> }) {
  const t = useTranslations("wizard");
  const tc = useTranslations("common");
  const tl = useTranslations("landType");
  const tu = useTranslations("units");
  const tf = useTranslations("facing");
  const tut = useTranslations("utilities");
  const tfa = useTranslations("facilities");
  const td = useTranslations("docs");
  const tls = useTranslations("landStatus");
  const tv = useTranslations("video");
  const tst = useTranslations("status");
  const locale = useLocale();
  const fmt = useFmt();
  const router = useRouter();

  const [listingId, setListingId] = useState<Id<"listings"> | undefined>(initialId);
  const existing = useQuery(api.listings.getForEdit, initialId ? { id: initialId } : "skip");
  const areas = useQuery(api.areas.all);
  const config = useQuery(api.meta.config);
  const videos = useQuery(api.videos.byListing, listingId ? { listingId } : "skip");
  const upsert = useMutation(api.listings.upsert);
  const submit = useMutation(api.listings.submitForReview);
  const registerVideo = useMutation(api.videos.registerUpload);
  const removeVideo = useMutation(api.videos.remove);
  const { upload, jobs } = useUpload();

  const [f, setF] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(!initialId);
  const [step, setStep] = useState<Step>("basics");
  const [saving, setSaving] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  // Hydrate the form when editing.
  useEffect(() => {
    if (!existing || loaded || !areas) return;
    const area = areas.find((a) => a._id === existing.areaId) ?? null;
    setF({
      title: existing.title,
      description: existing.description,
      landType: existing.landType,
      sizeValue: String(existing.sizeValue),
      sizeUnit: existing.sizeUnit,
      price: String(existing.price),
      negotiable: existing.negotiable,
      area,
      exactAddress: existing.exactAddress ?? "",
      pin: existing.lat !== undefined && existing.lng !== undefined ? { lat: existing.lat, lng: existing.lng } : null,
      plotNumber: existing.plotNumber ?? "",
      sectorBlock: existing.sectorBlock ?? "",
      facing: existing.facing ?? "",
      roadWidthFt: existing.roadWidthFt ? String(existing.roadWidthFt) : "",
      landStatus: existing.landStatus,
      hasBoundaryWall: existing.hasBoundaryWall,
      utilities: existing.utilities,
      nearbyFacilities: existing.nearbyFacilities,
      documents: existing.documents.map((d) => ({ type: d.type, fileId: d.fileId, verified: d.verified, fileName: d.fileName })),
      images: existing.images,
      coverImageId: existing.coverImageId,
    });
    setLoaded(true);
  }, [existing, areas, loaded]);

  const stepIndex = STEPS.indexOf(step);

  const missing = (upTo: Step): string[] => {
    const m: string[] = [];
    const i = STEPS.indexOf(upTo);
    if (i >= 0) {
      if (f.title.trim().length < 8) m.push(t("title"));
      if (!(Number(f.sizeValue) > 0)) m.push(t("size"));
      if (!(Number(f.price) > 0)) m.push(t("price"));
    }
    if (i >= 1 && !f.area) m.push(t("area"));
    if (upTo === "review") {
      if (f.description.trim().length < 30) m.push(t("description"));
      if (f.images.length === 0) m.push(t("steps.photos"));
    }
    return m;
  };

  const save = async (quiet = false) => {
    if (!f.area) return false;
    setSaving(true);
    try {
      const res = await upsert({
        id: listingId,
        data: {
          title: f.title,
          description: f.description,
          landType: f.landType,
          sizeValue: Number(f.sizeValue),
          sizeUnit: f.sizeUnit,
          price: Number(f.price),
          negotiable: f.negotiable,
          areaId: f.area._id,
          exactAddress: f.exactAddress || undefined,
          lat: f.pin?.lat,
          lng: f.pin?.lng,
          facing: f.facing || undefined,
          roadWidthFt: f.roadWidthFt ? Number(f.roadWidthFt) : undefined,
          plotNumber: f.plotNumber || undefined,
          sectorBlock: f.sectorBlock || undefined,
          nearbyFacilities: f.nearbyFacilities,
          utilities: f.utilities,
          hasBoundaryWall: f.hasBoundaryWall,
          landStatus: f.landStatus,
          documents: f.documents,
          imageIds: f.images.map((i) => i.mediaId),
          coverImageId: f.coverImageId,
        },
      });
      setListingId(res.id);
      if (!quiet) toast.success(t("draftSaved"));
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goTo = async (target: Step) => {
    const ti = STEPS.indexOf(target);
    if (ti > stepIndex) {
      const m = missing(STEPS[Math.min(ti - 1, 1)] as Step);
      if (m.length) return toast.error(t("missing", { fields: m.join(", ") }));
      // Persist as a draft from the location step onward.
      if (ti >= 2 && !(await save(true))) return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onPhotos = async (files: File[]) => {
    const room = CONFIG.maxImages - f.images.length;
    for (const file of files.slice(0, room)) {
      try {
        const r = await upload(file, "image");
        setF((x) => ({ ...x, images: [...x.images, { mediaId: r.mediaId, url: r.url! }] }));
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
    }
  };

  const onDoc = async (type: DocumentType, file: File) => {
    try {
      const r = await upload(file, "document");
      setF((x) => ({ ...x, documents: [...x.documents.filter((d) => d.type !== type), { type, fileId: r.mediaId, verified: false, fileName: file.name }] }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onVideo = async (files: File[]) => {
    if (!listingId) return;
    for (const file of files.slice(0, 1)) {
      if (file.size > CONFIG.maxVideoBytes) {
        toast.error(`${file.name}: max ${CONFIG.maxVideoBytes / 1024 / 1024} MB`);
        continue;
      }
      try {
        const r = await upload(file, "video");
        await registerVideo({ listingId, mediaId: r.mediaId, title: videoTitle || undefined });
        setVideoTitle("");
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
    }
  };

  const finish = async () => {
    const m = missing("review");
    if (m.length) return toast.error(t("missing", { fields: m.join(", ") }));
    if (!(await save(true)) || !listingId) return;
    const status = existing?.status;
    if (status === "active" || status === "pending_review") {
      toast.success(t("draftSaved"));
      return router.push("/dashboard/listings");
    }
    try {
      await submit({ id: listingId });
      toast.success(t("submitted"));
      router.push("/dashboard/listings");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (initialId && !loaded) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const sqft = Number(f.sizeValue) > 0 ? toSqft(Number(f.sizeValue), f.sizeUnit) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="scrollbar-none flex gap-1 overflow-x-auto lg:flex-col" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button
              type="button"
              onClick={() => goTo(s)}
              aria-current={s === step ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                s === step ? "bg-primary text-primary-foreground" : i < stepIndex ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span className={cn("grid size-6 place-items-center rounded-full border text-xs font-semibold", s === step ? "border-primary-foreground/50" : i < stepIndex && "border-primary bg-primary text-primary-foreground")}>
                {i < stepIndex ? <Check className="size-3.5" /> : fmt.digits(i + 1)}
              </span>
              {t(`steps.${s}`)}
            </button>
          </li>
        ))}
      </ol>

      <div className="min-w-0 rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
        <h2 className="mb-5 font-heading text-xl font-semibold">{t(`steps.${step}`)}</h2>

        {step === "basics" && (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("landType")}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LAND_TYPES.map((lt) => {
                  const Icon = LandTypeIcons[lt];
                  return (
                    <label key={lt} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition", f.landType === lt ? "border-primary bg-secondary font-semibold" : "hover:border-primary/40")}>
                      <input type="radio" name="landType" className="sr-only" checked={f.landType === lt} onChange={() => set({ landType: lt })} />
                      <Icon size={18} className="text-primary" /> {tl(lt)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field label={t("title")} hint={t("titleHint")}>
              <input className={inputCls} value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Field label={t("size")}>
                <input className={inputCls} type="number" inputMode="decimal" min={0} step="any" value={f.sizeValue} onChange={(e) => set({ sizeValue: e.target.value })} />
              </Field>
              <Field label={t("unit")}>
                <select className={inputCls} value={f.sizeUnit} onChange={(e) => set({ sizeUnit: e.target.value as SizeUnit })}>
                  {SIZE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {tu(u)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {sqft > 0 && (
              <p className="-mt-2 text-xs text-muted-foreground">
                = {fmt.sizeIn(sqft, "katha")} · {fmt.sizeIn(sqft, "decimal")} · {fmt.num(sqft, 0)} {tu("sqft")}
              </p>
            )}
            <Field label={t("price")} hint={Number(f.price) > 0 ? `${formatBDT(Number(f.price), { locale: locale === "bn" ? "bn" : "en" })}${sqft ? ` · ${fmt.perUnit(Number(f.price), sqft, "katha")}/${tu("katha")}` : ""}` : undefined}>
              <input className={inputCls} type="number" inputMode="numeric" min={0} value={f.price} onChange={(e) => set({ price: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.negotiable} onChange={(e) => set({ negotiable: e.target.checked })} /> {t("negotiable")}
            </label>
            <Field label={t("description")} hint={t("descriptionHint")}>
              <textarea className={cn(inputCls, "h-36 py-2")} maxLength={5000} value={f.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
          </div>
        )}

        {step === "location" && (
          <div className="space-y-5">
            <Field label={t("area")}>
              <AreaCombobox value={f.area} onChange={(a) => set({ area: a })} placeholder={t("areaPlaceholder")} inputClassName="h-10 rounded-lg" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sectorBlock")}>
                <input className={inputCls} value={f.sectorBlock} maxLength={80} onChange={(e) => set({ sectorBlock: e.target.value })} />
              </Field>
              <Field label={t("plotNumber")}>
                <input className={inputCls} value={f.plotNumber} maxLength={40} onChange={(e) => set({ plotNumber: e.target.value })} />
              </Field>
            </div>
            <Field label={t("exactAddress")} hint={t("exactAddressHint")}>
              <textarea className={cn(inputCls, "h-20 py-2")} maxLength={300} value={f.exactAddress} onChange={(e) => set({ exactAddress: e.target.value })} />
            </Field>
            <div>
              <p className="text-sm font-medium">{t("pinLocation")}</p>
              <p className="mb-2 text-xs text-muted-foreground">{t("pinHint")}</p>
              <PinPicker center={f.area ? [f.area.centerLat, f.area.centerLng] : [23.81, 90.41]} value={f.pin} onChange={(pin) => set({ pin })} />
            </div>
          </div>
        )}

        {step === "attributes" && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("facing")}>
                <select className={inputCls} value={f.facing} onChange={(e) => set({ facing: e.target.value as Facing | "" })}>
                  <option value="">—</option>
                  {FACINGS.map((x) => (
                    <option key={x} value={x}>
                      {tf(x)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("roadWidth")}>
                <input className={inputCls} type="number" min={0} max={500} value={f.roadWidthFt} onChange={(e) => set({ roadWidthFt: e.target.value })} />
              </Field>
              <Field label={t("landStatus")}>
                <select className={inputCls} value={f.landStatus} onChange={(e) => set({ landStatus: e.target.value as Form["landStatus"] })}>
                  <option value="ready">{tls("ready")}</option>
                  <option value="under_development">{tls("under_development")}</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.hasBoundaryWall} onChange={(e) => set({ hasBoundaryWall: e.target.checked })} /> {t("boundaryWall")}
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("utilities")}</legend>
              <div className="flex flex-wrap gap-2">
                {UTILITIES.map((u) => {
                  const Icon = UtilityIcons[u];
                  const on = f.utilities.includes(u);
                  return (
                    <button key={u} type="button" aria-pressed={on} onClick={() => setF((x) => ({ ...x, utilities: toggle(x.utilities, u) }))} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40")}>
                      <Icon size={16} /> {tut(u)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("facilities")}</legend>
              <div className="flex flex-wrap gap-2">
                {FACILITIES.map((x) => {
                  const on = f.nearbyFacilities.includes(x);
                  return (
                    <button key={x} type="button" aria-pressed={on} onClick={() => setF((prev) => ({ ...prev, nearbyFacilities: toggle(prev.nearbyFacilities, x) }))} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40")}>
                      <FacilityIcon facility={x} size={16} /> {tfa(x)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}

        {step === "documents" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("documentsHint")}</p>
            <ul className="space-y-2">
              {DOCUMENT_TYPES.map((type) => {
                const d = f.documents.find((x) => x.type === type);
                return (
                  <li key={type} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                    <FileText className="size-5 text-primary" />
                    <span className="flex-1 text-sm font-medium">
                      {td(type)}
                      {d && <span className="block text-xs font-normal text-muted-foreground">{d.fileName ?? "✓"}</span>}
                    </span>
                    {d?.verified && <CheckCircle2 className="size-4 text-primary" aria-label="Verified" />}
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                      <Upload className="size-4" /> {t("uploadDoc", { type: td(type) })}
                      <input type="file" accept={CONFIG.docMimeTypes.join(",")} className="sr-only" onChange={(e) => e.target.files?.[0] && onDoc(type, e.target.files[0])} />
                    </label>
                    {d && (
                      <Button variant="ghost" size="icon-sm" aria-label={tc("delete")} onClick={() => set({ documents: f.documents.filter((x) => x.type !== type) })}>
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Jobs jobs={jobs} />
          </div>
        )}

        {step === "photos" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("photosHint", { max: fmt.digits(CONFIG.maxImages), mb: fmt.digits(CONFIG.maxImageBytes / 1024 / 1024) })}</p>
            {f.images.length < CONFIG.maxImages && <DropZone accept={CONFIG.imageMimeTypes.join(",")} multiple onFiles={onPhotos} label={t("dropPhotos")} icon={<ImagePlus className="size-8" />} />}
            <Jobs jobs={jobs} />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {f.images.map((img, i) => {
                const isCover = (f.coverImageId ?? f.images[0]?.mediaId) === img.mediaId;
                return (
                  <li key={img.mediaId} className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
                    <Image src={img.url} alt={`Photo ${i + 1}`} fill sizes="240px" className="object-cover" unoptimized />
                    {isCover && <span className="absolute top-2 left-2 rounded-full bg-warm px-2 py-0.5 text-[11px] font-semibold text-warm-foreground">{t("cover")}</span>}
                    <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1.5">
                      {!isCover && (
                        <button type="button" onClick={() => set({ coverImageId: img.mediaId })} className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] text-white" aria-label={t("setCover")}>
                          <Star className="size-3" /> {t("setCover")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => set({ images: f.images.filter((x) => x.mediaId !== img.mediaId), coverImageId: isCover ? undefined : f.coverImageId })}
                        className="grid size-7 place-items-center rounded-full bg-black/65 text-white"
                        aria-label={tc("delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {step === "videos" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("videosHint", { mb: fmt.digits(config?.limits.maxVideoMB ?? 20), min: fmt.digits((config?.limits.maxVideoDurationSec ?? 300) / 60) })}
            </p>
            {!listingId ? (
              <p className="rounded-lg bg-muted p-3 text-sm">{t("videosNeedDraft")}</p>
            ) : (
              <>
                <Field label={t("videoTitle")}>
                  <input className={inputCls} value={videoTitle} maxLength={120} onChange={(e) => setVideoTitle(e.target.value)} />
                </Field>
                {(videos?.length ?? 0) < CONFIG.maxVideosPerListing && <DropZone accept={CONFIG.videoMimeTypes.join(",")} onFiles={onVideo} label={t("dropVideo")} icon={<Video className="size-8" />} />}
                <Jobs jobs={jobs} />
                <ul className="space-y-2">
                  {videos?.map((v) => (
                    <li key={v._id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                      <Video className="size-5 text-primary" />
                      <span className="flex-1">
                        <span className="font-medium">{v.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {v.status === "ready" ? (v.moderation === "pending" ? tv("pendingModeration") : `✓ ${fmt.duration(v.durationSec)}`) : v.status === "failed" ? `${tv("failed")}${v.errorMessage ? `: ${v.errorMessage}` : ""}` : tv("processing")}
                        </span>
                      </span>
                      {v.status === "processing" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      <Button variant="ghost" size="icon-sm" aria-label={tc("delete")} onClick={() => removeVideo({ id: v._id })}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{t("reviewNote")}</p>
            {existing?.status && (
              <p>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">{tst(existing.status)}</span>
                {existing.rejectionReason && <span className="ml-2 text-destructive">{existing.rejectionReason}</span>}
              </p>
            )}
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {[
                [t("title"), f.title],
                [t("landType"), tl(f.landType)],
                [t("size"), Number(f.sizeValue) > 0 ? fmt.size(Number(f.sizeValue), f.sizeUnit) : "—"],
                [t("price"), Number(f.price) > 0 ? fmt.price(Number(f.price)) : "—"],
                [t("area"), f.area ? `${f.area.areaName}, ${f.area.district}` : "—"],
                [t("facing"), f.facing ? tf(f.facing) : "—"],
                [t("roadWidth"), f.roadWidthFt || "—"],
                [t("steps.documents"), fmt.digits(f.documents.length)],
                [t("steps.photos"), fmt.digits(f.images.length)],
                [t("steps.videos"), fmt.digits(videos?.length ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b py-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="line-clamp-4 whitespace-pre-line text-muted-foreground">{f.description}</p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-5">
          <Button variant="outline" onClick={() => goTo(STEPS[stepIndex - 1])} disabled={stepIndex === 0}>
            {tc("back")}
          </Button>
          <div className="flex gap-2">
            {f.area && (
              <Button variant="ghost" onClick={() => save()} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />} {t("saveDraft")}
              </Button>
            )}
            {step === "review" ? (
              <Button onClick={finish} disabled={saving} className="bg-warm text-warm-foreground hover:bg-warm/90">
                {existing?.status === "active" || existing?.status === "pending_review" ? t("saveDraft") : t("submit")}
              </Button>
            ) : (
              <Button onClick={() => goTo(STEPS[stepIndex + 1])} disabled={saving || jobs.length > 0}>
                {saving && <Loader2 className="animate-spin" />} {tc("next")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
