import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import QRCode from "qrcode";
import {
  CalendarDays,
  Download,
  Gauge,
  MapPinned,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  Share2,
  Users,
  X,
} from "lucide-react";
import { BASE, data, PRESS_SPRING, tripIsLive, vibrate } from "./lib.js";

export function Topbar({ now, update }) {
  const start = new Date(`${data.trip.startDate}T05:00:00+05:30`),
    days = Math.max(0, Math.ceil((start - now) / 86400000)),
    live = tripIsLive(now);
  return (
    <header className="topbar">
      <div className="brand">
        <img src={`${BASE}icon.svg`} alt="" />
        <div>
          <span>MUMBAI / 14—17 SEP</span>
          <b>TRIP CONTROL</b>
        </div>
      </div>
      <div className="sync">
        <i className={update.label.toLowerCase()} />
        <div>
          <b>{live ? "LIVE" : `${days}D`}</b>
          <small>{update.label}</small>
        </div>
      </div>
    </header>
  );
}

export function SideNav({ active, onChange, onCommand, onInstall, installed }) {
  const tabs = [
    ["Now", Gauge],
    ["Plan", CalendarDays],
    ["Map", MapPinned],
    ["Group", Users],
    ["More", MoreHorizontal],
  ];
  return (
    <nav className="side-nav" aria-label="Trip dashboard navigation">
      <motion.button
        layoutId="command-surface"
        className="quick"
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.04 }}
        transition={PRESS_SPRING}
        onClick={onCommand}
        aria-label="Add or change trip"
      >
        <Plus />
        <b>Add</b>
      </motion.button>
      <div className="side-nav-sep" />
      {tabs.map(([tab, Icon]) => (
        <motion.button
          key={tab}
          className={active === tab ? "active" : ""}
          whileTap={{ scale: 0.92 }}
          whileHover={{ x: -2 }}
          transition={PRESS_SPRING}
          onClick={() => onChange(tab)}
          aria-current={active === tab ? "page" : undefined}
        >
          <Icon />
          <b>{tab}</b>
        </motion.button>
      ))}
      {!installed && (
        <>
          <div className="side-nav-sep" />
          <motion.button
            className="install-nav"
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.03 }}
            transition={PRESS_SPRING}
            onClick={onInstall}
            aria-label="Install TripOS"
          >
            <Download />
            <b>Install</b>
          </motion.button>
        </>
      )}
    </nav>
  );
}

export function DockAwarePanel({ className = "", children, ...props }) {
  const probeRef = useRef(null),
    [yielding, setYielding] = useState(false),
    [cut, setCut] = useState({ width: 72, height: 72 }),
    reduced = useReducedMotion();
  useEffect(() => {
    const probe = probeRef.current,
      panel = probe?.parentElement,
      dock = document.querySelector(".side-nav");
    if (
      !probe ||
      !panel ||
      !dock ||
      !("IntersectionObserver" in window) ||
      !("ResizeObserver" in window)
    )
      return;
    let observer;
    const measure = () => {
      observer?.disconnect();
      const dockRect = dock.getBoundingClientRect(),
        panelRect = panel.getBoundingClientRect(),
        gap = 10;
      const width = Math.ceil(dockRect.width + gap),
        height = Math.ceil(
          Math.max(
            12,
            Math.min(dockRect.height + gap, Math.max(12, panelRect.height - 1)),
          ),
        );
      setCut((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
      const top = Math.max(0, Math.floor(dockRect.top - gap)),
        left = Math.max(0, Math.floor(dockRect.left - gap));
      observer = new IntersectionObserver(
        ([entry]) => setYielding(entry.isIntersecting),
        {
          root: null,
          rootMargin: `-${top}px 0px 0px -${left}px`,
          threshold: 0,
        },
      );
      observer.observe(probe);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(dock);
    resize.observe(panel);
    resize.observe(document.documentElement);
    return () => {
      observer?.disconnect();
      resize.disconnect();
    };
  }, []);
  const full = "polygon(0 0,100% 0,100% 100%,100% 100%,100% 100%,0 100%)";
  const inset = `polygon(0 0,100% 0,100% calc(100% - ${cut.height}px),calc(100% - ${cut.width}px) calc(100% - ${cut.height}px),calc(100% - ${cut.width}px) 100%,0 100%)`;
  return (
    <motion.article
      {...props}
      className={`dock-aware ${className}`.trim()}
      animate={{ clipPath: yielding ? inset : full }}
      transition={reduced ? { duration: 0 } : PRESS_SPRING}
    >
      {children}
      <span ref={probeRef} className="dock-probe" aria-hidden="true" />
    </motion.article>
  );
}

export function LocalQr({ value, label, size = 132 }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!canvas.current || !value) return;
    QRCode.toCanvas(canvas.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#252724", light: "#fbf8f0" },
    }).catch(() => {});
  }, [value, size]);
  return (
    <div className="local-qr">
      <canvas ref={canvas} aria-label={label} />
      <small>{label}</small>
    </div>
  );
}

export function CommandSheet({
  mode,
  onClose,
  notes,
  setNotes,
  localExpenses,
  setLocalExpenses,
}) {
  const [view, setView] = useState(mode === "command" ? "menu" : mode),
    [text, setText] = useState(""),
    [amount, setAmount] = useState(""),
    [label, setLabel] = useState(""),
    [participants, setParticipants] = useState(data.members.map((m) => m.id)),
    [payerId, setPayerId] = useState(data.members[0]?.id || ""),
    [success, setSuccess] = useState(null);
  const timerRef = useRef(null),
    reduced = useReducedMotion();
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const finish = (message) => {
    setSuccess(message);
    timerRef.current = setTimeout(onClose, 720);
  };
  const saveNote = () => {
    if (!text.trim()) return;
    setNotes([
      ...notes,
      {
        id: `note-${Date.now()}`,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      },
    ]);
    finish("NOTE SAVED ON THIS PHONE");
  };
  const saveExpense = () => {
    const value = Number(amount);
    if (!(value > 0) || !label.trim() || !participants.length || !payerId)
      return;
    setLocalExpenses([
      ...localExpenses,
      {
        id: `local-${Date.now()}`,
        amount: value,
        label: label.trim(),
        participantIds: participants,
        payerId,
        category: "local-draft",
        date: new Date().toISOString().slice(0, 10),
        status: "local-only",
      },
    ]);
    finish("EXPENSE DRAFT SAVED");
  };
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {}
    onClose();
  };
  const title =
    view === "menu"
      ? "Add / change"
      : view === "note"
        ? "Local note"
        : view === "expense"
          ? "Local expense"
          : view === "shared"
            ? "Shared change"
            : view === "installed"
              ? "Installed"
              : "Install TripOS";
  return (
    <motion.div
      className="sheet-bg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduced ? { duration: 0 } : PRESS_SPRING}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="sheet">
        <div className="handle" />
        <motion.header
          layoutId={mode === "command" ? "command-surface" : undefined}
          transition={reduced ? { duration: 0 } : PRESS_SPRING}
        >
          <div>
            <span>CONTEXTUAL ACTION</span>
            <h2>{title}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </motion.header>
        <AnimatePresence mode="wait" initial={false}>
          {success ? (
            <motion.div
              className="sheet-success"
              key="success"
              initial={reduced ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduced ? { duration: 0 } : PRESS_SPRING}
            >
              <b>{success}</b>
              <span>LOCAL STATE WRITTEN</span>
            </motion.div>
          ) : (
            <motion.div
              key={view}
              initial={reduced ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -3 }}
              transition={reduced ? { duration: 0 } : PRESS_SPRING}
            >
              {view === "menu" && (
                <div className="sheet-menu">
                  <button onClick={() => setView("note")}>
                    <b>Note on this phone</b>
                    <span>Offline, private to this browser</span>
                  </button>
                  <button onClick={() => setView("expense")}>
                    <b>Draft an expense</b>
                    <span>Local ledger until committed</span>
                  </button>
                  <button onClick={() => setView("shared")}>
                    <b>Change the shared trip</b>
                    <span>Copy a precise ChatGPT command</span>
                  </button>
                </div>
              )}
              {view === "note" && (
                <div className="form">
                  <textarea
                    autoFocus
                    placeholder="Bag is at reception, call before leaving…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button className="save" onClick={saveNote}>
                    Save offline note
                  </button>
                </div>
              )}
              {view === "expense" && (
                <div className="form">
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder="Amount ₹"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <input
                    placeholder="What was it?"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <div className="selector-grid">
                    <div className="selector-block">
                      <label>Paid by</label>
                      <div className="payer-select">
                        {data.members.map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            className={payerId === m.id ? "active" : ""}
                            onClick={() => setPayerId(m.id)}
                            title={m.name}
                          >
                            {m.initials}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="selector-block">
                      <label>Split between</label>
                      <div className="participant-select">
                        {data.members.map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            className={
                              participants.includes(m.id) ? "active" : ""
                            }
                            onClick={() =>
                              setParticipants(
                                participants.includes(m.id)
                                  ? participants.filter((id) => id !== m.id)
                                  : [...participants, m.id],
                              )
                            }
                          >
                            {m.initials}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <small>
                    Local-only. Shared expenses must be committed through
                    ChatGPT.
                  </small>
                  <button className="save" onClick={saveExpense}>
                    Add local draft
                  </button>
                </div>
              )}
              {view === "shared" && (
                <div className="sheet-menu">
                  <button
                    onClick={() =>
                      copy(
                        "Add this to the Mumbai TripOS inbox, research it, choose the best slot, validate, commit and deploy: ",
                      )
                    }
                  >
                    <b>Add a place</b>
                    <span>Candidate ingestion</span>
                  </button>
                  <button
                    onClick={() =>
                      copy(
                        "Replan Mumbai TripOS around this change, preserve fixed bookings, update travel legs, validate, commit and deploy: ",
                      )
                    }
                  >
                    <b>Replan</b>
                    <span>Safe downstream change</span>
                  </button>
                  <button
                    onClick={() =>
                      copy(
                        "Add this expense to the Mumbai TripOS shared ledger. Record the payerId for the person who actually paid, the participantIds for everyone sharing it, amount, date and category. If I have not said who paid, ask me for the payer before committing. Validate, commit to main and deploy: ",
                      )
                    }
                  >
                    <b>Share an expense</b>
                    <span>Canonical ledger with payer</span>
                  </button>
                </div>
              )}
              {view === "install" && <InstallHelp />}
              {view === "installed" && (
                <div className="install-help">
                  <div className="install-step">
                    <i>OK</i>
                    <div>
                      <b>TripOS is already running as an installed app.</b>
                      <span>
                        Updates are detected through version.json on resume,
                        reconnect and the regular update check.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.div>
  );
}

function InstallHelp() {
  const installUrl = new URL(BASE, location.origin).href;
  return (
    <div className="install-help">
      <div className="install-step">
        <i>01</i>
        <div>
          <b>Chrome / Android</b>
          <span>
            Open the browser menu and choose Install app or Add to Home screen.
            If the browser exposes the native install prompt, the Install button
            launches it directly.
          </span>
        </div>
      </div>
      <div className="install-step">
        <i>02</i>
        <div>
          <b>Safari / iPhone</b>
          <span>
            Use Share → Add to Home Screen. The installed dashboard keeps the
            app shell and offline vault cached.
          </span>
        </div>
      </div>
      <LocalQr value={installUrl} label="SCAN TO OPEN INSTALL URL" />
    </div>
  );
}

async function shareResource(resource) {
  try {
    const r = await fetch(resource.path),
      blob = await r.blob(),
      extension = resource.path.split(".").pop() || resource.type,
      file = new File([blob], `${resource.id}.${extension}`, {
        type:
          blob.type ||
          (resource.type === "pdf" ? "application/pdf" : "image/jpeg"),
      });
    if (navigator.canShare?.({ files: [file] }))
      return navigator.share({ title: resource.label, files: [file] });
    if (navigator.share)
      return navigator.share({
        title: resource.label,
        url: new URL(resource.path, location.origin).href,
      });
  } catch {}
}

export function ResourceViewer({ resource, onBoardingChange, onClose }) {
  const [boarding, setBoarding] = useState(Boolean(resource.boarding)),
    wakeLockRef = useRef(null);
  const source =
    resource.type === "pdf"
      ? `${resource.path}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`
      : resource.path;
  useEffect(() => setBoarding(Boolean(resource.boarding)), [resource.boarding]);
  useEffect(() => {
    if (boarding) vibrate(35);
    onBoardingChange?.(boarding);
  }, [boarding]);
  useEffect(() => {
    if (!boarding || !navigator.wakeLock?.request) return;
    let active = true;
    const acquire = async () => {
      if (
        !active ||
        document.visibilityState !== "visible" ||
        (wakeLockRef.current && !wakeLockRef.current.released)
      )
        return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (!active) {
          await lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener(
          "release",
          () => {
            if (wakeLockRef.current === lock) wakeLockRef.current = null;
          },
          { once: true },
        );
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (lock && !lock.released) lock.release().catch(() => {});
    };
  }, [boarding]);

  return (
    <div className={`viewer${boarding ? " boarding" : ""}`}>
      <header>
        <div>
          <span>{boarding ? "BOARDING MODE" : "OFFLINE VAULT"}</span>
          <b>{resource.label}</b>
          <small>{resource.meta}</small>
        </div>
        <div className="viewer-actions">
          <button onClick={() => setBoarding((v) => !v)}>
            {boarding ? (
              <>
                <Minimize2 size={14} /> Exit
              </>
            ) : (
              <>
                <Maximize2 size={14} /> Boarding
              </>
            )}
          </button>
          {!boarding && (
            <button onClick={() => shareResource(resource)}>
              <Share2 size={14} /> Share
            </button>
          )}
          <button onClick={onClose}>
            <X size={14} /> Close
          </button>
        </div>
      </header>
      <div className="viewer-body">
        <div className="resource-stage">
          {resource.type === "pdf" ? (
            <object
              data={source}
              type="application/pdf"
              aria-label={resource.label}
            >
              <iframe src={source} title={resource.label} />
            </object>
          ) : resource.type === "image" ? (
            <img src={resource.path} alt={resource.label} />
          ) : (
            <a href={resource.url} target="_blank" rel="noreferrer">
              Open resource
            </a>
          )}
        </div>
        {boarding && resource.destinationUrl && (
          <a
            className="boarding-destination"
            href={resource.destinationUrl}
            target="_blank"
            rel="noreferrer"
          >
            <LocalQr
              value={resource.destinationUrl}
              label="DESTINATION"
              size={112}
            />
            <b>{resource.destinationLabel}</b>
            <span>OPEN MAPS</span>
          </a>
        )}
      </div>
      {!boarding && (
        <footer>
          Actual source file. Cached after a successful online load. This Pages
          site is public; these copies contain booking information.
        </footer>
      )}
    </div>
  );
}

export function OnboardingOverlay({ onDismiss }) {
  const reduced = useReducedMotion(),
    installUrl = new URL(BASE, location.origin).href;
  const panels = [
    ["01", "NEXT ANCHOR", "WHAT MOVES NEXT"],
    ["02", "BUDGET", "KNOWN COSTS"],
    ["03", "SIGNALS", "FACTS THAT EXPIRE"],
    ["04", "FIXED SPINE", "DON'T BREAK THESE"],
    ["05", "OFFLINE VAULT", "ACTUAL SOURCE FILES"],
    ["06", "NOTES", "THIS PHONE ONLY"],
  ];
  return (
    <motion.div
      className="onboarding-bg"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduced ? { duration: 0 } : PRESS_SPRING}
    >
      <motion.section
        className="onboarding"
        initial={reduced ? false : { scale: 0.97, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={reduced ? undefined : { scale: 0.98, y: 8 }}
        transition={reduced ? { duration: 0 } : PRESS_SPRING}
      >
        <header>
          <span>READ THE BOARD ONCE</span>
          <h1>Six panels. One source of truth.</h1>
          <p>Use the board. Do not invent shared state.</p>
        </header>
        <div className="onboarding-panels">
          {panels.map(([number, title, note]) => (
            <div key={number}>
              <em>{number}</em>
              <b>{title}</b>
              <span>{note}</span>
            </div>
          ))}
        </div>
        <div className="state-model">
          <span>SHARED STATE MOVES ONE WAY</span>
          <b>CHATGPT → GITHUB → PAGES</b>
          <p>
            If it is not committed, it is not shared. Local notes and drafts
            stay on this phone.
          </p>
        </div>
        <LocalQr value={installUrl} label="SCAN TO OPEN INSTALL URL" />
        <button onClick={onDismiss}>ENTER TRIPOS</button>
      </motion.section>
    </motion.div>
  );
}
