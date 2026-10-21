import { AreaPage, areaMetadata } from "./area-page";

type Params = { area: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  return areaMetadata((await params).area);
}

export default async function Page({ params }: { params: Promise<Params> }) {
  return <AreaPage areaSlug={(await params).area} />;
}
