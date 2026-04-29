import { useEffect, useRef } from "react";
import L from "leaflet";
import type { TripStore } from "../store";
import type { Entity, LatLon } from "../lib/types";
import { colorForType } from "../lib/constants";
import { projectEntity, projectionBounds } from "../lib/anchors";

// CartoDB Voyager — free, key-less, good travel base map. @2x for retina.
const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTRIB =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://carto.com/attributions">CARTO</a>';

export default function MapView({ useStore, isMobile }:
  { useStore: TripStore; isMobile: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const haloLayerRef = useRef<L.LayerGroup | null>(null);

  const data = useStore((s) => s.data);
  const byId = useStore((s) => s.byId);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);

  // Build / rebuild map when entity set changes.
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const m = L.map(ref.current, {
      worldCopyJump: true, zoomControl: !isMobile,
    }).setView([20, 0], 2);
    L.tileLayer(TILE_URL, {
      maxZoom: 19, subdomains: "abcd", detectRetina: true,
      attribution: TILE_ATTRIB,
    }).addTo(m);
    haloLayerRef.current = L.layerGroup().addTo(m);
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re-)render markers when entity data changes.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    for (const mk of markersRef.current.values()) mk.remove();
    markersRef.current.clear();

    const places = data.entities.filter((e): e is Entity & { coords: LatLon } =>
      Array.isArray(e.coords));

    for (const e of places) {
      const marker = L.circleMarker(e.coords, {
        radius: isMobile ? 9 : 7,
        color: "#fff", weight: 2,
        fillColor: colorForType(e.type), fillOpacity: 0.92,
      });
      marker.bindTooltip(e.id, { direction: "top", offset: [0, -6] });
      marker.on("click", () => setSelected(e.id));
      marker.addTo(m);
      markersRef.current.set(e.id, marker);
    }

    if (places.length) {
      const group = L.featureGroup([...markersRef.current.values()]);
      m.fitBounds(group.getBounds().pad(0.3), { animate: false });
    }
  }, [data.entities, isMobile, setSelected]);

  // When selection changes — draw halos on anchors and frame them on map.
  useEffect(() => {
    const m = mapRef.current;
    const haloLayer = haloLayerRef.current;
    if (!m || !haloLayer) return;

    haloLayer.clearLayers();
    // reset marker styles
    for (const [id, mk] of markersRef.current) {
      mk.setStyle({
        weight: 2, color: "#fff", opacity: 1,
        fillOpacity: selectedId ? 0.35 : 0.92,
      });
      void id;
    }

    if (!selectedId) {
      for (const mk of markersRef.current.values()) {
        mk.setStyle({ fillOpacity: 0.92 });
      }
      return;
    }
    const entity = byId.get(selectedId);
    if (!entity) return;

    const projections = projectEntity(entity, byId);
    const anchorIds = new Set(projections.map((p) => p.placeId));

    for (const [id, mk] of markersRef.current) {
      if (!anchorIds.has(id)) continue;
      mk.setStyle({ fillOpacity: 1, weight: 3, color: "#c6652a" });
      const halo = L.circleMarker(mk.getLatLng(), {
        radius: isMobile ? 20 : 18,
        color: "#c6652a", weight: 2, opacity: 0.45,
        fillColor: "#c6652a", fillOpacity: 0.12,
      });
      halo.addTo(haloLayer);
    }

    // Frame the anchors so the user sees the projection immediately.
    const b = projectionBounds(projections);
    if (b) {
      const bounds = L.latLngBounds(b[0], b[1]);
      if (projections.length === 1) {
        m.setView(bounds.getCenter(), Math.max(m.getZoom(), 10), { animate: true });
      } else {
        m.fitBounds(bounds.pad(0.4), { animate: true, maxZoom: 12 });
      }
    }
  }, [selectedId, byId, isMobile]);

  // Invalidate size when the parent layout changes (mobile tab switch).
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const obs = new ResizeObserver(() => m.invalidateSize());
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return <div ref={ref} style={{ height: "100%", width: "100%" }} />;
}
