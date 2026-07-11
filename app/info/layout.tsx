import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hightop Challenge — Venue Gaming Platform",
  description:
    "Hightop Challenge brings live trivia, pick'em, bingo, and fantasy competitions to your venue. Fill seats on slow nights and keep guests engaged all night long.",
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Hightop Challenge",
  url: "https://hightopchallenge.com",
  logo: "https://hightopchallenge.com/brand/htc-logo.png",
};

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      {children}
    </>
  );
}
