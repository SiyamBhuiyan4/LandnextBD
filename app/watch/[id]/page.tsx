import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { VideoGalleryBody } from "@/components/video/video-gallery";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function load(id: string) {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  return fetchQuery(api.videos.get, { id: id as Id<"videos"> }).catch(() => null);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = await load(id);
  if (!v) return { title: "Video not found", robots: { index: false } };
  const image = v.thumbnailUrl ? new URL(v.thumbnailUrl, SITE).toString() : undefined;
  return {
    title: `${v.title} — ${v.listing?.title ?? "Land video"}`,
    description: v.listing ? `${v.listing.areaName} · walkthrough video` : undefined,
    alternates: { canonical: `/watch/${id}` },
    openGraph: { siteName: "LandnestBD", type: "video.other", images: image ? [image] : [] },
  };
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await load((await params).id);
  if (!v) notFound();
  return (
    <div className="container-page py-6">
      <h1 className="sr-only">{v.title}</h1>
      <VideoGalleryBody listingId={v.listingId} initialVideoId={v._id} />
    </div>
  );
}
