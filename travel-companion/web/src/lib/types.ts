// Shared data shapes. Mirror the JSON written by scripts/export_data.py.

export type LatLon = [number, number];

export interface Entity {
  id: string;
  type: string;
  aliases: string[];
  coords: LatLon | null;
  coordsSource: string | null;
  summary: string;
  tags: string[];
  related: string[];
  /** Location entities this non-geo entity should project to on the map. */
  anchors: string[];
  mentionedAt: string[];
  /** Full markdown body of the entity's wiki file — the canonical "truth source". */
  body: string;
  /** Relative path in the trip root — shown in the drawer for reference. */
  file: string;
}

export interface TripEvent {
  id: string;
  year: number | null;
  summary: string;
  places: string[];
  actors: string[];
}

export interface SessionTurn {
  t: string;
  role: "user" | "assistant";
  text: string;
}

export interface RecommendationRef {
  kind: "shots" | "food" | "itinerary" | "spots";
  place: string;
  file: string;
  body: string;
}

export interface TripData {
  version: 1;
  destination: string | null;
  countryHint: string | null;
  entities: Entity[];
  events: TripEvent[];
  sessionLog: SessionTurn[];
  recommendations: RecommendationRef[];
  generatedAt: string;
}
