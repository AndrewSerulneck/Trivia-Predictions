import type { MetadataRoute } from "next";

// Marketing surfaces only — the player app (/join, /venue/*, /trivia, etc.) is
// geofenced/authenticated and has no standalone SEO value, so it's kept out of
// the sitemap (see app/robots.ts for the matching disallow list).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://hightopchallenge.com";

const MARKETING_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/info", priority: 1, changeFrequency: "weekly" },
  { path: "/faqs", priority: 0.6, changeFrequency: "monthly" },
  { path: "/advertise", priority: 0.4, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return MARKETING_PATHS.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
