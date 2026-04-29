// Entity → map projection.
//
// Every entity can be "projected" to one or more points on the map:
//   1. Geo-typed entities (has own coords) → [self.coords]
//   2. Non-geo entities → coords of their `anchors` (LLM-assigned related
//      location entities)
//   3. Fall back to coords of any `related` entity that happens to be a place.
//
// This is what lets clicking a pharaoh / dynasty / concept still give the
// map a sensible focus.

import type { Entity, LatLon } from "./types";
import { isPlaceType } from "./constants";

export interface Projection {
  placeId: string;
  coords: LatLon;
  /** The chain we walked to reach this place. First entry is the clicked id. */
  via: string[];
}

export function projectEntity(
  entity: Entity,
  byId: Map<string, Entity>,
): Projection[] {
  const out: Projection[] = [];
  const seen = new Set<string>();

  if (entity.coords) {
    out.push({ placeId: entity.id, coords: entity.coords, via: [entity.id] });
    seen.add(entity.id);
  }

  const tryPush = (id: string, via: string[]) => {
    if (seen.has(id)) return;
    const e = byId.get(id);
    if (!e || !e.coords) return;
    seen.add(id);
    out.push({ placeId: id, coords: e.coords, via });
  };

  // Prefer explicit anchors supplied by the LLM — they're the most
  // semantically meaningful projection.
  for (const a of entity.anchors) tryPush(a, [entity.id, a]);

  // Fall back: any `related` entity that is itself a place.
  if (out.length === 0) {
    for (const r of entity.related) {
      const re = byId.get(r);
      if (re && re.coords && isPlaceType(re.type)) {
        tryPush(r, [entity.id, r]);
      }
    }
  }

  // Last-chance fallback: 2-hop — a related entity's anchors.
  if (out.length === 0) {
    for (const r of entity.related) {
      const re = byId.get(r);
      if (!re) continue;
      for (const a of re.anchors) tryPush(a, [entity.id, r, a]);
    }
  }

  return out;
}

/** Bounding-box helpers for "fit map to this entity's projections". */
export function projectionBounds(p: Projection[]): [LatLon, LatLon] | null {
  if (!p.length) return null;
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  for (const { coords: [lat, lon] } of p) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [[minLat, minLon], [maxLat, maxLon]];
}
