import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import operations from "../data/operations.json";
import {
  byId,
  data,
  DAYS,
  dayItems,
  fmtDate,
  fmtShortDate,
  PRESS_SPRING,
  timingLabel,
} from "../lib.js";
import { DockAwarePanel } from "../ui.jsx";

const EARLY_DEPARTURES = new Set(["05:00", "05:52"]);
const BAG_DAYS = new Set(["2026-09-14", "2026-09-16", "2026-09-17"]);

export default function Plan({ day, setDay, setResource, sunrises }) {
  const items = dayItems(day),
    reduced = useReducedMotion();
  return (
    <section className="page">
      <div className="page-title">
        <span>TEMPORAL BOARD</span>
        <h1>Plan</h1>
        <p>
          Fixed, windowed and provisional time remain visibly different. No fake
          precision.
        </p>
      </div>
      <div className="date-rail">
        {DAYS.map((d, i) => (
          <button
            key={d}
            className={day === d ? "active" : ""}
            onClick={() => setDay(d)}
          >
            {day === d && (
              <motion.span
                className="day-indicator"
                layoutId="plan-day-indicator"
                transition={reduced ? { duration: 0 } : PRESS_SPRING}
              />
            )}
            <em>0{i + 1}</em>
            <b>{fmtShortDate(d)}</b>
            <small>
              {new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
                new Date(`${d}T12:00:00+05:30`),
              )}
            </small>
          </button>
        ))}
      </div>
      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>{fmtDate(day).toUpperCase()}</span>
          <b>{items.length} BLOCKS</b>
        </div>
        {items.length ? (
          <div className="timeline">
            {items.map((a, i) => (
              <Item
                key={a.id}
                a={a}
                i={i}
                setResource={setResource}
                sunrise={sunrises[a.date]}
              />
            ))}
          </div>
        ) : (
          <div className="empty">
            <b>Uncommitted day.</b>
            <br />
            Send the shared change through ChatGPT so GitHub remains
            authoritative.
          </div>
        )}
      </DockAwarePanel>

      <MobilityPlan day={day} />
      {day === "2026-09-15" && <StayShortlist />}
      {BAG_DAYS.has(day) && <LuggagePlan day={day} />}
    </section>
  );
}

function Item({ a, i, setResource, sunrise }) {
  const p = a.placeId && byId(data.places, a.placeId),
    r = a.sourceIds?.[0] && byId(data.resources, a.sourceIds[0]);
  const sunriseLabel =
    EARLY_DEPARTURES.has(a.timing.start) && sunrise
      ? ` · sunrise ${sunrise}`
      : "";
  return (
    <motion.article
      className={`timeline-item ${a.timing.type}`}
      whileTap={{ scale: 0.92 }}
      transition={PRESS_SPRING}
    >
      <div className="timeline-time">
        <b>
          {timingLabel(a)}
          {sunriseLabel}
        </b>
        <span>{a.timing.type}</span>
      </div>
      <div className="timeline-line">
        <i />
      </div>
      <div className="timeline-content">
        <div className="timeline-title">
          <div>
            <small>
              0{i + 1} · {a.priority}
            </small>
            <h3>{a.title}</h3>
          </div>
          <em>{a.status}</em>
        </div>
        {p && <p>{p.name}</p>}
        <p className="muted">{a.notes?.[0]}</p>
        <div className="people-chips">
          {a.participants.map((id) => (
            <span key={id}>{byId(data.members, id)?.initials}</span>
          ))}
          {r && (
            <button onClick={() => setResource({ ...r, boarding: true })}>
              Open file ↗
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function MobilityPlan({ day }) {
  const steps = operations.mobility?.[day] || [];
  if (!steps.length) return null;
  return (
    <DockAwarePanel className="panel ops-panel">
      <div className="panel-head">
        <span>LOW-FRICTION MOVEMENT</span>
        <b>{steps.length} MOVES</b>
      </div>
      <div className="ops-steps">
        {steps.map((step, index) => (
          <div key={step}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <p>{step}</p>
          </div>
        ))}
      </div>
    </DockAwarePanel>
  );
}

function StayShortlist() {
  return (
    <DockAwarePanel className="panel stay-panel">
      <div className="panel-head">
        <span>STAY SHORTLIST · DADAR EAST</span>
        <b>3 OPTIONS · CALL FIRST</b>
      </div>
      <div className="stay-window">
        <b>{operations.stayWindow.targetCheckIn}</b>
        <span>→</span>
        <b>{operations.stayWindow.checkOut}</b>
      </div>
      <p className="ops-note">{operations.stayWindow.selectionRule}</p>
      <div className="stay-list">
        {operations.stays.map((stay) => (
          <article className="stay-card" key={stay.id}>
            <div className="stay-card-head">
              <span>OPTION {String(stay.rank).padStart(2, "0")}</span>
              <em>{stay.status}</em>
            </div>
            <h3>{stay.name}</h3>
            <strong>{stay.fit}</strong>
            <p>{stay.why}</p>
            <div className="stay-facts">
              <span>
                <b>STATION</b>
                {stay.stationAccess}
              </span>
              <span>
                <b>STANDARD</b>
                {stay.standardCheckIn} in · {stay.standardCheckOut} out
              </span>
              <span>
                <b>EARLY ACCESS</b>
                {stay.earlyCheckIn}
              </span>
              <span>
                <b>PRICE SIGNAL</b>
                {stay.priceNote}
              </span>
            </div>
            <div className="stay-actions">
              <a href={stay.phoneHref}>
                <Phone aria-hidden="true" /> Call
              </a>
              <a href={stay.mapsUrl} target="_blank" rel="noreferrer">
                <MapPin aria-hidden="true" /> Map
              </a>
              {stay.email && (
                <a href={`mailto:${stay.email}`}>
                  <Mail aria-hidden="true" /> Email
                </a>
              )}
              {stay.website && (
                <a href={stay.website} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" /> Site
                </a>
              )}
            </div>
            <small className="stay-contact">{stay.phone}{stay.alternatePhone ? ` · backup ${stay.alternatePhone}` : ""}</small>
            <small className="stay-warning">{stay.watch}</small>
          </article>
        ))}
      </div>
      <div className="call-checklist">
        <b>ASK EVERY HOTEL BEFORE PAYING</b>
        {operations.callChecklist.map((item, index) => (
          <p key={item}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item}
          </p>
        ))}
      </div>
    </DockAwarePanel>
  );
}

function LuggagePlan({ day }) {
  const useLabel =
    day === "2026-09-14"
      ? "14→15 STORAGE"
      : day === "2026-09-16"
        ? "16→17 STORAGE"
        : "04:30 PICKUP";
  return (
    <DockAwarePanel className="panel luggage-panel">
      <div className="panel-head">
        <span>{useLabel}</span>
        <b>3-LAYER FALLBACK</b>
      </div>
      <p className="ops-note">{operations.luggage.principle}</p>
      <div className="luggage-options">
        {operations.luggage.options.map((option) => (
          <article key={option.id}>
            <div>
              <b>{String(option.rank).padStart(2, "0")}</b>
              <span>{option.status}</span>
            </div>
            <h3>{option.name}</h3>
            <p>{option.use}</p>
            <small>{option.rules}</small>
            <small>{option.cost}</small>
            <em>{option.watch}</em>
            <div className="stay-actions compact">
              {option.phoneHref && (
                <a href={option.phoneHref}>
                  <Phone aria-hidden="true" /> Call
                </a>
              )}
              {option.website && (
                <a href={option.website} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" /> Site
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </DockAwarePanel>
  );
}
