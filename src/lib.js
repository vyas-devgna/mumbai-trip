import coreData from "./data/trip.json";
import returnBranch from "./data/return-branch.json";
import liveFinance from "./data/live-finance.json";
import sep16Finance from "./data/sep16-finance.json";
import SunCalc from "suncalc";

const overlays = [returnBranch, liveFinance, sep16Finance];

const mergeById = (key) => {
  const merged = [...(coreData[key] || [])],
    indexById = new Map(
      merged
        .map((item, index) => [item?.id, index])
        .filter(([id]) => Boolean(id)),
    );

  for (const overlay of overlays) {
    for (const item of overlay[key] || []) {
      const existingIndex = item?.id ? indexById.get(item.id) : undefined;
      if (existingIndex != null) {
        merged[existingIndex] = { ...merged[existingIndex], ...item };
      } else {
        if (item?.id) indexById.set(item.id, merged.length);
        merged.push(item);
      }
    }
  }
  return merged;
};

const baseGroupFund = returnBranch.finance?.groupFund || {},
  groupFundPatch = liveFinance.finance?.groupFundPatch || {},
  sep16GroupFundPatch = sep16Finance.finance?.legacyGroupFundPatch || {},
  mergedLegacyGroupFund = {
    ...baseGroupFund,
    ...groupFundPatch,
    ...sep16GroupFundPatch,
    contributions: [
      ...(baseGroupFund.contributions || []),
      ...(groupFundPatch.contributions || []),
      ...(sep16GroupFundPatch.contributions || []),
    ],
    credits: [
      ...(baseGroupFund.credits || []),
      ...(groupFundPatch.credits || []),
      ...(sep16GroupFundPatch.credits || []),
    ],
    outflows: [
      ...(baseGroupFund.outflows || []),
      ...(groupFundPatch.outflows || []),
      ...(sep16GroupFundPatch.outflows || []),
    ],
  },
  activeGroupFund = liveFinance.finance?.activeGroupFund || mergedLegacyGroupFund,
  { groupFundPatch: _groupFundPatch, ...liveFinanceFields } =
    liveFinance.finance || {},
  { legacyGroupFundPatch: _sep16GroupFundPatch, ...sep16FinanceFields } =
    sep16Finance.finance || {},
  mergedFinance = {
    ...(coreData.finance || {}),
    ...(returnBranch.finance || {}),
    ...liveFinanceFields,
    ...sep16FinanceFields,
    legacyGroupFund: mergedLegacyGroupFund,
    groupFund: activeGroupFund,
    groupFunds: [mergedLegacyGroupFund, activeGroupFund].filter(Boolean),
  };

const data = {
  ...coreData,
  trip: {
    ...(coreData.trip || {}),
    ...(returnBranch.trip || {}),
    ...(liveFinance.trip || {}),
    ...(sep16Finance.trip || {}),
  },
  finance: mergedFinance,
  members: mergeById("members"),
  places: mergeById("places"),
  activities: mergeById("activities"),
  travelLegs: mergeById("travelLegs"),
  branches: mergeById("branches"),
  checkpoints: mergeById("checkpoints"),
  fallbacks: mergeById("fallbacks"),
  candidates: mergeById("candidates"),
  expenses: mergeById("expenses"),
  reimbursements: mergeById("reimbursements"),
  signals: mergeById("signals"),
  resources: mergeById("resources"),
};

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
  if (!match) throw new TypeError("Invalid money value");
  const [, sign, rupees, fraction = ""] = match,
    paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return assertPaise(sign === "-" ? -paise : paise);
}

export function formatMoney(paise) {
  const value = assertPaise(paise),
    sign = value < 0 ? "-" : "",
    abs = Math.abs(value),
    rupees = Math.floor(abs / 100),
    remainder = abs % 100;
  return `${sign}₹${rupees.toLocaleString("en-IN")}${remainder ? `.${String(remainder).padStart(2, "0")}` : ""}`;
}

export function splitPaise(totalPaise, participantIds) {
  const total = assertPaise(totalPaise, "totalPaise"),
    ids = [...new Set(participantIds || [])];
  if (!ids.length) return {};
  const sign = total < 0 ? -1 : 1,
    abs = Math.abs(total),
    base = Math.floor(abs / ids.length),
    remainder = abs % ids.length;
  return Object.fromEntries(
    ids.map((id, index) => [id, sign * (base + (index < remainder ? 1 : 0))]),
  );
}

export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function formatDate(value, options = {}) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
    ...options,
  }).format(date);
}

export function getSunTimes(date, latitude = 19.076, longitude = 72.8777) {
  const base = new Date(`${date}T12:00:00+05:30`),
    times = SunCalc.getTimes(base, latitude, longitude);
  return { sunrise: times.sunrise, sunset: times.sunset };
}

export function runningBuild() {
  return RUNNING_BUILD;
}
