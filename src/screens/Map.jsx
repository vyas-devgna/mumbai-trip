import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "framer-motion";
import * as maplibregl from "maplibre-gl";
import {
  ExternalLink,
  Hotel,
  Landmark,
  MapPin,
  Sparkles,
  Train,
  Utensils,
  Waves,
} from "lucide-react";
import { byId, data, DAYS, dayItems, PRESS_SPRING } from "../lib.js";
import { DockAwarePanel } from "../ui.jsx";

const street = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 14,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "street", type: "raster", source: "osm" }],
};

const satellite = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 14,
      attribution: "Tiles © Esri",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "sat" }],
};

const mapsUrl = (p) =>
  p.googleMapsUrl ||
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.latitude},${p.longitude}`)}`;

const markerIcon = (category) => {
  switch (category) {
    case "station":
      return Train;
    case "temple":
    case "landmark":
      return Landmark;
    case "darshan":
      return Sparkles;
    case "hotel":
      return Hotel;
    case "restaurant":
      return Utensils;
    case "beach":
      return Waves;
    default:
      return MapPin;
  }
};

const categoryClass = (category) =>
  String(category || "place")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

const validPlace = (place) =>
  Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude);

const inMumbaiMap = (place) =>
  validPlace(place) &&
  place.latitude > 18.75 &&
  place.latitude < 19.35 &&
  place.longitude > 72.7 &&
  place.longitude < 73.1;

function hasWebGL2() {
  try {
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

export default function MapScreen({ setDay }) {
  const el = useRef(null),
    mapRef = useRef(null),
    markers = useRef([]),
    markerRoots = useRef([]);
  const [mode, setMode] = useState("satellite"),
    [scope, setScope] = useState("mumbai"),
    [mapUnavailable, setMapUnavailable] = useState(false),
    reduced = useReducedMotion();

  const visiblePlaces = useMemo(() => {
    if (scope === "mumbai") return data.places.filter(inMumbaiMap);

    const ids = new Set();
    for (const activity of dayItems(scope)) {
      if (activity.placeId) ids.add(activity.placeId);
    }
    for (const leg of data.travelLegs.filter((item) => item.date === scope)) {
      if (leg.fromPlaceId) ids.add(leg.fromPlaceId);
      if (leg.toPlaceId) ids.add(leg.toPlaceId);
    }
    return data.places.filter((place) => ids.has(place.id) && validPlace(place));
  }, [scope]);

  const coords = useMemo(() => {
    const out = [];
    for (const place of visiblePlaces) {
      if (
        !out.some(
          (coordinate) =>
            coordinate[0] === place.longitude && coordinate[1] === place.latitude,
        )
      )
        out.push([place.longitude, place.latitude]);
    }
    return out;
  }, [visiblePlaces]);

  useEffect(() => {
    if (mapRef.current || !el.current) return;
    if (!hasWebGL2()) {
      setMapUnavailable(true);
      return;
    }

    let map;
    try {
      map = new maplibregl.Map({
        container: el.current,
        style: satellite,
        center: [72.846, 19.015],
        zoom: 11.2,
      });
    } catch {
      setMapUnavailable(true);
      return;
    }

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRoots.current.forEach((root) => root.unmount());
    markerRoots.current = [];
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    markers.current = visiblePlaces.map((place) => {
      const node = document.createElement("button"),
        iconHost = document.createElement("span"),
        Icon = markerIcon(place.category),
        root = createRoot(iconHost),
        category = categoryClass(place.category),
        url = mapsUrl(place);

      node.type = "button";
      node.className = `map-marker map-marker-${category}`;
      node.title = place.name;
      node.setAttribute("aria-label", place.name);
      iconHost.className = "map-marker-icon";
      node.append(iconHost);
      root.render(<Icon aria-hidden="true" />);
      markerRoots.current.push(root);

      const pop = new maplibregl.Popup({
        offset: 18,
        closeButton: false,
      }).setHTML(
        `<div class="map-popup"><b>${place.name}</b><span>${place.category}</span>${place.address ? `<small>${place.address}</small>` : ""}<a href="${url}" target="_blank" rel="noreferrer">Open Google Maps ↗</a></div>`,
      );

      return new maplibregl.Marker({ element: node, anchor: "bottom" })
        .setLngLat([place.longitude, place.latitude])
        .setPopup(pop)
        .addTo(map);
    });

    return () => {
      markerRoots.current.forEach((root) => root.unmount());
      markerRoots.current = [];
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
    };
  }, [visiblePlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mode === "satellite" ? satellite : street);
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      if (map.getLayer("route")) map.removeLayer("route");
      if (map.getSource("route")) map.removeSource("route");
      if (coords.length > 1) {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: coords },
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#f0a627",
            "line-width": 4,
            "line-opacity": 0.95,
            "line-dasharray": [1.5, 1.2],
          },
        });
      }
      if (coords.length) {
        const bounds = coords.reduce(
          (current, coordinate) => current.extend(coordinate),
          new maplibregl.LngLatBounds(coords[0], coords[0]),
        );
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 14,
          duration: reduced ? 0 : 500,
        });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once("style.load", draw);
  }, [coords, mode, reduced]);

  return (
    <section className="map-page">
      <div className="map-title">
        <div className="page-title">
          <span>GEOGRAPHIC BOARD</span>
          <h1>Map</h1>
        </div>
        <div className="segment">
          <button
            className={mode === "satellite" ? "active" : ""}
            onClick={() => setMode("satellite")}
          >
            {mode === "satellite" && (
              <motion.span
                className="segment-indicator"
                layoutId="map-mode-indicator"
                transition={reduced ? { duration: 0 } : PRESS_SPRING}
              />
            )}
            <b>Satellite</b>
          </button>
          <button
            className={mode === "street" ? "active" : ""}
            onClick={() => setMode("street")}
          >
            {mode === "street" && (
              <motion.span
                className="segment-indicator"
                layoutId="map-mode-indicator"
                transition={reduced ? { duration: 0 } : PRESS_SPRING}
              />
            )}
            <b>Street</b>
          </button>
        </div>
      </div>

      <div className="map-days">
        <button
          className={scope === "mumbai" ? "active" : ""}
          onClick={() => setScope("mumbai")}
        >
          Mumbai
        </button>
        {DAYS.map((d) => (
          <button
            key={d}
            className={scope === d ? "active" : ""}
            onClick={() => {
              setScope(d);
              setDay(d);
            }}
          >
            {new Date(`${d}T12:00:00+05:30`).getDate()}
          </button>
        ))}
      </div>

      <div className="map-layout">
        <div className="map-frame">
          {mapUnavailable ? (
            <div className="map-canvas map-fallback">
              <span>STATIC LOCATION BOARD</span>
              <b>MAP RENDERER UNAVAILABLE</b>
              <p>Use the indexed anchors. Map links stay live.</p>
            </div>
          ) : (
            <div ref={el} className="map-canvas" />
          )}
          <div className="map-legend">
            <span>
              <i /> planned sequence
            </span>
            <span>anchor tiles prefetched · live detail online</span>
          </div>
        </div>

        <DockAwarePanel className="panel location-panel">
          <div className="panel-head">
            <span>TRIP LOCATIONS</span>
            <b>{data.places.length} ANCHORS</b>
          </div>
          <div className="location-list">
            {data.places.map((p, i) => {
              const Icon = markerIcon(p.category);
              return (
                <a key={p.id} href={mapsUrl(p)} target="_blank" rel="noreferrer">
                  <span
                    className={`location-index location-icon location-icon-${categoryClass(p.category)}`}
                  >
                    <Icon aria-hidden="true" />
                    <small>{String(i + 1).padStart(2, "0")}</small>
                  </span>
                  <span className="location-copy">
                    <b>{p.name}</b>
                    <small>{p.address || p.category}</small>
                  </span>
                  <ExternalLink aria-hidden="true" />
                </a>
              );
            })}
          </div>
        </DockAwarePanel>
      </div>
    </section>
  );
}