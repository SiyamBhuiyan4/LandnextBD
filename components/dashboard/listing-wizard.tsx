"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, CloudOff, FileText, Loader2, MapPin, PartyPopper, Plus, Sparkles, Upload, Wand2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FacilityIcon, LandTypeIcons, UtilityIcons } from "@/components/icons";
import { AreaCombobox, type AreaOption } from "@/components/search/area-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { PhotoUploader, VideoUploader, formatBytes, uploadError, useFileQueue, type ServerVideo } from "@/components/dashboard/media-uploader";
import { useFmt } from "@/hooks/use-fmt";
import { useUpload } from "@/hooks/use-upload";
import { errorMessage, readLocal, writeLocal } from "@/lib/client";
import { CONFIG, DOCUMENT_TYPES, FACILITIES, FACINGS, LAND_TYPES, UTILITIES, type DocumentType, type Facility, type Facing, type LandType, type Utility } from "@/lib/constants";
import { toSqft, type SizeUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

const PinPicker = dynamic(() => import("@/components/dashboard/pin-picker"), { ssr: false, loading: () => <div className="h-72 skeleton rounded-xl" /> });

const STEPS = ["land", "media", "details", "review"] as const;
type Step = (typeof STEPS)[number];
const UNIT_CHOICES: SizeUnit[] = ["katha", "decimal", "bigha", "acre", "sqft"];
const DRAFT_KEY = "lnb_wizard_draft";
const UNIT_KEY = "lnb_wizard_unit";
const stepKey = (id: string) => `lnb_wizard_step_${id}`;
const MIN_TITLE = 8;
const MIN_DESC = 30;

type Form = {
  title: string;
  description: string;
  landType: LandType;
  sizeValue: string;
  sizeUnit: SizeUnit;
  priceInput: string;
  priceMode: "total" | "perUnit";
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
};

const EMPTY: Form = {
  title: "",
  description: "",
  landType: "residential",
  sizeValue: "",
  sizeUnit: "katha",
  priceInput: "",
  priceMode: "total",
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

type LocalDraft = { v: 1; listingId?: Id<"listings">; f: Form; step: Step; at: number };

/** Accepts Bangla digits, commas and spaces ("৪৫,০০,০০০" → 4500000). */
function toNum(s: string): number {
  const ascii = s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[,\s]/g, "");
  if (!ascii) return NaN;
  return Number(ascii);
}

const sizeSqftOf = (f: Form) => (toNum(f.sizeValue) > 0 ? toSqft(toNum(f.sizeValue), f.sizeUnit) : 0);
const totalPriceOf = (f: Form) => {
  const p = toNum(f.priceInput);
  if (!(p > 0)) return 0;
  return f.priceMode === "total" ? p : Math.round(p * (toNum(f.sizeValue) || 0));
};

type FieldKey = "title" | "size" | "price" | "area" | "description" | "photos";
const STEP_FIELDS: Record<Step, FieldKey[]> = { land: ["area", "size", "price", "title"], media: ["photos"], details: ["description"], review: [] };

function problems(f: Form): Partial<Record<FieldKey, true>> {
  const p: Partial<Record<FieldKey, true>> = {};
  if (f.title.trim().length < MIN_TITLE) p.title = true;
  if (!(toNum(f.sizeValue) > 0)) p.size = true;
  if (!(totalPriceOf(f) > 0)) p.price = true;
  if (!f.area) p.area = true;
  if (f.description.trim().length < MIN_DESC) p.description = true;
  if (f.images.length === 0) p.photos = true;
  return p;
}
const canSaveDraft = (f: Form) => {
  const p = problems(f);
  return !p.title && !p.size && !p.price && !p.area;
};

const inputCls =
  "h-12 w-full rounded-xl border bg-background px-3.5 text-base outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:h-11 sm:text-[15px]";

function Field({ label, hint, error, children, className, optional, htmlFor }: { label: string; hint?: React.ReactNode; error?: string | false; children: React.ReactNode; className?: string; optional?: boolean; htmlFor?: string }) {
  const tc = useTranslations("common");
  return (
    <div className={cn("block", className)}>
      <label htmlFor={htmlFor} className="text-[15px] font-semibold">
        {label}
        {optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({tc("optional")})</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" /> {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function Chip({ on, onClick, children, role = "checkbox" }: { on: boolean; onClick: () => void; children: React.ReactNode; role?: "checkbox" | "radio" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50")}
    >
      {on && role === "checkbox" && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

export function ListingWizard({ listingId: initialId }: { listingId?: Id<"listings"> }) {
  const t = useTranslations("wizard");
  const tm = useTranslations("wizard.media");
  const tc = useTranslations("common");
  const tl = useTranslations("landType");
  const tu = useTranslations("units");
  const tf = useTranslations("facing");
  const tut = useTranslations("utilities");
  const tfa = useTranslations("facilities");
  const td = useTranslations("docs");
  const tls = useTranslations("landStatus");
  const tst = useTranslations("status");
  const fmt = useFmt();
  const router = useRouter();

  const [listingId, setListingId] = useState<Id<"listings"> | undefined>(initialId);
  const existing = useQuery(api.listings.getForEdit, initialId ? { id: initialId } : "skip");
  const areas = useQuery(api.areas.all);
  const videos = useQuery(api.videos.byListing, listingId ? { listingId } : "skip");
  const upsert = useMutation(api.listings.upsert);
  const submit = useMutation(api.listings.submitForReview);
  const registerVideo = useMutation(api.videos.registerUpload);
  const removeVideo = useMutation(api.videos.remove);
  const { upload, jobs } = useUpload();

  const [f, setF] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(!initialId);
  const [step, setStep] = useState<Step>("land");
  const [tried, setTried] = useState<Partial<Record<Step, boolean>>>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [saveState, setSaveState] = useState<{ s: "idle" | "pending" | "saving" | "saved" | "error"; msg?: string }>({ s: initialId ? "saved" : "idle" });
  const [resume, setResume] = useState<LocalDraft | null>(null);
  const [done, setDone] = useState<null | "submitted" | "saved">(null);
  const [finishing, setFinishing] = useState(false);
  const [docBusy, setDocBusy] = useState<DocumentType | null>(null);

  // Latest values for async work (autosave chain, upload workers).
  const fRef = useRef(f);
  const idRef = useRef(listingId);
  const dirty = useRef(false);
  useEffect(() => {
    fRef.current = f;
    idRef.current = listingId;
  });

  const update = useCallback((patch: Partial<Form> | ((x: Form) => Partial<Form>)) => {
    dirty.current = true;
    setF((x) => ({ ...x, ...(typeof patch === "function" ? patch(x) : patch) }));
  }, []);

  // --- Load: existing listing (edit) or an unfinished local draft (new). ---
  useEffect(() => {
    if (initialId) return;
    const d = readLocal<LocalDraft | null>(DRAFT_KEY, null);
    if (d?.v === 1 && (d.listingId || d.f.title || d.f.area)) setResume(d);
    const unit = readLocal<SizeUnit | null>(UNIT_KEY, null);
    if (unit && UNIT_CHOICES.includes(unit)) setF((x) => ({ ...x, sizeUnit: unit }));
  }, [initialId]);

  useEffect(() => {
    if (!existing || loaded || !areas) return;
    const area = areas.find((a) => a._id === existing.areaId) ?? null;
    const cover = existing.coverImageId;
    const images = [...existing.images].sort((a, b) => Number(b.mediaId === cover) - Number(a.mediaId === cover));
    setF({
      title: existing.title,
      description: existing.description,
      landType: existing.landType,
      sizeValue: String(existing.sizeValue),
      sizeUnit: existing.sizeUnit,
      priceInput: String(existing.price),
      priceMode: "total",
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
      images,
    });
    const last = readLocal<Step | null>(stepKey(existing._id), null);
    if (last && STEPS.includes(last)) setStep(last);
    setLoaded(true);
  }, [existing, areas, loaded]);

  // --- Saving: one upsert at a time; each run reads the latest form. ---
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const lastErr = useRef<string | undefined>(undefined);
  const reReview = useRef(false);
  // Live listings are not autosaved: every save is explicit, because text/photo
  // changes send the listing back to review.
  const isLive = existing?.status === "active";
  const doSave = useCallback(async (): Promise<boolean> => {
    const x = fRef.current;
    if (!canSaveDraft(x) || !x.area) return false;
    setSaveState({ s: "saving" });
    try {
      const res = await upsert({
        id: idRef.current,
        data: {
          title: x.title.trim(),
          description: x.description,
          landType: x.landType,
          sizeValue: toNum(x.sizeValue),
          sizeUnit: x.sizeUnit,
          price: totalPriceOf(x),
          negotiable: x.negotiable,
          areaId: x.area._id,
          exactAddress: x.exactAddress.trim() || undefined,
          lat: x.pin?.lat,
          lng: x.pin?.lng,
          facing: x.facing || undefined,
          roadWidthFt: toNum(x.roadWidthFt) > 0 ? toNum(x.roadWidthFt) : undefined,
          plotNumber: x.plotNumber.trim() || undefined,
          sectorBlock: x.sectorBlock.trim() || undefined,
          nearbyFacilities: x.nearbyFacilities,
          utilities: x.utilities,
          hasBoundaryWall: x.hasBoundaryWall,
          landStatus: x.landStatus,
          documents: x.documents,
          imageIds: x.images.map((i) => i.mediaId),
          coverImageId: x.images[0]?.mediaId,
        },
      });
      idRef.current = res.id;
      if (res.reReview) reReview.current = true;
      setListingId(res.id);
      setSaveState({ s: "saved" });
      return true;
    } catch (e) {
      lastErr.current = errorMessage(e);
      setSaveState({ s: "error", msg: lastErr.current });
      return false;
    }
  }, [upsert]);
  const persist = useCallback(() => (chain.current = chain.current.then(doSave, doSave)), [doSave]);

  // Autosave: local copy immediately (new listings), server draft after a short pause.
  useEffect(() => {
    if (!loaded || !dirty.current || done) return;
    if (!initialId) writeLocal(DRAFT_KEY, { v: 1, listingId, f, step, at: Date.now() } satisfies LocalDraft);
    if (isLive) {
      setSaveState({ s: "idle" });
      return;
    }
    if (!canSaveDraft(f)) return;
    setSaveState({ s: "pending" });
    const h = setTimeout(() => void persist(), 1200);
    return () => clearTimeout(h);
  }, [f, loaded, done, initialId, listingId, step, persist, isLive]);

  // Unsaved edits to a live listing would be lost on leave.
  const liveUnsaved = isLive && saveState.s === "idle" && !done; // "idle" is only set after an edit
  useEffect(() => {
    if (!liveUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [liveUnsaved]);

  useEffect(() => {
    if (listingId) writeLocal(stepKey(listingId), step);
  }, [listingId, step]);

  // --- Uploads ---
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const photoQ = useFileQueue(async (item) => {
    const r = await upload(item.file, "image");
    if (item.preview) setPreviews((p) => ({ ...p, [r.mediaId]: item.preview! }));
    update((x) => ({ images: [...x.images, { mediaId: r.mediaId, url: r.url ?? item.preview! }] }));
  });
  const videoQ = useFileQueue(async (item, patch) => {
    if (!idRef.current) await persist();
    if (!idRef.current) throw new Error(t("videosNeedDraft"));
    const r = await upload(item.file, "video");
    patch({ status: "saving" });
    await registerVideo({ listingId: idRef.current, mediaId: r.mediaId, title: item.name.replace(/\.\w+$/, "").slice(0, 120) || undefined });
  });
  const uploading = photoQ.busy || videoQ.busy || docBusy !== null;
  const uploadCount = photoQ.items.filter((x) => x.status !== "failed").length + videoQ.items.filter((x) => x.status !== "failed").length + (docBusy ? 1 : 0);

  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const onPhotos = (files: File[]) => {
    const imgs = files.filter((file) => {
      if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|heic)$/i.test(file.name)) return true;
      toast.error(tm("notImage", { name: file.name }));
      return false;
    });
    const room = CONFIG.maxImages - fRef.current.images.length - photoQ.items.filter((x) => x.status !== "failed").length;
    if (imgs.length > room) toast.error(tm("tooManyPhotos", { max: fmt.digits(CONFIG.maxImages), n: fmt.digits(imgs.length - Math.max(0, room)) }));
    photoQ.add(imgs.slice(0, Math.max(0, room)).map((file) => ({ file, preview: URL.createObjectURL(file) })));
  };

  const onVideos = async (files: File[]) => {
    const used = (videos?.filter((v) => v.status !== "failed").length ?? 0) + videoQ.items.filter((x) => x.status !== "failed").length;
    let room = CONFIG.maxVideosPerListing - used;
    const accepted: { file: File; durationSec?: number }[] = [];
    for (const file of files) {
      const typeOk = (CONFIG.videoMimeTypes as readonly string[]).includes(file.type) || (!file.type && /\.(mp4|mov|webm)$/i.test(file.name));
      if (!typeOk) {
        toast.error(tm("notVideo", { name: file.name }));
        continue;
      }
      if (file.size > CONFIG.maxVideoBytes) {
        toast.error(tm("videoTooBig", { name: file.name, size: formatBytes(file.size, fmt.digits), max: formatBytes(CONFIG.maxVideoBytes, fmt.digits) }));
        continue;
      }
      const durationSec = await probeDuration(file);
      if (durationSec && durationSec > CONFIG.maxVideoDurationSec + 1) {
        toast.error(tm("videoTooLong", { name: file.name, len: fmt.duration(durationSec), min: fmt.digits(Math.round(CONFIG.maxVideoDurationSec / 60)) }));
        continue;
      }
      if (room <= 0) {
        toast.error(tm("tooManyVideos", { max: fmt.digits(CONFIG.maxVideosPerListing) }));
        break;
      }
      room--;
      accepted.push({ file, durationSec });
    }
    videoQ.add(accepted);
  };

  const onDoc = async (type: DocumentType, file: File) => {
    setDocBusy(type);
    try {
      const r = await upload(file, "document");
      update((x) => ({ documents: [...x.documents.filter((d) => d.type !== type), { type, fileId: r.mediaId, verified: false, fileName: file.name }] }));
    } catch (e) {
      toast.error(`${file.name}: ${uploadError(e)}`);
    } finally {
      setDocBusy(null);
    }
  };

  // --- Navigation ---
  const stepIndex = STEPS.indexOf(step);
  const prob = problems(f);
  const show = (k: FieldKey) => !!prob[k] && (touched[k] || STEPS.some((s) => tried[s] && STEP_FIELDS[s].includes(k)));
  const stepOk = (s: Step) => STEP_FIELDS[s].every((k) => !prob[k] || (k === "photos" && photoQ.busy));
  const furthest = STEPS.findIndex((s) => !stepOk(s));
  const reachable = (i: number) => i <= stepIndex || furthest === -1 || i <= furthest;

  const goTo = async (target: Step) => {
    const ti = STEPS.indexOf(target);
    if (ti > stepIndex) {
      for (const s of STEPS.slice(0, ti)) {
        if (!stepOk(s)) {
          setTried((x) => ({ ...x, [s]: true }));
          if (s !== step) setStep(s);
          toast.error(t("fixFirst"));
          return;
        }
      }
      // The first step creates the draft so photos and videos can attach to it.
      if (stepIndex === 0 && !isLive && !(await persist())) return toast.error(lastErr.current ?? t("saveFailed"));
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finish = async () => {
    setTried({ land: true, media: true, details: true });
    const missing = STEPS.filter((s) => !stepOk(s));
    if (missing.length) return toast.error(t("fixFirst"));
    setFinishing(true);
    try {
      reReview.current = false;
      if (!(await persist()) || !idRef.current) return toast.error(lastErr.current ?? t("saveFailed"));
      const status = existing?.status;
      if (reReview.current) {
        setDone("submitted");
      } else if (status === "active" || status === "pending_review") {
        setDone("saved");
      } else {
        await submit({ id: idRef.current });
        setDone("submitted");
      }
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(stepKey(idRef.current));
      } catch {
        /* storage unavailable */
      }
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setFinishing(false);
    }
  };

  const saveAndExit = async () => {
    if (isLive) return finish();
    if (canSaveDraft(fRef.current) && !(await persist())) return;
    router.push("/dashboard/listings");
  };

  // --- Smart helpers ---
  const sqft = sizeSqftOf(f);
  const total = totalPriceOf(f);
  const unitLabel = tu(f.sizeUnit);
  const suggestedTitle = useMemo(() => {
    if (!(toNum(f.sizeValue) > 0) || !f.area) return "";
    return t("suggestedTitle", { size: fmt.size(toNum(f.sizeValue), f.sizeUnit), type: tl(f.landType), area: fmt.locale === "bn" ? (f.area.areaNameBn ?? f.area.areaName) : f.area.areaName });
  }, [f.sizeValue, f.sizeUnit, f.area, f.landType, fmt, t, tl]);

  const writeDescription = () => {
    const area = f.area ? (fmt.locale === "bn" ? (f.area.areaNameBn ?? f.area.areaName) : f.area.areaName) : "";
    const parts = [t("auto.intro", { size: toNum(f.sizeValue) > 0 ? fmt.size(toNum(f.sizeValue), f.sizeUnit) : "", type: tl(f.landType), area })];
    if (f.facing) parts.push(t("auto.facing", { facing: tf(f.facing) }));
    if (toNum(f.roadWidthFt) > 0) parts.push(t("auto.road", { width: fmt.digits(toNum(f.roadWidthFt)) }));
    if (f.utilities.length) parts.push(t("auto.utilities", { list: f.utilities.map((u) => tut(u)).join(", ") }));
    if (f.nearbyFacilities.length) parts.push(t("auto.nearby", { list: f.nearbyFacilities.map((x) => tfa(x)).join(", ") }));
    if (f.hasBoundaryWall) parts.push(t("auto.wall"));
    parts.push(t(f.landStatus === "ready" ? "auto.ready" : "auto.developing"));
    if (f.negotiable) parts.push(t("auto.negotiable"));
    parts.push(t("auto.end"));
    update({ description: parts.join(" ") });
  };

  // --- Render ---
  if (initialId && !loaded) return <div className="mx-auto h-96 max-w-3xl skeleton rounded-2xl" />;

  if (done)
    return (
      <SuccessScreen
        kind={done}
        title={f.title}
        videosProcessing={(videos ?? []).some((v) => v.status === "processing")}
        onAnother={() => {
          setDone(null);
          setF({ ...EMPTY, sizeUnit: f.sizeUnit });
          setListingId(undefined);
          idRef.current = undefined;
          dirty.current = false;
          setTried({});
          setTouched({});
          setStep("land");
          setSaveState({ s: "idle" });
          router.push("/dashboard/listings/new");
        }}
      />
    );

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const touch = (k: FieldKey) => () => setTouched((x) => ({ ...x, [k]: true }));
  const pct = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="mx-auto max-w-3xl">
      {resume && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/40 bg-secondary p-4 sm:flex-row sm:items-center" role="status">
          <div className="flex-1">
            <p className="font-semibold">{t("resumeTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("resumeBody", { title: resume.f.title || t("untitled"), time: fmt.ago(resume.at) })}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                try {
                  localStorage.removeItem(DRAFT_KEY);
                } catch {
                  /* ignore */
                }
                setResume(null);
              }}
            >
              {t("resumeFresh")}
            </Button>
            <Button
              onClick={() => {
                setF({ ...EMPTY, ...resume.f });
                setListingId(resume.listingId);
                idRef.current = resume.listingId;
                setStep(resume.step);
                setSaveState({ s: resume.listingId ? "saved" : "idle" });
                setResume(null);
              }}
            >
              {t("resumeContinue")}
            </Button>
          </div>
        </div>
      )}

      {isLive && (
        <p className="mb-4 rounded-2xl border border-warm/40 bg-warm/10 p-3 text-sm" role="note">
          {t("liveEditNote")}
        </p>
      )}

      {/* Progress */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <p className="font-medium text-muted-foreground">
            {initialId ? t("editTitle") : t("createTitle")} · <span className="text-foreground">{t("stepOf", { n: fmt.digits(stepIndex + 1), total: fmt.digits(STEPS.length) })}</span>
          </p>
          <SaveIndicator state={saveState} onRetry={() => void persist()} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label={t("stepOf", { n: stepIndex + 1, total: STEPS.length })}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-1" aria-label={t("stepsLabel")}>
          {STEPS.map((s, i) => {
            const isDone = i < stepIndex && stepOk(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => goTo(s)}
                  disabled={!reachable(i)}
                  aria-current={s === step ? "step" : undefined}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center text-xs transition sm:flex-row sm:justify-center sm:gap-2 sm:text-sm",
                    s === step ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground",
                  )}
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold", s === step ? "border-primary bg-primary text-primary-foreground" : isDone ? "border-primary bg-primary/10 text-primary" : "bg-background")}>
                    {isDone ? <Check className="size-3.5" /> : fmt.digits(i + 1)}
                  </span>
                  <span className="leading-tight">{t(`stepShort.${s}`)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {uploading && step !== "media" && (
        <button type="button" onClick={() => goTo("media")} className="mb-4 flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2 text-left text-sm shadow-soft">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          <span className="flex-1">{t("uploadsRunning", { n: uploadCount })}</span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </button>
      )}

      <div className="rounded-2xl border bg-card shadow-soft">
        <div className="p-4 sm:p-6">
          <h2 className="font-heading text-xl font-bold sm:text-2xl">{t(`steps.${step}`)}</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{t(`stepHelp.${step}`)}</p>

          {step === "land" && (
            <div className="space-y-6">
              <fieldset>
                <legend className="mb-2 text-[15px] font-semibold">{t("landType")}</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
                  {LAND_TYPES.map((lt) => {
                    const Icon = LandTypeIcons[lt];
                    return (
                      <label key={lt} className={cn("flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition has-focus-visible:ring-3 has-focus-visible:ring-ring/40", f.landType === lt ? "border-primary bg-secondary font-semibold" : "hover:border-primary/40")}>
                        <input type="radio" name="landType" className="sr-only" checked={f.landType === lt} onChange={() => update({ landType: lt })} />
                        <Icon size={20} className="shrink-0 text-primary" /> {tl(lt)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <Field label={t("area")} hint={t("areaHint")} error={show("area") && t("errArea")}>
                <AreaCombobox value={f.area} onChange={(a) => (update({ area: a }), setTouched((x) => ({ ...x, area: !a })))} placeholder={t("areaPlaceholder")} inputClassName="h-12 rounded-xl text-base sm:h-11" />
              </Field>

              <div>
                <Field label={t("size")} htmlFor="w-size" error={show("size") && t("errSize")}>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input id="w-size" className={cn(inputCls, "sm:max-w-40")} inputMode="decimal" autoComplete="off" placeholder="5" aria-invalid={show("size") || undefined} value={f.sizeValue} onBlur={touch("size")} onChange={(e) => update({ sizeValue: e.target.value })} />
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("unit")}>
                      {[...UNIT_CHOICES, ...(UNIT_CHOICES.includes(f.sizeUnit) ? [] : [f.sizeUnit])].map((u) => (
                        <Chip
                          key={u}
                          role="radio"
                          on={f.sizeUnit === u}
                          onClick={() => {
                            writeLocal(UNIT_KEY, u);
                            update({ sizeUnit: u });
                          }}
                        >
                          {tu(u)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </Field>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {sqft > 0 ? `= ${UNIT_CHOICES.filter((u) => u !== f.sizeUnit && u !== "acre").map((u) => (u === "sqft" ? `${fmt.num(sqft, 0)} ${tu("sqft")}` : fmt.sizeIn(sqft, u))).join(" · ")}` : t("sizeHint")}
                </p>
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="w-price" className="text-[15px] font-semibold">
                    {f.priceMode === "total" ? t("price") : t("pricePer", { unit: unitLabel })}
                  </label>
                  <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label={t("priceModeLabel")}>
                    {(["total", "perUnit"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={f.priceMode === m}
                        onClick={() => {
                          if (m === f.priceMode) return;
                          const size = toNum(f.sizeValue);
                          const p = toNum(f.priceInput);
                          const priceInput = p > 0 && size > 0 ? String(m === "total" ? Math.round(p * size) : Math.round(p / size)) : f.priceInput;
                          update({ priceMode: m, priceInput });
                        }}
                        className={cn("rounded-md px-2.5 py-1.5 font-medium transition", f.priceMode === m ? "bg-background shadow-sm" : "text-muted-foreground")}
                      >
                        {m === "total" ? t("priceModeTotal") : t("priceModePer", { unit: unitLabel })}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">৳</span>
                  <input id="w-price" className={cn(inputCls, "pl-8")} inputMode="numeric" autoComplete="off" placeholder="4500000" aria-invalid={show("price") || undefined} value={f.priceInput} onBlur={touch("price")} onChange={(e) => update({ priceInput: e.target.value })} />
                </div>
                {show("price") ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive" role="alert">
                    <AlertCircle className="size-4" /> {t("errPrice")}
                  </p>
                ) : total > 0 ? (
                  <p className="mt-1.5 text-sm" aria-live="polite">
                    <span className="font-semibold text-primary">{t("totalIs", { total: fmt.price(total, false) })}</span>
                    {sqft > 0 && <span className="text-muted-foreground"> · {t("perUnitIs", { price: fmt.perUnit(total, sqft, f.sizeUnit), unit: unitLabel })}</span>}
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">{t("priceHint")}</p>
                )}
                <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2.5 text-[15px]">
                  <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={f.negotiable} onChange={(e) => update({ negotiable: e.target.checked })} /> {t("negotiable")}
                </label>
              </div>

              <Field
                label={t("title")}
                htmlFor="w-title"
                error={show("title") && t("errTitle", { n: fmt.digits(MIN_TITLE) })}
                hint={t("titleHint")}
              >
                <input id="w-title" className={inputCls} value={f.title} maxLength={120} aria-invalid={show("title") || undefined} onBlur={touch("title")} onChange={(e) => update({ title: e.target.value })} placeholder={suggestedTitle || undefined} />
                {suggestedTitle && suggestedTitle !== f.title && (
                  <button type="button" onClick={() => update({ title: suggestedTitle })} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-left text-sm font-medium text-foreground hover:bg-secondary/80">
                    <Sparkles className="size-3.5 shrink-0 text-primary" /> {t("useSuggestion", { title: suggestedTitle })}
                  </button>
                )}
              </Field>
            </div>
          )}

          {step === "media" && (
            <div className="space-y-8">
              {show("photos") && (
                <p className="flex items-center gap-1.5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  <AlertCircle className="size-4" /> {t("errPhotos")}
                </p>
              )}
              <PhotoUploader previews={previews} images={f.images} onChange={(images) => update({ images })} queue={photoQ} jobs={jobs} max={CONFIG.maxImages} maxMB={CONFIG.maxImageBytes / 1024 / 1024} onFiles={onPhotos} />
              <VideoUploader
                videos={videos as ServerVideo[] | undefined}
                queue={videoQ}
                jobs={jobs}
                maxCount={CONFIG.maxVideosPerListing}
                maxBytes={CONFIG.maxVideoBytes}
                maxDurationSec={CONFIG.maxVideoDurationSec}
                onFiles={(fs) => void onVideos(fs)}
                onRemove={(id) => {
                  if (!confirm(t("confirmRemoveVideo"))) return;
                  removeVideo({ id: id as Id<"videos"> }).catch((e) => toast.error(errorMessage(e)));
                }}
              />
            </div>
          )}

          {step === "details" && (
            <div className="space-y-8">
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="w-desc" className="text-[15px] font-semibold">
                    {t("description")}
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={writeDescription}>
                    <Wand2 /> {t("writeForMe")}
                  </Button>
                </div>
                <textarea
                  id="w-desc"
                  className={cn(inputCls, "h-40 py-2.5 leading-relaxed sm:h-36")}
                  maxLength={5000}
                  aria-invalid={show("description") || undefined}
                  value={f.description}
                  onBlur={touch("description")}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder={t("descriptionHint")}
                />
                <p className={cn("flex justify-between gap-3 text-sm", show("description") ? "text-destructive" : "text-muted-foreground")}>
                  <span>{show("description") ? t("errDescription", { n: fmt.digits(MIN_DESC) }) : t("descriptionHelp")}</span>
                  <span className="shrink-0 tabular-nums">
                    {fmt.digits(f.description.trim().length)}
                    {f.description.trim().length < MIN_DESC && ` / ${fmt.digits(MIN_DESC)}`}
                  </span>
                </p>
              </section>

              <section className="space-y-4">
                <h3 className="font-heading text-lg font-semibold">{t("secFeatures")}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("roadWidth")} htmlFor="w-road" optional>
                    <input id="w-road" className={inputCls} inputMode="numeric" placeholder="20" value={f.roadWidthFt} onChange={(e) => update({ roadWidthFt: e.target.value })} />
                  </Field>
                  <Field label={t("facing")} htmlFor="w-facing" optional>
                    <select id="w-facing" className={inputCls} value={f.facing} onChange={(e) => update({ facing: e.target.value as Facing | "" })}>
                      <option value="">{t("notSure")}</option>
                      {FACINGS.map((x) => (
                        <option key={x} value={x}>
                          {tf(x)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <fieldset>
                  <legend className="mb-2 text-[15px] font-semibold">{t("landStatus")}</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup">
                    {(["ready", "under_development"] as const).map((s) => (
                      <Chip key={s} role="radio" on={f.landStatus === s} onClick={() => update({ landStatus: s })}>
                        {tls(s)}
                      </Chip>
                    ))}
                    <Chip on={f.hasBoundaryWall} onClick={() => update({ hasBoundaryWall: !f.hasBoundaryWall })}>
                      {t("boundaryWall")}
                    </Chip>
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-[15px] font-semibold">{t("utilities")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {UTILITIES.map((u) => {
                      const Icon = UtilityIcons[u];
                      return (
                        <Chip key={u} on={f.utilities.includes(u)} onClick={() => update((x) => ({ utilities: toggle(x.utilities, u) }))}>
                          <Icon size={16} /> {tut(u)}
                        </Chip>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-[15px] font-semibold">{t("facilities")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {FACILITIES.map((x) => (
                      <Chip key={x} on={f.nearbyFacilities.includes(x)} onClick={() => update((p) => ({ nearbyFacilities: toggle(p.nearbyFacilities, x) }))}>
                        <FacilityIcon facility={x} size={16} /> {tfa(x)}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="font-heading text-lg font-semibold">{t("secPrivate")}</h3>
                  <p className="text-sm text-muted-foreground">{t("exactAddressHint")}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("sectorBlock")} htmlFor="w-sector" optional>
                    <input id="w-sector" className={inputCls} value={f.sectorBlock} maxLength={80} onChange={(e) => update({ sectorBlock: e.target.value })} />
                  </Field>
                  <Field label={t("plotNumber")} htmlFor="w-plot" optional>
                    <input id="w-plot" className={inputCls} value={f.plotNumber} maxLength={40} onChange={(e) => update({ plotNumber: e.target.value })} />
                  </Field>
                </div>
                <Field label={t("exactAddress")} htmlFor="w-addr" optional>
                  <textarea id="w-addr" className={cn(inputCls, "h-20 py-2.5")} maxLength={300} value={f.exactAddress} onChange={(e) => update({ exactAddress: e.target.value })} />
                </Field>
                <div>
                  <p className="text-[15px] font-semibold">
                    {t("pinLocation")} <span className="text-xs font-normal text-muted-foreground">({tc("optional")})</span>
                  </p>
                  <p className="mb-2 text-sm text-muted-foreground">{t("pinHint")}</p>
                  <PinPicker center={f.area ? [f.area.centerLat, f.area.centerLng] : [23.81, 90.41]} value={f.pin} onChange={(pin) => update({ pin })} />
                  {f.pin && (
                    <button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={() => update({ pin: null })}>
                      {t("clearPin")}
                    </button>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    {t("secPapers")} <span className="text-sm font-normal text-muted-foreground">({tc("optional")})</span>
                  </h3>
                  <p className="text-sm text-muted-foreground">{t("documentsHint")}</p>
                </div>
                <ul className="space-y-2">
                  {DOCUMENT_TYPES.map((type) => {
                    const d = f.documents.find((x) => x.type === type);
                    const busy = docBusy === type;
                    const job = busy ? jobs.find((j) => j.pct < 100) : undefined;
                    return (
                      <li key={type} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", d && "border-primary/40 bg-secondary/40")}>
                        {d ? <CheckCircle2 className="size-5 text-primary" /> : <FileText className="size-5 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 text-sm font-medium">
                          {td(type)}
                          {d && <span className="block truncate text-xs font-normal text-muted-foreground">{d.fileName ?? "✓"}</span>}
                        </span>
                        <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/40", busy && "pointer-events-none opacity-70")}>
                          {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ? `${fmt.digits(job?.pct ?? 0)}%` : d ? t("replaceDoc") : t("uploadDoc", { type: td(type) })}
                          <input type="file" accept={CONFIG.docMimeTypes.join(",")} className="sr-only" onChange={(e) => (e.target.files?.[0] && onDoc(type, e.target.files[0]), (e.target.value = ""))} />
                        </label>
                        {d && (
                          <Button variant="ghost" size="sm" onClick={() => update((x) => ({ documents: x.documents.filter((y) => y.type !== type) }))}>
                            {tc("delete")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {step === "review" && (
            <ReviewStep
              f={f}
              total={total}
              sqft={sqft}
              videoCount={(videos?.length ?? 0) + videoQ.items.length}
              status={existing?.status}
              rejectionReason={existing?.rejectionReason}
              stepOk={stepOk}
              cover={f.images[0] ? (previews[f.images[0].mediaId] ?? f.images[0].url) : undefined}
              onFix={(s) => {
                setTried((x) => ({ ...x, [s]: true }));
                setStep(s);
              }}
              tst={tst}
            />
          )}
        </div>

        {/* Actions: sticky on small screens so "Next" is always under the thumb. */}
        <div className="sticky bottom-0 z-10 flex items-center gap-2 rounded-b-2xl border-t bg-card/95 p-3 backdrop-blur sm:p-4">
          <Button variant="outline" size="lg" className="h-12 px-4" onClick={() => goTo(STEPS[stepIndex - 1])} disabled={stepIndex === 0} aria-label={tc("back")}>
            <ArrowLeft /> <span className="hidden sm:inline">{tc("back")}</span>
          </Button>
          <Button variant="ghost" size="lg" className={cn("h-12", isLive ? "inline-flex" : "hidden sm:inline-flex")} onClick={saveAndExit} disabled={finishing || uploading}>
            {isLive ? t("saveChanges") : t("saveExit")}
          </Button>
          <div className="flex-1" />
          {step === "review" ? (
            <Button size="lg" onClick={finish} disabled={finishing || uploading} className="h-12 flex-1 bg-warm text-base font-semibold text-warm-foreground hover:bg-warm/90 sm:flex-none sm:px-8">
              {finishing || uploading ? <Loader2 className="animate-spin" /> : <Check />}
              {uploading ? t("waitUploads") : existing?.status === "active" || existing?.status === "pending_review" ? t("saveChanges") : t("submit")}
            </Button>
          ) : (
            <Button size="lg" onClick={() => goTo(STEPS[stepIndex + 1])} disabled={saveState.s === "saving" && stepIndex === 0} className="h-12 flex-1 text-base font-semibold sm:flex-none sm:px-8">
              {tc("next")} <ArrowRight />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">{isLive ? t("liveSaveHint") : t("autosaveHint")}</p>
    </div>
  );
}

/** Reads a video's duration from its metadata (undefined if the browser can't tell). */
function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (v?: number) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(undefined), 5000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(el.duration) ? el.duration : undefined);
    };
    el.onerror = () => {
      clearTimeout(timer);
      done(undefined);
    };
    el.src = url;
  });
}

function SaveIndicator({ state, onRetry }: { state: { s: string; msg?: string }; onRetry: () => void }) {
  const t = useTranslations("wizard");
  if (state.s === "idle") return <span className="text-xs text-muted-foreground">{t("notSaved")}</span>;
  if (state.s === "error")
    return (
      <button type="button" onClick={onRetry} title={state.msg} className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline">
        <CloudOff className="size-3.5" /> {t("saveFailed")}
      </button>
    );
  if (state.s === "saving" || state.s === "pending")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
        <Loader2 className="size-3.5 animate-spin" /> {t("saving")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary" aria-live="polite" data-testid="save-state">
      <Cloud className="size-3.5" /> {t("saved")}
    </span>
  );
}

function ReviewStep({
  f,
  total,
  sqft,
  videoCount,
  status,
  rejectionReason,
  stepOk,
  onFix,
  tst,
  cover,
}: {
  cover?: string;
  f: Form;
  total: number;
  sqft: number;
  videoCount: number;
  status?: string;
  rejectionReason?: string;
  stepOk: (s: Step) => boolean;
  onFix: (s: Step) => void;
  tst: ReturnType<typeof useTranslations<"status">>;
}) {
  const t = useTranslations("wizard");
  const tl = useTranslations("landType");
  const tf = useTranslations("facing");
  const tc = useTranslations("common");
  const tu = useTranslations("units");
  const fmt = useFmt();
  const Icon = LandTypeIcons[f.landType];
  const missing = (["land", "media", "details"] as const).filter((s) => !stepOk(s));
  const area = f.area ? `${fmt.locale === "bn" ? (f.area.areaNameBn ?? f.area.areaName) : f.area.areaName}, ${f.area.district}` : "—";
  const rows: [string, string, Step][] = [
    [t("sum.type"), tl(f.landType), "land"],
    [t("sum.area"), area, "land"],
    [t("size"), toNum(f.sizeValue) > 0 ? `${fmt.size(toNum(f.sizeValue), f.sizeUnit)}${f.sizeUnit !== "sqft" ? ` (${fmt.num(sqft, 0)} ${tu("sqft")})` : ""}` : "—", "land"],
    [t("sum.price"), total > 0 ? `${fmt.price(total, true)}${f.negotiable ? ` · ${tc("negotiable")}` : ""}` : "—", "land"],
    [t("facing"), f.facing ? tf(f.facing) : "—", "details"],
    [t("roadWidth"), toNum(f.roadWidthFt) > 0 ? fmt.digits(toNum(f.roadWidthFt)) : "—", "details"],
    [t("reviewMedia"), t("mediaCount", { photos: fmt.digits(f.images.length), videos: fmt.digits(videoCount) }), "media"],
    [t("secPapers"), fmt.digits(f.documents.length), "details"],
  ];

  return (
    <div className="space-y-6">
      {status && status !== "draft" && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold">{tst(status as never)}</span>
          {rejectionReason && <span className="ml-2 text-destructive">{rejectionReason}</span>}
        </p>
      )}

      {missing.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <p className="font-semibold text-destructive">{t("missingTitle")}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {missing.map((s) => (
              <li key={s} className="flex items-center justify-between gap-3">
                <span>{t(`missingStep.${s}`)}</span>
                <Button size="sm" variant="outline" onClick={() => onFix(s)}>
                  {t("fix")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,280px)_1fr]">
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">{t("previewTitle")}</p>
          <article className="overflow-hidden rounded-2xl border bg-background shadow-soft" aria-label={t("previewTitle")}>
            <div className="relative aspect-[4/3] bg-muted">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
              ) : <div className="grid h-full place-items-center text-sm text-muted-foreground">{t("errPhotos")}</div>}
              {f.images.length > 0 && <span className="absolute right-2 bottom-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">{tc("photos", { count: fmt.digits(f.images.length) })}</span>}
            </div>
            <div className="space-y-1 p-3">
              <p className="font-heading text-lg font-bold">{total > 0 ? fmt.price(total) : "—"}</p>
              {sqft > 0 && total > 0 && <p className="text-xs text-muted-foreground">{t("perUnitIs", { price: fmt.perUnit(total, sqft, "katha"), unit: tu("katha") })}</p>}
              <p className="line-clamp-2 text-sm font-medium">{f.title || "—"}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" /> {area}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon size={14} /> {tl(f.landType)} · {toNum(f.sizeValue) > 0 ? fmt.size(toNum(f.sizeValue), f.sizeUnit) : "—"}
              </p>
            </div>
          </article>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">{t("summary")}</p>
          <dl className="divide-y rounded-xl border text-sm">
            {rows.map(([k, v, s]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="flex min-w-0 items-center gap-2 text-right font-medium">
                  <span className="break-words">{v}</span>
                  <button type="button" onClick={() => onFix(s)} className="shrink-0 text-xs font-normal text-primary hover:underline">
                    {tc("edit")}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
          {f.description && <p className="mt-3 line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{f.description}</p>}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("reviewNote")}</p>
    </div>
  );
}

function SuccessScreen({ kind, title, videosProcessing, onAnother }: { kind: "submitted" | "saved"; title: string; videosProcessing: boolean; onAnother: () => void }) {
  const t = useTranslations("wizard.done");
  const steps = [t("next1"), t("next2"), t("next3")];
  return (
    <div className="mx-auto max-w-xl rounded-3xl border bg-card p-6 text-center shadow-soft sm:p-10" role="status">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">{kind === "submitted" ? <PartyPopper className="size-8" /> : <CheckCircle2 className="size-8" />}</div>
      <h2 className="mt-4 font-heading text-2xl font-bold">{kind === "submitted" ? t("submittedTitle") : t("savedTitle")}</h2>
      <p className="mt-1 font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{kind === "submitted" ? t("submittedBody") : t("savedBody")}</p>
      {kind === "submitted" && (
        <div className="mt-6 text-left">
          <p className="mb-2 text-sm font-semibold">{t("nextTitle")}</p>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3 rounded-xl bg-muted/60 p-3 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}
      {videosProcessing && <p className="mt-4 rounded-xl bg-secondary p-3 text-sm">{t("videosStill")}</p>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/dashboard/listings" className={cn(buttonVariants({ size: "lg" }), "h-12")}>
          {t("toListings")}
        </Link>
        <Button variant="outline" size="lg" className="h-12" onClick={onAnother}>
          <Plus /> {t("postAnother")}
        </Button>
      </div>
    </div>
  );
}
