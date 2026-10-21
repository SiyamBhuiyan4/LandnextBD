import { ListingWizard } from "@/components/dashboard/listing-wizard";
import type { Id } from "@/convex/_generated/dataModel";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingWizard listingId={id as Id<"listings">} />;
}
