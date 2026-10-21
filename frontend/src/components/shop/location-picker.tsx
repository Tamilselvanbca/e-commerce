"use client";

import { useEffect, useRef, useState } from "react";
import { mapLink } from "@/lib/format";
import { Button, Input } from "@/components/ui";
import { CrosshairIcon, MapPinIcon, PinDropIcon, SearchIcon } from "./icons";

export type LatLng = { lat: number; lng: number };

/** Address parts read from the map (reverse geocoding); empty parts are left out. */
export type PlaceParts = { area?: string; city?: string; state?: string; pincode?: string; country?: string };

// The few Google Maps JavaScript API types used here.
type GLatLng = { lat(): number; lng(): number };
type GMap = {
  getCenter(): GLatLng | undefined;
  setCenter(p: LatLng): void;
  setZoom(z: number): void;
  panTo(p: GLatLng | LatLng): void;
  addListener(event: string, fn: (e: { latLng?: GLatLng }) => void): { remove(): void };
};
type GComponent = { long_name: string; short_name: string; types: string[] };
type GResult = { address_components: GComponent[]; geometry: { location: GLatLng } };
type GGeocoder = {
  geocode(req: { location?: LatLng; address?: string; componentRestrictions?: { country: string } }): Promise<{ results: GResult[] }>;
};
type GMaps = {
  importLibrary(name: "maps"): Promise<{ Map: new (el: HTMLElement, opts: object) => GMap }>;
  importLibrary(name: "geocoding"): Promise<{ Geocoder: new () => GGeocoder }>;
};

declare global {
  interface Window {
    google?: { maps: GMaps };
    gm_authFailure?: () => void;
  }
}

const INDIA_CENTER: LatLng = { lat: 22.5, lng: 79 };

let loading: Promise<GMaps> | null = null;

/** Loads the Maps JavaScript API once per page. */
function loadMaps(key: string): Promise<GMaps> {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  loading ??= new Promise<GMaps>((resolve, reject) => {
    const callback = "__storeMapsReady";
    (window as unknown as Record<string, () => void>)[callback] = () => resolve(window.google!.maps);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${callback}&region=IN&language=en`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Couldn't load Google Maps"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** The address parts in geocoder results (the most specific result first). */
function placeParts(results: GResult[]): PlaceParts {
  const find = (type: string, short = false) => {
    for (const r of results) {
      const c = r.address_components.find((x) => x.types.includes(type));
      if (c) return short ? c.short_name : c.long_name;
    }
    return undefined;
  };
  const first = results[0]?.address_components ?? [];
  const local = (type: string) => first.find((x) => x.types.includes(type))?.long_name;
  const route = local("route");
  const area = [
    route && !/unnamed/i.test(route) ? route : undefined,
    local("neighborhood"),
    local("sublocality_level_2"),
    local("sublocality_level_1") ?? local("sublocality"),
  ].filter((v, i, all): v is string => Boolean(v) && all.indexOf(v) === i);
  return {
    area: area.join(", ").slice(0, 200) || undefined,
    city: find("locality") ?? find("administrative_area_level_3") ?? find("postal_town") ?? find("administrative_area_level_2"),
    state: find("administrative_area_level_1"),
    pincode: find("postal_code"),
    country: find("country", true),
  };
}

/**
 * "Pin your location", like the big shops: with a Google Maps key, a map with
 * a pin in the middle (move the map, search, or use the phone's location) that
 * fills in the area, city, state and PIN code. Without a key, just "Use my
 * current location". The pin is saved with the address for the courier.
 */
export function LocationPicker({
  apiKey,
  value,
  country,
  onChange,
  onPlace,
}: {
  apiKey: string | null;
  value: LatLng | null;
  country: string;
  onChange: (value: LatLng | null) => void;
  onPlace: (parts: PlaceParts) => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const geocoder = useRef<GGeocoder | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Latest callbacks and value for the map listeners, which are set up once.
  const latest = useRef({ onChange, onPlace, value });
  useEffect(() => {
    latest.current = { onChange, onPlace, value };
  });

  /** A spot chosen by the customer: save it and fill the address from it. */
  const choose = async (pos: LatLng, parts?: PlaceParts) => {
    latest.current.onChange({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
    setMessage(null);
    if (parts) return latest.current.onPlace(parts);
    if (!geocoder.current) return;
    try {
      const { results } = await geocoder.current.geocode({ location: pos });
      if (results.length) latest.current.onPlace(placeParts(results));
    } catch {
      setMessage("Couldn't read the address here. Fill in the details below.");
    }
  };

  useEffect(() => {
    if (!apiKey || !mapEl.current) return;
    let cancelled = false;
    // Google calls this when the key is refused (wrong key, domain not allowed, billing off).
    window.gm_authFailure = () => setFailed(true);
    (async () => {
      try {
        const maps = await loadMaps(apiKey);
        const [{ Map }, { Geocoder }] = await Promise.all([maps.importLibrary("maps"), maps.importLibrary("geocoding")]);
        if (cancelled || !mapEl.current) return;
        const start = latest.current.value;
        const m = new Map(mapEl.current, {
          center: start ?? INDIA_CENTER,
          zoom: start ? 17 : 4,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        map.current = m;
        geocoder.current = new Geocoder();
        // The pin stays in the middle: when the customer moves the map, the spot under it is chosen.
        let moved = false;
        m.addListener("dragend", () => {
          moved = true;
        });
        m.addListener("click", (e) => {
          if (e.latLng) {
            moved = true;
            m.panTo(e.latLng);
          }
        });
        m.addListener("idle", () => {
          const c = m.getCenter();
          if (!moved || !c) return;
          moved = false;
          void choose({ lat: c.lat(), lng: c.lng() });
        });
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The map is created once per key; `choose` reads the latest callbacks through refs.
  }, [apiKey]);

  const showMap = Boolean(apiKey) && !failed;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        map.current?.setCenter(pos);
        map.current?.setZoom(17);
        void choose(pos);
      },
      (err) => {
        setLocating(false);
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? "Location access is blocked. Allow it for this site in your browser, or move the map to your address."
            : "Couldn't find your location. Move the map to your address instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const search = async () => {
    const text = query.trim();
    if (!text || !geocoder.current || !map.current) return;
    setSearching(true);
    setMessage(null);
    try {
      const { results } = await geocoder.current.geocode({ address: text, componentRestrictions: { country } });
      const hit = results[0];
      if (!hit) {
        setMessage("No place found. Try an area, street or PIN code.");
        return;
      }
      const pos = { lat: hit.geometry.location.lat(), lng: hit.geometry.location.lng() };
      map.current.setCenter(pos);
      map.current.setZoom(16);
      await choose(pos, placeParts(results));
    } catch {
      setMessage("No place found. Try an area, street or PIN code.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
          <MapPinIcon className="size-4 text-brand-700" />
          Pin your delivery location <span className="font-normal text-zinc-500">(optional)</span>
        </p>
        <Button size="sm" variant="outline" onClick={useCurrentLocation} loading={locating}>
          <CrosshairIcon className="size-4" />
          Use my current location
        </Button>
      </div>

      {showMap && (
        <>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // don't submit the address form
                  void search();
                }
              }}
              placeholder="Search area, street, landmark or PIN code"
              aria-label="Search for your area on the map"
              disabled={!ready}
            />
            <Button variant="outline" onClick={search} loading={searching} disabled={!ready || !query.trim()} aria-label="Search">
              <SearchIcon className="size-4" />
            </Button>
          </div>
          <div className="relative h-60 overflow-hidden rounded-lg bg-zinc-200 sm:h-72">
            <div ref={mapEl} className="absolute inset-0" />
            {ready ? (
              <PinDropIcon className="pointer-events-none absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-full text-brand-700 drop-shadow-md" />
            ) : (
              <p className="absolute inset-0 grid place-items-center text-sm text-zinc-500">Loading map…</p>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Move the map so the pin sits on your door. We fill in the area, city, state and PIN code; add your house or flat number below.
          </p>
        </>
      )}

      {value ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
          <span className="font-medium text-emerald-700">Location pinned</span>
          <a href={mapLink(value.lat, value.lng)} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
            View on Google Maps
          </a>
          <button type="button" onClick={() => onChange(null)} className="text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline">
            Remove pin
          </button>
        </p>
      ) : (
        !showMap && (
          <p className="text-xs text-zinc-500">
            {apiKey ? "The map isn't available right now. " : ""}Share your location so the courier can find your door.
          </p>
        )
      )}
      {message && (
        <p role="status" className="text-xs text-amber-800">
          {message}
        </p>
      )}
    </div>
  );
}
