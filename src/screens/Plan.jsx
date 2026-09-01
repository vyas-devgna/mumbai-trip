import React from "react";
import { motion, useReducedMotion } from "framer-motion";
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
