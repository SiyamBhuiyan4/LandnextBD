import { AreaPage, areaMetadata } from "../area-page";

type Params = { area: string; type: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { area, type } = await params;
  return areaMetadata(area, type);
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { area, type } = await params;
  return <AreaPage areaSlug={area} typeSlug={type} />;
}
