import { Hero } from "@/components/home/hero";
import {
  Categories,
  FeaturedCarousel,
  NewestGrid,
  PopularAreas,
  SellCta,
  StatsStrip,
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
      <NewestGrid />
      <VideosStrip />
      <PopularAreas />
      <VerifiedSellers />
      <SellCta />
    </>
  );
}
