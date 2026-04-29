// Types considered "location-like" — entities of these types always have
// their own point on the map. Kept in sync with scripts/ingest.py.
export const PLACE_TYPES = new Set([
  "place", "city", "town", "village", "region", "district", "site",
  "ruin", "temple", "church", "mosque", "shrine", "palace", "museum",
  "gallery", "landmark", "monument", "tomb", "natural_feature",
  "mountain", "river", "lake", "sea", "desert", "island", "park",
  "market", "neighborhood", "station", "port",
]);

export function isPlaceType(t: string | null | undefined): boolean {
  if (!t) return false;
  const low = t.toLowerCase();
  return PLACE_TYPES.has(low) || low.endsWith("_site") || low.endsWith("_place");
}

// Deterministic HSL colour per type so unknown types still render consistently.
export function colorForType(type: string | null | undefined): string {
  const t = type || "concept";
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 55%)`;
}

export const MOBILE_BREAKPOINT = 768;
