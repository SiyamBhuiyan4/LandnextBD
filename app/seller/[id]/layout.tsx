import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Params = { id: string };

// The page itself is a live client view; this server layout gives it a title/description
// and a real 404 status for unknown sellers.
const load = cache(async (id: string) => {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  return fetchQuery(api.users.publicProfile, { id: id as Id<"users"> }).catch(() => null);
});

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const p = await load(id);
  if (!p) return { title: "Seller not found", robots: { index: false } };
  const name = p.companyName ?? p.name;
  return {
    title: `${name} — land listings`,
    description: `${p.listings.length} land listings by ${name}${p.verificationStatus === "verified" ? " (verified seller)" : ""} on land.db.`,
    alternates: { canonical: `/seller/${id}` },
  };
}

export default async function SellerLayout({ children, params }: { children: React.ReactNode; params: Promise<Params> }) {
  if (!(await load((await params).id))) notFound();
  return children;
}
