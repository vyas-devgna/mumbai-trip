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

const OPENFREE_STYLE = "https://tiles.openfreemap.org/styles/fiord";
const MUMBAI_BOUNDS = {
  south: 18.75,
  north: 19.35,
  west: 72.7,
  east: 73.1,
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
      maxzoom: 18,
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
      return Landmark;
    case "darshan":
      return Sparkles;
    case "hotel":
      return Hotel;
    case "restaurant":
      return Utensils;
    case "beach":
      return Waves;
    case "landmark":
      return Landmark;
    default:
      return MapPin;
  }
};

const categoryClass = (category) =>
  String(category || "place")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

const validPlace = (p) =>
  Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude);

const inMumbai = (p) =>
  validPlace(p) &&
  p.latitude > MUMBAI_BOUNDS.south &&
  p.latitude < MUMBAI_BOUNDS.north &&
  p.longitude > MUMBAI_BOUNDS.west &&
  p.longitude < MUMBAI_BOUNDS.east;

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
  const [mode, setMode] = useState("vector"),
    [scope, setScope] = useState("mumbai"),
    [mapUnavailable, setMapUnavailable] = useState(false),
    reduced = useReducedMotion();

  const visiblePlaces = useMemo(() => {
    if (scope === "mumbai") return data.places.filter(inMumbai);

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

  const markerGroups = useMemo(() => {
    const grouped = new Map();
    for (const place of visiblePlaces) {
      const key = `${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`;
      const current = grouped.get(key) || {
        latitude: place.latitude,
        longitude: place.longitude,
        places: [],
      };
      current.places.push(place);
      grouped.set(key, current);
    }
    return [...grouped.values()];
  }, [visiblePlaces]);

  const coords = useMemo(
    () => markerGroups.map((group) => [group.longitude, group.latitude]),
    [markerGroups],
  );

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
        style: OPENFREE_STYLE,
        center: [72.852, 19.0],
        zoom: 10.6,
        attributionControl: true,
      });
    } catch {
      setMapUnavailable(true);
      return;
    }

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-right",
    );
    mapRef.current = map;

    return () => {
      markerRoots.current.forEach((root) => root.unmount());
      markerRoots.current = [];
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
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

    markerGroups.forEach((group) => {
      const primary = group.places[0],
        node = document.createElement("button"),
        iconHost = document.createElement("span"),
        Icon = markerIcon(primary.category),
        root = createRoot(iconHost),
        category = categoryClass(primary.category);

      node.type = "button";
      node.className = `map-marker map-marker-${category}`;
      node.title = group.places.map((place) => place.name).join(" · ");
      node.setAttribute("aria-label", node.title);
      iconHost.className = "map-marker-icon";
      node.append(iconHost);
      root.render(<Icon aria-hidden="true" />);
      markerRoots.current.push(root);

      if (group.places.length > 1) {
        const count = document.createElement("small");
        count.className = "map-marker-count";
        count.textContent = String(group.places.length);
        node.append(count);
      }

      const popupBody = group.places
        .map(
          (place) =>
            `<div class="map-popup-place"><b>${place.name}</b><span>${place.category}</span>${place.address ? `<small>${place.address}</small>` : ""}<a href="${mapsUrl(place)}" target="_blank" rel="noreferrer">Open Google Maps ↗</a></div>`,
        )
        .join("");
      const pop = new maplibregl.Popup({
        offset: 22,
        closeButton: false,
        maxWidth: "270px",
      }).setHTML(`<div class="map-popup">${popupBody}</div>`);

      markers.current.push(
        new maplibregl.Marker({ element: node, anchor: "bottom" })
          .setLngLat([group.longitude, group.latitude])
          .setPopup(pop)
          .addTo(map),
      );
    });

    return () => {
      markerRoots.current.forEach((root) => root.unmount());
      markerRoots.current = [];
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
    };
  }, [markerGroups]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mode === "satellite" ? satellite : OPENFREE_STYLE);
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      if (map.getLayer("route")) map.removeLayer("route");
      if (map.getSource("route")) map.removeSource("route");

      if (scope !== "mumbai" && coords.length > 1) {
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

      if (!coords.length) return;
      if (coords.length === 1) {
        map.easeTo({
          center: coords[0],
          zoom: 13,
          duration: reduced ? 0 : 450,
        });
        return;
      }

      const bounds = coords.reduce(
        (current, coordinate) => current.extend(coordinate),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, {
        padding: scope === "mumbai" ? 72 : 56,
        maxZoom: scope === "mumbai" ? 11.4 : 13.5,
        duration: reduced ? 0 : 500,
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once("style.load", draw);
  }, [coords, mode, reduced, scope]);

  return (
    <section className="map-page">
      <div className="map-title">
        <div className="page-title">
          <span>GEOGRAPHIC BOARD</span>
          <h1>Map</h1>
        </div>
        <div className="segment">
          <button
            className={mode === "vector" ? "active" : ""}
            onClick={() => setMode("vector")}
          >
            {mode === "vector" && (
              <motion.span
                className="segment-indicator"
                layoutId="map-mode-indicator"
                transition={reduced ? { duration: 0 } : PRESS_SPRING}
              />
            )}
            <b>Map</b>
          </button>
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
              <i /> {scope === "mumbai" ? "trip anchors" : "planned sequence"}
            </span>
            <span>
              {mode === "vector" ? "OpenFreeMap · Fiord vector" : "Esri satellite"}
            </span>
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
