import React from "react";
import { motion } from "framer-motion";
import { data, formatINR, PRESS_SPRING } from "../lib.js";
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

export default function More({
  expenses,
  notes,
  setResource,
  setSheet,
  onInstall,
  installed,
  update,
  onReplayOnboarding,
}) {
  const totalPaise = expenses.reduce((sum, expense) => {
      if (!Number.isSafeInteger(expense.amountPaise)) return sum;
      return sum + expense.amountPaise;
    }, 0),
    sha = update.version
      ? update.version === "local-dev"
        ? "local-dev"
        : update.version.slice(0, 8)
      : "—";
  const enableAlerts = async () => {
    if ("Notification" in window) await Notification.requestPermission();
  };
  return (
    <section className="page">
      <div className="page-title">
        <span>SYSTEM + VAULT</span>
        <h1>More</h1>
        <p>
          Offline resources, budget ledger, personal notes and deployment state.
        </p>
      </div>
      {!installed && (
        <button className="install" onClick={onInstall}>
          <span>INSTALL DASHBOARD</span>
          <b>Add TripOS to this phone ↘</b>
        </button>
      )}
      <div className="more-grid">
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>BUDGET LEDGER</span>
            <button onClick={() => setSheet("expense")}>Add</button>
          </div>
          <strong className="metric-number small">
            {formatINR(totalPaise)}
          </strong>
          <p className="muted">
            Canonical booked costs plus local-only drafts on this phone.
          </p>
          <div className="ledger">
            {expenses.map((e) => (
              <div key={e.id}>
                <span>{e.label}</span>
                <b>{formatINR(e.amountPaise)}</b>
              </div>
            ))}
          </div>
          {(data.reimbursements || []).length > 0 && (
            <div className="ledger reimbursements">
              {data.reimbursements.map((payment) => (
                <div key={payment.id}>
                  <span>
                    {
                      data.members.find((m) => m.id === payment.fromMemberId)
                        ?.name
                    }{" "}
                    paid ·{" "}
                    {payment.coversMemberIds
                      .map(
                        (id) =>
                          data.members
                            .find((m) => m.id === id)
                            ?.name.split(" ")[0],
                      )
                      .join(" + ")}
                  </span>
                  <b>{formatINR(payment.amountPaise)}</b>
                </div>
              ))}
            </div>
          )}
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
