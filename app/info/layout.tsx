import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://hightopchallenge.com";
const INFO_CANONICAL_PATH = "/info";

export const metadata: Metadata = {
  title: "Venue Gaming Platform for Bars and Restaurants",
  description:
    "Hightop Challenge is a browser-based venue gaming platform for bars and restaurants with live trivia, speed trivia, pick'em, sports bingo, fantasy sports, and venue-scoped challenges.",
  alternates: {
    canonical: INFO_CANONICAL_PATH,
  },
  openGraph: {
    type: "website",
    url: INFO_CANONICAL_PATH,
    title: "Venue Gaming Platform for Bars and Restaurants",
    description:
      "Mobile-first venue gaming with live trivia, speed trivia, sports bingo, pick'em, fantasy sports, and geofenced challenges.",
    images: [
      {
        url: "/brand/hero-poster.jpg",
        width: 1200,
        height: 630,
        alt: "Hightop Challenge venue gaming platform for bars and restaurants",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Venue Gaming Platform for Bars and Restaurants",
    description:
      "Mobile-first venue gaming with live trivia, speed trivia, sports bingo, pick'em, fantasy sports, and geofenced challenges.",
    images: ["/brand/hero-poster.jpg"],
  },
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Hightop Challenge",
  url: SITE_URL,
  logo: `${SITE_URL}/brand/htc-logo.png`,
  sameAs: ["https://www.instagram.com/thehightopchallenge"],
  contactPoint: {
    "@type": "ContactPoint",
    email: "partnerships@hightopchallenge.com",
    contactType: "sales",
  },
};

const WEB_APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Hightop Challenge",
  url: `${SITE_URL}${INFO_CANONICAL_PATH}`,
  applicationCategory: "EntertainmentApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript and a modern mobile or desktop web browser.",
  offers: {
    "@type": "Offer",
    price: "100",
    priceCurrency: "USD",
  },
  audience: {
    "@type": "Audience",
    audienceType: "Bars, restaurants, and hospitality venues",
  },
  description:
    "Hightop Challenge is a mobile-first web application for venue-based guest engagement. It delivers geofenced live trivia, speed trivia, sports prop bingo, pick'em, fantasy sports, and venue-specific challenge campaigns that guests play from their phone browser.",
  featureList: [
    "Geofenced venue-scoped gameplay",
    "Live trivia and speed trivia",
    "Sports prop bingo with live stat resolution",
    "Pick'em and fantasy sports contests",
    "Venue leaderboards and challenge campaigns",
    "Browser-based play with no app download",
  ],
};

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEB_APPLICATION_JSON_LD) }}
      />
      {children}
    </>
  );
}
