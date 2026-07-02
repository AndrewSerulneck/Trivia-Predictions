export function isVenueScreenPath(pathname: string): boolean {
  return /^\/venue\/[^/?#]+\/screen\/?$/i.test(pathname);
}
