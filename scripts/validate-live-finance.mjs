import fs from "node:fs";

const read = (relative) =>
  JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const base = read("../src/data/trip.json");
const historical = read("../src/data/return-branch.json");
const live = read("../src/data/live-finance.json");
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const sum = (items) => items.reduce((total, item) => total + (item.amountPaise || 0), 0);
const sameMembers = (ids = []) =>
  [...ids].sort().join(",") === expectedEight.join(",");

const expectedEight = ["het", "jugal", "milan", "neet", "nishit", "pratham", "tirth", "vyas"];
const allMembers = [
  ...(base.members || []),
  ...(historical.members || []),
  ...(live.members || []),
];
const memberIds = new Set(allMembers.map((member) => member.id));
for (const id of expectedEight)
  assert(memberIds.has(id), `missing eight-person member ${id}`);
assert(
  sameMembers(live.finance?.budgetMemberIds || []),
  "live finance cohort must contain exactly eight members",
);

// Milan is fully covered by Devgna during the trip, but shared group-cash spend
// must never be double-counted as a second personal liability.
const coveragePolicy = (live.finance?.memberCoveragePolicies || []).find(
  (item) => item.id === "vyas-covers-milan-trip",
);
assert(coveragePolicy?.beneficiaryMemberId === "milan", "Milan coverage beneficiary mismatch");
assert(coveragePolicy?.paidByMemberId === "vyas", "Milan coverage payer must be Vyas Devgna");
assert(coveragePolicy?.scope === "all-trip-costs", "Milan coverage must apply to all trip costs");
assert(coveragePolicy?.settlementTiming === "after-trip", "Milan must repay Devgna after trip");
assert(coveragePolicy?.status === "active", "Milan coverage must remain active during trip");
assert(
  coveragePolicy?.currentKnownLiabilityPaise === 377875,
  "current known Milan → Devgna liability must remain ₹3,778.75",
);
const liabilityBreakdown = coveragePolicy?.currentKnownLiabilityBreakdown || [];
assert(liabilityBreakdown.length === 4, "Milan liability must keep four source components");
assert(sum(liabilityBreakdown) === 377875, "Milan liability components must sum to ₹3,778.75");
const liabilityById = new Map(liabilityBreakdown.map((item) => [item.id, item]));
assert(liabilityById.get("milan-old-group-contribution")?.amountPaise === 300000, "Milan old-pool advance must remain ₹3,000");
assert(liabilityById.get("milan-active-group-contribution")?.amountPaise === 20000, "Milan active-pool advance must remain ₹200");
assert(liabilityById.get("milan-train-shares")?.amountPaise === 41475, "Milan train liability must remain ₹414.75");
assert(liabilityById.get("milan-pretrip-dinner-share")?.amountPaise === 16400, "Milan dinner liability must remain ₹164");
for (const item of liabilityBreakdown)
  assert(item.status === "due", `${item.id}: Milan liability component must remain due`);
for (const id of [
  "expense-vadapav-160-sep15",
  "expense-water-40-sep15",
  "expense-tejukya-pass-160-sep15",
  "expense-water-60-sep15",
]) {
  assert(
    !liabilityBreakdown.some((item) => (item.sourceRecordIds || []).includes(id)),
    `${id}: active-group cash spend must not be double-counted as Milan personal debt`,
  );
}

// The old six-person account remains independent and is linked to the new
// account only through the explicit ₹200 taxi advance.
const oldBase = historical.finance?.groupFund || {};
const patch = live.finance?.groupFundPatch || {};
const oldContributions = (oldBase.contributions || []).filter((item) => item.status === "received");
const oldOutflows = (oldBase.outflows || []).filter((item) => item.status === "paid");
const oldMerchantOutflows = oldOutflows.filter((item) => item.category !== "reconciliation");
const oldCollected = sum(oldContributions);
const oldAccountingSpent = sum(oldOutflows);
const oldMerchantSpent = sum(oldMerchantOutflows);
assert(patch.id === "group-fund-six-sep14", "historical pool id mismatch");
assert(oldCollected === 1740000, "historical cash collected must remain ₹17,400");
assert(oldMerchantSpent === 1173800, "historical confirmed merchant spend must remain ₹11,738");
assert(oldAccountingSpent === 1220000, "historical accounting outflows must remain ₹12,200 including reconciliation");
assert(oldCollected - oldAccountingSpent === 520000, "historical observed boundary must reconcile to ₹5,200");
assert(oldCollected - oldMerchantSpent + patch.auditVariancePaise === 520000, "historical merchant spend plus audit variance must reconcile to ₹5,200");
assert(patch.closedObservedBalancePaise === 520000, "old-pool boundary must remain ₹5,200");
assert(patch.auditVariancePaise === -46200, "historical audit variance must remain -₹462");
assert(patch.postCloseAdvancePaise === 20000, "old pool taxi advance must remain ₹200");
assert(patch.currentPhysicalBalancePaise === 500000, "old pool physical cash must remain ₹5,000");
assert(patch.interPoolReceivablePaise === 20000, "old pool receivable must remain ₹200");
assert(patch.economicBalancePaise === 520000, "old pool economic balance must remain ₹5,200");
const oldAdvance = (patch.postCloseAdvances || []).find(
  (item) => item.id === "old-pool-advance-taxi-mumbai-cha-raja-sep15",
);
assert(oldAdvance?.amountPaise === 20000, "old-pool taxi receivable missing");
assert(oldAdvance?.toGroupFundId === "group-fund-eight-sep15", "old-pool taxi receivable must point to active pool");
assert(oldAdvance?.status === "receivable", "old-pool taxi advance must remain receivable");

const interAccountLink = (live.finance?.interAccountLinks || []).find(
  (item) => item.id === "inter-account-old-to-active-taxi-sep15",
);
assert(interAccountLink?.fromGroupFundId === "group-fund-six-sep14", "inter-account link source mismatch");
assert(interAccountLink?.toGroupFundId === "group-fund-eight-sep15", "inter-account link target mismatch");
assert(interAccountLink?.amountPaise === 20000, "inter-account link must remain ₹200");
assert(interAccountLink?.status === "due", "inter-account link must remain due");
assert(interAccountLink?.receivableRecordId === oldAdvance?.id, "inter-account receivable link mismatch");

// Active eight-person account.
const active = live.finance?.activeGroupFund || {};
assert(active.id === "group-fund-eight-sep15", "active group id mismatch");
assert(active.status === "active", "eight-person account must be active");
assert(sameMembers(active.targetMemberIds || []), "active member set must contain exactly eight people");
assert(active.targetMode === "fixed-contribution", "active account must use fixed-contribution mode");
assert(active.targetPerMemberPaise === 20000, "active contribution target must remain ₹200/person");
assert(active.targetTotalPaise === 160000, "active contribution target must remain ₹1,600");

const contributions = (active.contributions || []).filter((item) => item.status === "received");
assert(contributions.length === 7, "exactly seven active cash contributions must be recorded");
assert(sum(contributions) === 140000, "active cash contributions must total ₹1,400");
for (const item of contributions)
  assert(item.amountPaise === 20000, `${item.id}: contribution must be ₹200`);
assert(!contributions.some((item) => item.memberId === "tirth"), "Tirth must not also have a cash contribution");
const milanContribution = contributions.find((item) => item.id === "group-eight-contribution-milan-sep15");
assert(
  milanContribution?.memberId === "milan" && milanContribution?.paidByMemberId === "vyas",
  "Milan active contribution must be physically funded by Devgna",
);
const historicalMilanAdvance = oldContributions
  .filter((item) => item.memberId === "milan" && (item.paidByMemberId || item.memberId) === "vyas")
  .reduce((total, item) => total + item.amountPaise, 0);
assert(historicalMilanAdvance === 300000, "Milan old-group Devgna advance must remain ₹3,000");
assert(historicalMilanAdvance + milanContribution.amountPaise === 320000, "known Devgna group-account funding for Milan must total ₹3,200");

const tirthCredit = (active.credits || []).find(
  (item) => item.id === "group-eight-credit-tirth-pass-sep15",
);
assert(tirthCredit?.memberId === "tirth" && tirthCredit?.amountPaise === 20000, "Tirth contribution credit must remain ₹200");
assert(tirthCredit?.status === "applied", "Tirth contribution credit must remain applied");
assert(active.contributionCreditPaise === 20000, "stored contribution credit must remain ₹200");
assert(active.effectiveContributionPaise === 160000, "active contribution target must remain fully covered");
assert(active.outstandingContributionPaise === 0, "no active contribution may remain outstanding");
assert((active.outstandingMemberIds || []).length === 0, "no active member may remain contribution-due");

const expectedCashOutflows = new Map([
  ["group-eight-water-80-sep15", 8000],
  ["group-eight-vadapav-160-sep15", 16000],
  ["group-eight-water-40-sep15", 4000],
  ["group-eight-tejukya-pass-160-sep15", 16000],
  ["group-eight-water-60-sep15", 6000],
]);
const outflows = (active.outflows || []).filter((item) => item.status === "paid");
assert(outflows.length === expectedCashOutflows.size, "active direct-cash outflow count mismatch");
for (const [id, amount] of expectedCashOutflows) {
  const row = outflows.find((item) => item.id === id);
  assert(row?.amountPaise === amount, `${id}: cash outflow missing or wrong amount`);
}
assert(sum(outflows) === 50000, "active cash outflows must total ₹500");
assert(active.cashCollectedPaise === 140000, "stored active cash collected must be ₹1,400");
assert(active.cashPaidOutPaise === 50000, "stored active cash paid out must be ₹500");
assert(active.physicalCashBalancePaise === 90000, "active physical cash must be ₹900");

const poolPayable = (active.interPoolPayables || []).find(
  (item) => item.id === "group-eight-payable-old-pool-taxi-sep15",
);
assert(poolPayable?.amountPaise === 20000, "active account must owe old pool ₹200");
assert(poolPayable?.toGroupFundId === "group-fund-six-sep14", "old-pool payable target mismatch");
assert(poolPayable?.status === "due", "old-pool payable must remain due");
assert(interAccountLink?.payableRecordId === poolPayable?.id, "inter-account payable link mismatch");
assert(interAccountLink?.amountPaise === poolPayable?.amountPaise, "linked inter-account amounts must match");

const memberPayables = active.memberPayables || [];
const prathamPayable = memberPayables.find((item) => item.id === "group-eight-payable-pratham-taxi-sep15");
const tirthPayable = memberPayables.find((item) => item.id === "group-eight-payable-tirth-pass-extra-sep15");
assert(prathamPayable?.memberId === "pratham" && prathamPayable?.amountPaise === 20000, "Pratham payable must remain ₹200");
assert(tirthPayable?.memberId === "tirth" && tirthPayable?.amountPaise === 4000, "Tirth payable must remain ₹40");
assert(active.interPoolPayablePaise === 20000, "stored inter-pool payable must remain ₹200");
assert(active.memberPayablePaise === 24000, "stored member payables must remain ₹240");
assert(active.reservedPayablesPaise === 44000, "reserved liabilities must remain ₹440");
assert(active.spendableBalancePaise === 46000, "active free-to-spend balance must be ₹460");

const expectedCharges = new Map([
  ["group-eight-water-80-sep15", 8000],
  ["group-eight-vadapav-160-sep15", 16000],
  ["group-eight-water-40-sep15", 4000],
  ["group-eight-tejukya-pass-160-sep15", 16000],
  ["group-eight-water-60-sep15", 6000],
  ["group-eight-taxi-mumbai-cha-raja-sep15", 40000],
  ["group-eight-pass-mumbai-cha-raja-sep15", 24000],
]);
const charges = active.charges || [];
assert(charges.length === expectedCharges.size, "active charge count mismatch");
for (const [id, amount] of expectedCharges) {
  const charge = charges.find((item) => item.id === id);
  assert(charge?.amountPaise === amount, `${id}: charge missing or wrong amount`);
  assert(sameMembers(charge?.participantIds || []), `${id}: participant set must contain all eight members`);
}
const tejukyaCharge = charges.find((item) => item.id === "group-eight-tejukya-pass-160-sep15");
assert(tejukyaCharge?.label === "Tejukya · pass", "₹160 pass must be labeled Tejukya");
assert(
  (tejukyaCharge?.fundingBreakdown || []).some(
    (item) => item.kind === "new-group-cash" && item.amountPaise === 16000,
  ),
  "Tejukya pass must be funded from active-group cash",
);
const taxiCharge = charges.find((item) => item.id === "group-eight-taxi-mumbai-cha-raja-sep15");
assert(
  (taxiCharge?.fundingBreakdown || []).some(
    (item) => item.kind === "old-group-advance" && item.amountPaise === 20000,
  ),
  "taxi must retain ₹200 old-group funding",
);
assert(
  (taxiCharge?.fundingBreakdown || []).some(
    (item) => item.kind === "member-advance" && item.memberId === "pratham" && item.amountPaise === 20000,
  ),
  "taxi must retain ₹200 Pratham funding",
);
const mumbaiPass = charges.find((item) => item.id === "group-eight-pass-mumbai-cha-raja-sep15");
assert(mumbaiPass?.paidByMemberId === "tirth", "Mumbai Cha Raja pass payer must remain Tirth");
assert(sum(charges) === 114000, "active charges must total ₹1,140");
assert(active.totalChargedPaise === 114000, "stored active charges must total ₹1,140");
assert(active.fundedChargedPaise === 114000, "all ₹1,140 active charges must have known funding");
assert(active.unfundedChargedPaise === 0, "active account must have no unfunded charges");
assert(active.perMemberExpenseSharePaise === 14250, "₹1,140 / 8 must equal ₹142.50 per person");

const expenses = live.expenses || [];
const expectedDirectExpenses = new Map([
  ["expense-water-80-sep15", [8000, "group-eight-water-80-sep15"]],
  ["expense-vadapav-160-sep15", [16000, "group-eight-vadapav-160-sep15"]],
  ["expense-water-40-sep15", [4000, "group-eight-water-40-sep15"]],
  ["expense-tejukya-pass-160-sep15", [16000, "group-eight-tejukya-pass-160-sep15"]],
  ["expense-water-60-sep15", [6000, "group-eight-water-60-sep15"]],
]);
for (const [id, [amount, outflowId]] of expectedDirectExpenses) {
  const expense = expenses.find((item) => item.id === id);
  assert(expense?.amountPaise === amount, `${id}: expense amount mismatch`);
  assert(expense?.status === "paid", `${id}: expense must be confirmed paid`);
  assert(expense?.fundingSource === "groupFund", `${id}: must be active group-cash funded`);
  assert(expense?.groupFundId === "group-fund-eight-sep15", `${id}: must belong to active account`);
  assert(expense?.groupFundOutflowId === outflowId, `${id}: expense/outflow link mismatch`);
  assert(sameMembers(expense?.participantIds || []), `${id}: participant set must contain all eight members`);
}
assert(
  !JSON.stringify(live).includes("Aprel Cha Raja") &&
    !JSON.stringify(live).includes("aprel-cha-raja"),
  "corrected ₹160 pass must not remain mislabeled as Aprel Cha Raja",
);

const oldTaxi = expenses.find((item) => item.id === "expense-taxi-mumbai-cha-raja-sep15");
const taxiOldPool = expenses.find((item) => item.id === "expense-taxi-mumbai-cha-raja-old-pool-sep15");
const taxiPratham = expenses.find((item) => item.id === "expense-taxi-mumbai-cha-raja-pratham-sep15");
assert(oldTaxi?.status === "superseded", "original ₹400 taxi row must remain superseded");
assert(taxiOldPool?.amountPaise === 20000 && taxiOldPool?.fundingSource === "groupFundExternalAdvance", "taxi 1 old-pool advance mismatch");
assert(taxiPratham?.amountPaise === 20000 && taxiPratham?.payerId === "pratham" && taxiPratham?.fundingSource === "groupFundMemberAdvance", "taxi 2 Pratham advance mismatch");

const oldPass = expenses.find((item) => item.id === "expense-mumbai-cha-raja-pass-sep15");
const passContribution = expenses.find((item) => item.id === "expense-mumbai-cha-raja-pass-contribution-sep15");
const passExtra = expenses.find((item) => item.id === "expense-mumbai-cha-raja-pass-extra-sep15");
assert(oldPass?.status === "superseded", "original ₹240 Mumbai Cha Raja pass row must remain superseded");
assert(passContribution?.amountPaise === 20000 && passContribution?.payerId === "tirth" && passContribution?.fundingSource === "groupFundMemberCredit", "Tirth ₹200 pass contribution portion mismatch");
assert(passExtra?.amountPaise === 4000 && passExtra?.payerId === "tirth" && passExtra?.fundingSource === "groupFundMemberAdvance", "Tirth ₹40 pass extra mismatch");

const reconciliation = expenses.find((item) => item.id === "expense-cash-reconciliation-sep15");
assert(reconciliation?.status === "reconciliation", "₹462 historical cash variance must remain audit-only");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Live finance valid: separate 6-person and 8-person ledgers; ₹160 pass corrected to Tejukya; ₹60 water recorded; Milan → Devgna liability ₹3,778.75 without double-counting group cash; active pool ₹900 on hand / ₹460 free",
);
