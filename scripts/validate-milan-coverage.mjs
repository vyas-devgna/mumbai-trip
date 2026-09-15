import fs from "node:fs";
import { buildSettlement } from "../src/finance.js";

const read = (relative) =>
  JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const base = read("../src/data/trip.json");
const historical = read("../src/data/return-branch.json");
const live = read("../src/data/live-finance.json");

const mergeById = (...lists) => {
  const merged = [];
  const indexById = new Map();
  for (const list of lists) {
    for (const item of list || []) {
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

const oldBase = historical.finance?.groupFund || {};
const oldPatch = live.finance?.groupFundPatch || {};
const legacyGroupFund = {
  ...oldBase,
  ...oldPatch,
  contributions: [
    ...(oldBase.contributions || []),
    ...(oldPatch.contributions || []),
  ],
  credits: [...(oldBase.credits || []), ...(oldPatch.credits || [])],
  outflows: [...(oldBase.outflows || []), ...(oldPatch.outflows || [])],
};
const activeGroupFund = live.finance?.activeGroupFund || legacyGroupFund;
const { groupFundPatch: _ignoredPatch, ...liveFinanceFields } =
  live.finance || {};
const data = {
  ...base,
  finance: {
    ...(base.finance || {}),
    ...(historical.finance || {}),
    ...liveFinanceFields,
    legacyGroupFund,
    groupFund: activeGroupFund,
    groupFunds: [legacyGroupFund, activeGroupFund].filter(Boolean),
  },
  members: mergeById(base.members, historical.members, live.members),
  expenses: mergeById(base.expenses, historical.expenses, live.expenses),
  reimbursements: mergeById(
    base.reimbursements,
    historical.reimbursements,
    live.reimbursements,
  ),
};

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const coveragePolicy = (data.finance?.memberCoveragePolicies || []).find(
  (item) => item.id === "vyas-covers-milan-trip",
);
const settlement = buildSettlement(data, data.expenses || []);
const milan = settlement.rows?.milan;
const vyas = settlement.rows?.vyas;
const storedLiability = coveragePolicy?.currentKnownLiabilityPaise || 0;
const computedLiability = Math.max(0, -(milan?.netPaise || 0));

assert(coveragePolicy, "Milan → Devgna coverage policy is missing");
assert(
  coveragePolicy?.beneficiaryMemberId === "milan" &&
    coveragePolicy?.paidByMemberId === "vyas",
  "coverage policy must remain Milan → Vyas Devgna",
);
assert(
  coveragePolicy?.scope === "all-trip-costs" &&
    coveragePolicy?.settlementTiming === "after-trip",
  "coverage policy must cover all Milan trip costs until trip-end settlement",
);
assert(
  computedLiability === storedLiability,
  `settlement engine computes Milan → Devgna ${computedLiability} paise, stored ledger says ${storedLiability} paise`,
);
assert(
  milan?.groupFundAdvanceCoveredPaise === 320000,
  `Milan must have exactly ₹3,200 of Devgna-funded group contributions across both ledgers, got ${milan?.groupFundAdvanceCoveredPaise || 0} paise`,
);
assert(
  vyas?.groupFundAdvancePaidPaise === 320000,
  `Devgna must be the actual payer of Milan's ₹3,200 group contributions, got ${vyas?.groupFundAdvancePaidPaise || 0} paise`,
);

const pinnedRepayment = (settlement.transfers || []).find(
  (transfer) =>
    transfer.from === "milan" &&
    transfer.to === "vyas" &&
    transfer.policyId === "vyas-covers-milan-trip",
);
assert(
  pinnedRepayment?.amountPaise === storedLiability,
  `Milan must repay the full ₹${(storedLiability / 100).toFixed(2)} directly to Devgna at trip end`,
);

const breakdown = coveragePolicy?.currentKnownLiabilityBreakdown || [];
assert(
  breakdown.reduce((sum, item) => sum + (item.amountPaise || 0), 0) ===
    storedLiability,
  "Milan trip-end liability breakdown must sum to the stored total",
);

const allRecordIds = new Set([
  ...(legacyGroupFund.contributions || []).map((item) => item.id),
  ...(activeGroupFund.contributions || []).map((item) => item.id),
  ...(data.expenses || []).map((item) => item.id),
]);
for (const item of breakdown) {
  for (const sourceId of item.sourceRecordIds || []) {
    assert(
      allRecordIds.has(sourceId),
      `${item.id}: missing source record ${sourceId}`,
    );
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Milan coverage valid: settlement, source ledger and direct Milan → Devgna transfer all equal ₹${(
    storedLiability / 100
  ).toFixed(2)}`,
);
