"use client";

/**
 * SpotMap — Leaflet map with OpenStreetMap tiles and one pin per spot.
 *
 * THIS FILE IS NEVER SERVER-RENDERED.
 * It is consumed exclusively via:
 *   dynamic(() => import("./SpotMap"), { ssr: false })
 * in app/search/page.tsx. The ssr:false guard is the only safe way to use
 * Leaflet in Next.js because Leaflet accesses window / document at import
 * time, which throws in Node.
 *
 * Map behaviour:
 *   • OpenStreetMap tile layer (no API key required).
 *   • One Marker per SpotAvailability, positioned at (lat, lng).
 *   • Popup on each marker: spot name + formatted price per hour.
 *   • The map view auto-fits all pins on mount (fitBounds). If only one spot
 *     is present it centres at zoom 15 instead.
 *   • Leaflet's default icon images are fixed via a one-time import workaround
 *     (the standard technique for bundled Leaflet — missing icon URLs are a
 *     known Leaflet + webpack/Next.js issue).
 *
 * Error handling:
 *   • If the tile layer emits a tileerror event repeatedly (> MAX_TILE_ERRORS
 *     within the first TILE_ERROR_WINDOW_MS) the component calls onError() and
 *     the parent renders the "Map unavailable" degraded placeholder instead.
 *   • React error boundaries do NOT catch async errors or Leaflet DOM errors,
 *     so the tile-error counter approach is used for the degraded state.
 *
 * Accessibility:
 *   • The map container has role="img" and aria-label describing the pin count.
 *   • It is aria-hidden from keyboard navigation — the spot list below is the
 *     canonical path to any spot (mockup note: "The list is complete on its
 *     own. The map is an enhancement and never the only route to a spot.").
 */

import { useEffect, useRef } from "react";
import type { SpotAvailability } from "../../lib/availability";
import { paiseToDisplay } from "../../lib/money";

/* ─────────────────────────────────────────────
   Leaflet icon fix — must run once before any map is created.

   When Leaflet is bundled by webpack/Next.js the auto-detected image URL
   (_getIconUrl) resolves to the wrong path. The canonical fix is to delete the
   prototype method and supply explicit URLs pointing to the CDN copy of the
   Leaflet marker images.
───────────────────────────────────────────── */
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Disable Leaflet's broken icon URL auto-detection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* ─────────────────────────────────────────────
   Tile-error degradation thresholds
───────────────────────────────────────────── */

/** How many tile errors inside the window trip the degraded state. */
const MAX_TILE_ERRORS = 5;
/** Sliding window (ms) during which tile errors are counted. */
const TILE_ERROR_WINDOW_MS = 8000;

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */

export interface SpotMapProps {
  spots: SpotAvailability[];
  /** Called (once) when the map degrades — parent replaces with placeholder. */
  onError: () => void;
}

export default function SpotMap({ spots, onError }: SpotMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * Keep the Leaflet map instance in a ref so the cleanup effect can destroy
   * it without triggering a re-render, and so the effect does not need the
   * map in its dependency array.
   */
  const mapRef = useRef<L.Map | null>(null);
  /**
   * Tile-error timestamps — used to decide whether to trigger degraded state.
   * Stored in a ref so mutations never cause re-renders.
   */
  const tileErrorTimes = useRef<number[]>([]);
  /** Guard: fire onError only once. */
  const degradedFired = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Create map ──────────────────────────────────────────────────────────
    const map = L.map(container, {
      // Disable the attribution control — we add a custom one below
      attributionControl: true,
      zoomControl: true,
    });
    mapRef.current = map;

    // ── Tile layer — OpenStreetMap ──────────────────────────────────────────
    const tileLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    );

    tileLayer.on("tileerror", () => {
      if (degradedFired.current) return;

      const now = Date.now();
      // Purge timestamps outside the sliding window
      tileErrorTimes.current = tileErrorTimes.current.filter(
        (t) => now - t < TILE_ERROR_WINDOW_MS,
      );
      tileErrorTimes.current.push(now);

      if (tileErrorTimes.current.length >= MAX_TILE_ERRORS) {
        degradedFired.current = true;
        onError();
      }
    });

    tileLayer.addTo(map);

    // ── Markers ─────────────────────────────────────────────────────────────
    if (spots.length === 0) {
      // Edge case: show a default view of Hyderabad
      map.setView([17.385, 78.4867], 12);
    } else if (spots.length === 1) {
      const s = spots[0]!;
      map.setView([s.lat, s.lng], 15);
    } else {
      const bounds = L.latLngBounds(spots.map((s) => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [32, 32] });
    }

    // Add one marker per spot
    spots.forEach((spot) => {
      const marker = L.marker([spot.lat, spot.lng]);
      const price = paiseToDisplay(spot.price_per_hour_paise);
      marker.bindPopup(
        `<strong style="font-size:14px">${spot.name}</strong><br/>${price}/hr`,
        { closeButton: false },
      );
      marker.addTo(map);
    });

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // spots and onError are stable across the component's life; exhaustive-deps
    // would cause unnecessary map teardowns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      /**
       * role="img" so assistive technology presents the map as a single
       * non-interactive image region. Keyboard users navigate via the list
       * of spot cards below; the map is supplementary.
       */
      role="img"
      aria-label={`Map showing ${spots.length} parking spot${spots.length !== 1 ? "s" : ""}`}
      ref={containerRef}
      className="spot-map"
      style={{
        height: 180,
        // Leaflet requires a concrete height; the width comes from .spot-map
        // in globals.css (width: 100%).
      }}
    />
  );
}
