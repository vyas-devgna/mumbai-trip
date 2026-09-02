import data from "./data/trip.json";
import SunCalc from "suncalc";

export { data };
export const BASE = import.meta.env.BASE_URL;
export const DAYS = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"];
export const PRESS_SPRING = { type: "spring", stiffness: 300, damping: 30 };
export const byId = (arr, id) => arr.find((x) => x.id === id);
const RUNNING_BUILD =
  typeof __TRIPOS_BUILD__ === "string" ? __TRIPOS_BUILD__ : "local-dev";

const assertPaise = (value, label = "paise") => {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${label} must be a safe integer`);
  return value;
};

export function toPaise(value) {
  const normalized = String(value ?? "")
      .trim()
      .replace(/[₹,\s]/g, ""),
    match = /^([+-]?)(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) throw new TypeError("INR value must have at most two decimals");
  const whole = Number(match[2]),
    fraction = Number((match[3] || "").padEnd(2, "0")),
    absolutePaise = whole * 100 + fraction;
  if (!Number.isSafeInteger(absolutePaise))
    throw new RangeError("INR value exceeds safe integer paise");
  return match[1] === "-" ? -absolutePaise : absolutePaise;
}

export const fromPaise = (paise) => assertPaise(paise) / 100;

export function formatINR(paise) {
  const exactPaise = assertPaise(paise),
    showPaise = Math.abs(exactPaise) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(fromPaise(exactPaise));
}

// Pair these shares with member ids sorted ascending. That stable order owns
// the first totalPaise % n remainder shares and therefore the extra paisa.
export function splitPaise(totalPaise, n) {
  const total = assertPaise(totalPaise, "totalPaise");
  if (total < 0) throw new RangeError("totalPaise cannot be negative");
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new RangeError("n must be a positive integer");
  const divisor = BigInt(n),
    exactTotal = BigInt(total),
    base = Number(exactTotal / divisor),
    remainder = Number(exactTotal % divisor);
  return Array.from({ length: n }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}
export const fmtDate = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00+05:30`));
export const fmtShortDate = (date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00+05:30`),
  );
export const timingLabel = (a) =>
  a.timing.start ||
  (a.timing.earliest ? `${a.timing.earliest}–${a.timing.latest}` : "Flexible");
export const activityStart = (a) =>
  new Date(
    `${a.date}T${a.timing.start || a.timing.earliest || "23:59"}:00+05:30`,
  );
export const dayItems = (day) =>
  data.activities
    .filter((a) => a.date === day)
    .sort((a, b) => activityStart(a) - activityStart(b));
export const tripIsLive = (now) =>
  now >= new Date(`${data.trip.startDate}T00:00:00+05:30`) &&
  now <= new Date(`${data.trip.endDate}T23:59:59+05:30`);
export const vibrate = (pattern) => {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate(pattern);
  } catch {}
};

export function useSunrise(React) {
  const { useMemo } = React;
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: data.trip.timezone,
    });
    return Object.fromEntries(
      DAYS.map((date) => {
        const noon = new Date(`${date}T12:00:00+05:30`);
        const sunrise = SunCalc.getTimes(
          noon,
          data.trip.solar.latitude,
          data.trip.solar.longitude,
        ).sunrise;
        return [
          date,
          Number.isNaN(sunrise.getTime()) ? null : formatter.format(sunrise),
        ];
      }).filter(([, value]) => value),
    );
  }, []);
}

export function useStored(React, key, initial) {
  const { useEffect, useState } = React;
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

export function useTripClock(React) {
  const { useEffect, useState } = React;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useAutoUpdate(React) {
  const { useCallback, useEffect, useRef, useState } = React;
  const [state, setState] = useState({
    label: navigator.onLine ? "Checking" : "Offline",
    version: null,
    builtAt: null,
    confirmedAt: null,
  });
  const regRef = useRef(null),
    stoppedRef = useRef(false),
    reloadRef = useRef(false);

  const check = useCallback(async () => {
    if (stoppedRef.current || reloadRef.current) return;
    if (!navigator.onLine) {
      setState((prev) => ({ ...prev, label: "Offline" }));
      return;
    }
    setState((prev) => ({ ...prev, label: "Checking" }));
    try {
      if ("serviceWorker" in navigator) {
        regRef.current =
          regRef.current ||
          (await navigator.serviceWorker.register(`${BASE}sw.js`, {
            updateViaCache: "none",
          }));
        await regRef.current.update().catch(() => {});
      }

      const response = await fetch(`${BASE}version.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("version");

      const latest = await response.json(),
        latestVersion = latest.version || null,
        confirmedAt = new Date().toISOString(),
        needsUpdate =
          latestVersion &&
          latestVersion !== "local-dev" &&
          latestVersion !== RUNNING_BUILD;

      if (needsUpdate) {
        reloadRef.current = true;
        setState({
          label: "Updating",
          version: latestVersion,
          builtAt: latest.builtAt || null,
          confirmedAt,
        });

        const registration = regRef.current;
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });

        const target = new URL(location.href);
        target.searchParams.set("_tripos", latestVersion.slice(0, 12));
        setTimeout(() => location.replace(target.toString()), 450);
        return;
      }

      if (latestVersion) localStorage.setItem("tripos-build", latestVersion);
      if (RUNNING_BUILD !== "local-dev") {
        const current = new URL(location.href);
        if (current.searchParams.has("_tripos")) {
          current.searchParams.delete("_tripos");
          history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
        }
      }

      setState({
        label: "Current",
        version: latestVersion,
        builtAt: latest.builtAt || null,
        confirmedAt,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        label: navigator.onLine ? "Retrying" : "Offline",
      }));
    }
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    const visible = () => document.visibilityState === "visible" && check(),
      online = () => check(),
      offline = () => setState((prev) => ({ ...prev, label: "Offline" }));
    addEventListener("online", online);
    addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    check();
    const timer = setInterval(check, 60000);
    return () => {
      stoppedRef.current = true;
      clearInterval(timer);
      removeEventListener("online", online);
      removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [check]);

  return { ...state, check };
}
