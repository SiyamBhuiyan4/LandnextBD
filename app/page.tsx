import { Hero } from "@/components/home/hero";
import {
  Categories,
  FeaturedCarousel,
  NewestGrid,
  PopularAreas,
  SellCta,
  StatsStrip,
  TrustSection,
  VerifiedSellers,
  VideosStrip,
} from "@/components/home/home-sections";

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <Categories />
      <FeaturedCarousel />
      <PopularAreas />
      <NewestGrid />
      <TrustSection />
      <VideosStrip />
      <VerifiedSellers />
      <SellCta />
    </>
  );
}
