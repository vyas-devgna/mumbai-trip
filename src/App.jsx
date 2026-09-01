import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  data,
  PRESS_SPRING,
  toPaise,
  tripIsLive,
  useAutoUpdate,
  useStored,
  useSunrise,
  useTripClock,
} from "./lib.js";
import Now from "./screens/Now.jsx";
import Plan from "./screens/Plan.jsx";
import MapScreen from "./screens/Map.jsx";
import Group from "./screens/Group.jsx";
import More from "./screens/More.jsx";
import {
  CommandSheet,
  OnboardingOverlay,
  ResourceViewer,
  SideNav,
  Topbar,
} from "./ui.jsx";

const MAP_PREFETCH_ZOOMS = [11, 13, 14];
const TABS = new Set(["Now", "Plan", "Map", "Group", "More"]);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
const hasInstalledHint = () => {
  try {
    return localStorage.getItem("tripos-installed") === "1";
  } catch {
    return false;
  }
};
const onboardingDone = () => {
  try {
    return localStorage.getItem("tripos-onboarding-v1") === "1";
  } catch {
    return false;
  }
};

function migrateLocalExpense(expense) {
  const hasLegacyAmount = Object.prototype.hasOwnProperty.call(
    expense,
    "amount",
  );
  if (Number.isSafeInteger(expense.amountPaise) && !hasLegacyAmount)
    return expense;
  let amountPaise = 0;
  try {
    amountPaise = Number.isSafeInteger(expense.amountPaise)
      ? expense.amountPaise
      : toPaise(expense.amount);
  } catch {}
  const { amount: _legacyAmount, ...rest } = expense;
  return { ...rest, amountPaise };
}

function readRoute() {
  const raw = location.hash.slice(1);
  if (!raw) return { empty: true };
  const params = new URLSearchParams(raw),
    tab = params.get("tab"),
    day = params.get("day"),
    resourceId = params.get("resource");
  return {
    empty: false,
    tab: TABS.has(tab) ? tab : null,
    day: data.trip.startDate <= day && day <= data.trip.endDate ? day : null,
    resourceId,
    boarding: params.get("boarding") === "1",
  };
}

function fallbackHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
async function placesHash() {
  const serialized = JSON.stringify(data.places);
  try {
    if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(serialized),
      );
      return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 20);
    }
  } catch {}
  return fallbackHash(serialized);
}

function AmbientBackdrop({ live }) {
  const reduced = useReducedMotion(),
    [visible, setVisible] = useState(
      () => document.visibilityState === "visible",
    );
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const active = !reduced && visible,
    durations = live ? [24, 30, 38] : [52, 64, 76],
    waveMotion = (distance, duration) => ({
      animate: active ? { x: [0, -distance, 0] } : { x: 0 },
      transition: active
        ? { duration, repeat: Infinity, ease: "easeInOut" }
        : { duration: 0 },
    });
  return (
    <div className={`ambient-bg${live ? " live" : ""}`} aria-hidden="true">
      <div className="tide-sky" />
      <div className="tide-labels">
        <span>ARABIAN SEA</span>
        <span>{live ? "TRIP LIVE" : "PLANNING TIDE"}</span>
      </div>
      <motion.svg
        className="tide-wave tide-far"
        viewBox="0 0 2400 320"
        preserveAspectRatio="none"
        {...waveMotion(90, durations[2])}
      >
        <path d="M0 112C150 55 300 169 450 112S750 55 900 112s300 57 450 0 300-57 450 0 300 57 450 0 300-57 450 0v208H0Z" />
      </motion.svg>
      <motion.svg
        className="tide-wave tide-mid"
        viewBox="0 0 2400 320"
        preserveAspectRatio="none"
        {...waveMotion(145, durations[1])}
      >
        <path d="M0 126c120-62 255 52 390 0s270-52 405 0 270 52 405 0 270-52 405 0 270 52 405 0 270-52 405 0v194H0Z" />
      </motion.svg>
      <motion.svg
        className="tide-wave tide-near"
        viewBox="0 0 2400 320"
        preserveAspectRatio="none"
        {...waveMotion(210, durations[0])}
      >
        <path d="M0 145c105-48 210 48 315 0s210-48 315 0 210 48 315 0 210-48 315 0 210 48 315 0 210-48 315 0 210 48 315 0 210-48 315 0v175H0Z" />
      </motion.svg>
      <motion.i
        className="tide-buoy"
        animate={
          active
            ? { y: [0, -7, 1, 0], rotate: [0, 2, -1, 0] }
            : { y: 0, rotate: 0 }
        }
        transition={
          active
            ? { duration: live ? 4.5 : 7, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0 }
        }
      />
    </div>
  );
}

export default function App() {
  const initialRoute = useRef(readRoute()).current,
    reduced = useReducedMotion();
  const now = useTripClock(React),
    update = useAutoUpdate(React),
    sunrises = useSunrise(React);
  const [tab, setTab] = useState(initialRoute.tab || "Now"),
    [day, setDay] = useStored(
      React,
      "tripos-last-day",
      initialRoute.day || "2026-09-14",
    ),
    [notes, setNotes] = useStored(React, "tripos-local-notes", []),
    [localExpenses, setLocalExpenses] = useStored(
      React,
      "tripos-local-expenses",
      [],
    );
  const [resource, setResource] = useState(() => {
    const found =
      initialRoute.resourceId &&
      data.resources.find((r) => r.id === initialRoute.resourceId);
    return found ? { ...found, boarding: initialRoute.boarding } : null;
  });
  const [sheet, setSheet] = useState(null),
    [installPrompt, setInstallPrompt] = useState(null),
    [installed, setInstalled] = useState(
      () => isStandalone() || hasInstalledHint(),
    ),
    [showOnboarding, setShowOnboarding] = useState(() => !onboardingDone());

  const migratedLocalExpenses = useMemo(
    () => localExpenses.map(migrateLocalExpense),
    [localExpenses],
  );

  useEffect(() => {
    if (
      migratedLocalExpenses.some(
        (expense, index) => expense !== localExpenses[index],
      )
    )
      setLocalExpenses(migratedLocalExpenses);
  }, [localExpenses, migratedLocalExpenses, setLocalExpenses]);

  useEffect(() => {
    const restore = () => {
      const route = readRoute();
      if (route.empty) {
        setTab("Now");
        setResource(null);
        return;
      }
      if (route.tab) setTab(route.tab);
      if (route.day) setDay(route.day);
      const found =
        route.resourceId &&
        data.resources.find((r) => r.id === route.resourceId);
      setResource(found ? { ...found, boarding: route.boarding } : null);
    };
    addEventListener("hashchange", restore);
    return () => removeEventListener("hashchange", restore);
  }, [setDay]);

  useEffect(() => {
    const params = new URLSearchParams({ tab, day });
    if (resource?.id) {
      params.set("resource", resource.id);
      if (resource.boarding) params.set("boarding", "1");
    }
    const next = `#${params.toString()}`;
    if (location.hash !== next)
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}${next}`,
      );
  }, [tab, day, resource?.id, resource?.boarding]);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      try {
        localStorage.setItem("tripos-installed", "1");
      } catch {}
    }
    const before = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setInstalled(false);
      try {
        localStorage.removeItem("tripos-installed");
      } catch {}
    };
    const didInstall = () => {
      setInstallPrompt(null);
      setInstalled(true);
      try {
        localStorage.setItem("tripos-installed", "1");
      } catch {}
    };
    addEventListener("beforeinstallprompt", before);
    addEventListener("appinstalled", didInstall);
    return () => {
      removeEventListener("beforeinstallprompt", before);
      removeEventListener("appinstalled", didInstall);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const coordinates = data.places
      .filter(
        (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
      )
      .map((p) => [p.longitude, p.latitude]);
    const prefetch = async () => {
      if (cancelled || !navigator.onLine || !coordinates.length) return;
      try {
        const hash = await placesHash(),
          key = `tripos-map-anchors-z${MAP_PREFETCH_ZOOMS.join("-")}-${hash}`;
        if (cancelled || localStorage.getItem(key)) return;
        const reg = await navigator.serviceWorker.ready,
          target = reg.active || navigator.serviceWorker.controller;
        if (!target) return;
        const channel = new MessageChannel();
        const result = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 30000);
          channel.port1.onmessage = (e) => {
            clearTimeout(timer);
            resolve(e.data);
          };
          target.postMessage(
            {
              type: "PREFETCH_MAP_ANCHORS",
              zooms: MAP_PREFETCH_ZOOMS,
              coordinates,
            },
            [channel.port2],
          );
        });
        if (result?.ok && !cancelled) {
          localStorage.setItem(key, new Date().toISOString());
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const oldKey = localStorage.key(i);
            if (oldKey?.startsWith("tripos-map-anchors-") && oldKey !== key)
              localStorage.removeItem(oldKey);
          }
        }
      } catch {}
    };
    prefetch();
    addEventListener("online", prefetch);
    return () => {
      cancelled = true;
      removeEventListener("online", prefetch);
    };
  }, []);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;
    for (const a of data.activities.filter((x) => x.timing.type === "fixed")) {
      const start = new Date(`${a.date}T${a.timing.start}:00+05:30`),
        mins = (start - now) / 60000,
        key = `tripos-alert-${a.id}`;
      if (mins > 0 && mins <= 90 && !localStorage.getItem(key)) {
        new Notification(`Mumbai Trip · ${a.title}`, {
          body: `${a.timing.start} · ${a.notes?.[0] || "Upcoming fixed item"}`,
          icon: `${import.meta.env.BASE_URL}icon.svg`,
        });
        localStorage.setItem(key, "1");
      }
    }
  }, [now]);

  const expenses = useMemo(
    () => [...data.expenses, ...migratedLocalExpenses],
    [migratedLocalExpenses],
  );
  const installApp = async () => {
    if (installed) return;
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice?.outcome === "accepted") {
        setInstalled(true);
        try {
          localStorage.setItem("tripos-installed", "1");
        } catch {}
      }
      return;
    }
    setSheet("install");
  };
  const dismissOnboarding = () => {
    try {
      localStorage.setItem("tripos-onboarding-v1", "1");
    } catch {}
    setShowOnboarding(false);
  };
  const ctx = {
    now,
    day,
    setDay,
    notes,
    setNotes,
    expenses,
    localExpenses: migratedLocalExpenses,
    setLocalExpenses,
    setResource,
    setSheet,
    installPrompt,
    setInstallPrompt,
    installed,
    update,
    setTab,
    onInstall: installApp,
    sunrises,
    onReplayOnboarding: () => setShowOnboarding(true),
  };
  const screen =
    tab === "Now" ? (
      <Now {...ctx} />
    ) : tab === "Plan" ? (
      <Plan {...ctx} />
    ) : tab === "Map" ? (
      <MapScreen {...ctx} />
    ) : tab === "Group" ? (
      <Group {...ctx} />
    ) : (
      <More {...ctx} />
    );

  const pageMotion = reduced
    ? {
        initial: { opacity: 1, y: 0, scale: 1 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 1, y: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 8, scale: 0.995 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -5 },
        transition: PRESS_SPRING,
      };
  return (
    <div className="app-shell">
      <AmbientBackdrop live={tripIsLive(now)} />
      <Topbar
        now={now}
        update={update}
        day={day}
        onDaySelect={(selectedDay) => {
          setDay(selectedDay);
          setTab("Plan");
        }}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main className="page-motion" key={tab} {...pageMotion}>
          {screen}
        </motion.main>
      </AnimatePresence>
      <LayoutGroup id="tripos-command">
        <SideNav
          active={tab}
          onChange={setTab}
          onCommand={() => setSheet("command")}
          onInstall={installApp}
          installed={installed}
        />
        <AnimatePresence>
          {sheet && (
            <CommandSheet
              mode={sheet}
              onClose={() => setSheet(null)}
              {...ctx}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
      {resource && (
        <ResourceViewer
          resource={resource}
          onBoardingChange={(boarding) =>
            setResource((current) =>
              current ? { ...current, boarding } : current,
            )
          }
          onClose={() => setResource(null)}
        />
      )}
      <AnimatePresence>
        {showOnboarding && <OnboardingOverlay onDismiss={dismissOnboarding} />}
      </AnimatePresence>
    </div>
  );
}
