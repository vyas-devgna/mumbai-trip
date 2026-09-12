import React from "react";
import { motion } from "framer-motion";
import { data, PRESS_SPRING } from "../lib.js";
import appsCatalog from "../data/apps.json";
import { DockAwarePanel } from "../ui.jsx";

const fmtTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "not confirmed yet";

function detectDevice() {
  if (typeof navigator === "undefined")
    return { os: "other", label: "Unknown device", store: "Open site" };
  const ua = navigator.userAgent || "",
    platform = navigator.userAgentData?.platform || navigator.platform || "",
    touch = navigator.maxTouchPoints || 0,
    ios =
      /iPhone|iPad|iPod/i.test(ua) ||
      (/Mac/i.test(platform) && touch > 1),
    android = /Android/i.test(ua);
  if (ios) return { os: "ios", label: "iPhone / iPad", store: "App Store" };
  if (android) return { os: "android", label: "Android", store: "Google Play" };
  return { os: "other", label: platform || "Other device", store: "Open site" };
}

function appLink(app, os) {
  if (os === "ios") return app.iosUrl;
  if (os === "android") return app.androidUrl;
  return app.webUrl;
}

export default function More({
  notes,
  setResource,
  setSheet,
  onInstall,
  installed,
  update,
  onReplayOnboarding,
}) {
  const sha = update.version
      ? update.version === "local-dev"
        ? "local-dev"
        : update.version.slice(0, 8)
      : "—",
    device = detectDevice(),
    standalone =
      installed ||
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  const enableAlerts = async () => {
    if ("Notification" in window) await Notification.requestPermission();
  };
  return (
    <section className="page">
      <div className="page-title">
        <span>SYSTEM + VAULT</span>
        <h1>More</h1>
        <p>Offline resources, trip apps, personal notes, alerts and deployment state.</p>
      </div>
      {!installed && (
        <button className="install" onClick={onInstall}>
          <span>INSTALL DASHBOARD</span>
          <b>Add TripOS to this phone ↘</b>
        </button>
      )}
      <div className="more-grid">
        <DockAwarePanel className="panel trip-apps-panel">
          <div className="panel-head">
            <span>TRIP APPS</span>
            <b>4 RECOMMENDED</b>
          </div>
          <div className="device-strip">
            <div>
              <b>{device.label}</b>
              <small>
                TripOS is {standalone ? "running as an installed PWA" : "open in browser mode"}. Links below automatically use the right store.
              </small>
            </div>
            <span className="device-os">{device.os}</span>
          </div>
          <div className="trip-app-grid">
            {appsCatalog.apps.map((app) => (
              <article className="trip-app-card" key={app.id}>
                <div className="trip-app-rank">0{app.rank}</div>
                <div className="trip-app-copy">
                  <div className="trip-app-title">
                    <b>{app.name}</b>
                    <span>{app.priority} · {app.category}</span>
                  </div>
                  <p>{app.summary}</p>
                  <small>{app.tripUse}</small>
                </div>
                <a
                  className="trip-app-link"
                  href={appLink(app, device.os)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {device.store} ↗
                </a>
              </article>
            ))}
          </div>
          <p className="trip-app-note">
            Checked {appsCatalog.checkedAt}. Browser security does not let TripOS reliably inspect whether third-party apps are already installed, so this panel detects the phone OS and sends you to the correct official store page.
          </p>
        </DockAwarePanel>

        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>OFFLINE FILES</span>
            <b>{data.resources.length}</b>
          </div>
          <div className="resource-list">
            {data.resources.map((r) => (
              <motion.button
                key={r.id}
                whileTap={{ scale: 0.92 }}
                transition={PRESS_SPRING}
                onClick={() => setResource(r)}
              >
                <i className={r.type}>{r.type === "pdf" ? "PDF" : "IMG"}</i>
                <div>
                  <b>{r.label}</b>
                  <small>{r.meta}</small>
                </div>
                <span>↗</span>
              </motion.button>
            ))}
          </div>
        </DockAwarePanel>
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>PERSONAL NOTES</span>
            <button onClick={() => setSheet("note")}>Add</button>
          </div>
          <p className="muted">
            {notes.length
              ? `${notes.length} note${notes.length === 1 ? "" : "s"} stored offline on this device.`
              : "No notes on this device."}
          </p>
        </DockAwarePanel>
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>LOCAL ALERTS</span>
            <button onClick={enableAlerts}>Enable</button>
          </div>
          <p className="muted">
            When notification permission is granted, TripOS warns about fixed
            anchors within 90 minutes while the installed app is active or
            resumed. Background delivery is platform-dependent.
          </p>
        </DockAwarePanel>
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>DEPLOYMENT</span>
            <div className="deploy-actions">
              <div className="deploy-status">
                <b className="live">● {update.label}</b>
                <small>
                  {sha} · checked {fmtTime(update.confirmedAt)}
                </small>
              </div>
              <button className="deploy-check" onClick={update.check}>
                Check now
              </button>
            </div>
          </div>
          <div className="system-rows">
            <div>
              <b>Source</b>
              <span>GitHub main</span>
            </div>
            <div>
              <b>Build</b>
              <span>{sha}</span>
            </div>
            <div>
              <b>Built at</b>
              <span>{fmtTime(update.builtAt)}</span>
            </div>
            <div>
              <b>Distribution</b>
              <span>GitHub Pages</span>
            </div>
            <div>
              <b>Offline</b>
              <span>app + vault + anchor tiles</span>
            </div>
            <div>
              <b>Refresh</b>
              <span>60s + resume + reconnect</span>
            </div>
            <div>
              <b>Map</b>
              <span>satellite / street</span>
            </div>
          </div>
          <button className="replay-onboarding" onClick={onReplayOnboarding}>
            Replay six-panel brief
          </button>
        </DockAwarePanel>
      </div>
    </section>
  );
}
