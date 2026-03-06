import type { Venue } from "@/types";

export function getVenueDisplayName(venue: Pick<Venue, "name" | "displayName">): string {
  return venue.displayName?.trim() || venue.name;
}

export function getVenueVisual(
  venue: Pick<Venue, "name" | "logoText" | "iconEmoji">,
  fallbackIndex = 0
): {
  logoText: string;
  icon: string;
} {
  const customLogoText = venue.logoText?.trim();
  const customIcon = venue.iconEmoji?.trim();

  const words = venue.name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .filter(Boolean);
  const fallbackLogoText = ((words[0] ?? "") + (words[1] ?? words[0] ?? "V")).slice(0, 3);
  const fallbackIcons = ["🏟️", "🍻", "🎯", "🎲", "🏀", "🎤", "🏈", "🍔", "🎵", "🎮"];
  const fallbackIcon = fallbackIcons[fallbackIndex % fallbackIcons.length] ?? "📍";
  const logoText = customLogoText && customLogoText.length > 0 ? customLogoText.slice(0, 3) : fallbackLogoText;
  const icon = customIcon && customIcon.length > 0 ? customIcon : fallbackIcon;

  return { logoText, icon };
}
