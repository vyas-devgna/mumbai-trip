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
const sum = (items) =>
  items.reduce((total, item) => total + (item.amountPaise || 0), 0);
const expectedEight = [
  "het",
  "jugal",
  "milan",
  "neet",
  "nishit",
  "pratham",
  "tirth",
  "vyas",
];
const sameMembers = (ids = []) =>
  [...ids].sort().join(",") === expectedEight.join(",");

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

// Milan coverage: shared group-account spend must not be counted again as
// separate Milan personal debt after Devgna already funded Milan's contribution.
const coveragePolicy = (live.finance?.memberCoveragePolicies || []).find(
  (item) => item.id === "vyas-covers-milan-trip",
);
assert(
  coveragePolicy?.beneficiaryMemberId === "milan" &&
    coveragePolicy?.paidByMemberId === "vyas",
  "Milan coverage payer/beneficiary mismatch",
);
assert(
  coveragePolicy?.scope === "all-trip-costs" &&
    coveragePolicy?.settlementTiming === "after-trip" &&
    coveragePolicy?.status === "active",
  "Milan coverage policy must remain active and settle after trip",
);
assert(
  coveragePolicy?.currentKnownLiabilityPaise === 377875,
  "current known Milan → Devgna liability must remain ₹3,778.75",
);
const liabilityBreakdown = coveragePolicy?.currentKnownLiabilityBreakdown || [];
assert(
  liabilityBreakdown.length === 4 && sum(liabilityBreakdown) === 377875,
  "Milan liability breakdown must keep four sources totaling ₹3,778.75",
);
const liabilityById = new Map(
  liabilityBreakdown.map((item) => [item.id, item]),
);
assert(
  liabilityById.get("milan-old-group-contribution")?.amountPaise === 300000,
  "Milan old-pool advance must remain ₹3,000",
);
assert(
  liabilityById.get("milan-active-group-contribution")?.amountPaise === 20000,
  "Milan active-pool advance must remain ₹200",
);
assert(
  liabilityById.get("milan-train-shares")?.amountPaise === 41475,
  "Milan train liability must remain ₹414.75",
);
assert(
  liabilityById.get("milan-pretrip-dinner-share")?.amountPaise === 16400,
  "Milan dinner liability must remain ₹164",
);
for (const item of liabilityBreakdown)
  assert(item.status === "due", `${item.id}: Milan liability must remain due`);
for (const id of [
  "expense-vadapav-160-sep15",
  "expense-water-40-sep15",
  "expense-tejukya-pass-160-sep15",
  "expense-water-60-sep15",
]) {
  assert(
    !liabilityBreakdown.some((item) =>
      (item.sourceRecordIds || []).includes(id),
    ),
    `${id}: active-group spend must not be double-counted as Milan personal debt`,
  );
}

// Historical six-person account remains separate.
const oldBase = historical.finance?.groupFund || {};
const patch = live.finance?.groupFundPatch || {};
const oldContributions = (oldBase.contributions || []).filter(
  (item) => item.status === "received",
);
const oldOutflows = (oldBase.outflows || []).filter(
  (item) => item.status === "paid",
);
const oldMerchantOutflows = oldOutflows.filter(
  (item) => item.category !== "reconciliation",
);
const oldCollected = sum(oldContributions);
const oldAccountingSpent = sum(oldOutflows);
const oldMerchantSpent = sum(oldMerchantOutflows);
assert(patch.id === "group-fund-six-sep14", "historical pool id mismatch");
assert(oldCollected === 1740000, "historical cash collected must remain ₹17,400");
assert(
  oldMerchantSpent === 1173800,
  "historical confirmed merchant spend must remain ₹11,738",
);
assert(
  oldAccountingSpent === 1220000,
  "historical accounting outflows must remain ₹12,200 including reconciliation",
);
assert(
  oldCollected - oldAccountingSpent === 520000,
  "historical observed boundary must reconcile to ₹5,200",
);
assert(
  oldCollected - oldMerchantSpent + patch.auditVariancePaise === 520000,
  "historical merchant spend plus audit variance must reconcile to ₹5,200",
);
assert(
  patch.closedObservedBalancePaise === 520000,
  "old-pool boundary must remain ₹5,200",
);
assert(
  patch.auditVariancePaise === -46200,
  "historical audit variance must remain -₹462",
);
assert(
  patch.currentPhysicalBalancePaise === 500000,
  "old pool physical cash must remain ₹5,000",
);
assert(
  patch.interPoolReceivablePaise === 20000 &&
    patch.economicBalancePaise === 520000,
  "old pool must retain ₹200 receivable and ₹5,200 economic balance",
);
const oldAdvance = (patch.postCloseAdvances || []).find(
  (item) => item.id === "old-pool-advance-taxi-mumbai-cha-raja-sep15",
);
assert(
  oldAdvance?.amountPaise === 20000 &&
    oldAdvance?.toGroupFundId === "group-fund-eight-sep15" &&
    oldAdvance?.status === "receivable",
  "old-pool taxi receivable must remain ₹200 due from active pool",
);

const interAccountLink = (live.finance?.interAccountLinks || []).find(
  (item) => item.id === "inter-account-old-to-active-taxi-sep15",
);
assert(
  interAccountLink?.fromGroupFundId === "group-fund-six-sep14" &&
    interAccountLink?.toGroupFundId === "group-fund-eight-sep15" &&
    interAccountLink?.amountPaise === 20000 &&
    interAccountLink?.status === "due",
  "inter-account taxi link mismatch",
);
assert(
  interAccountLink?.receivableRecordId === oldAdvance?.id,
  "inter-account receivable link mismatch",
);

// Active eight-person account.
const active = live.finance?.activeGroupFund || {};
assert(active.id === "group-fund-eight-sep15", "active group id mismatch");
assert(active.status === "active", "eight-person account must be active");
assert(
  sameMembers(active.targetMemberIds || []),
  "active member set must contain exactly eight people",
);
assert(
  active.targetMode === "fixed-contribution" &&
    active.targetPerMemberPaise === 20000 &&
    active.targetTotalPaise === 160000,
  "active contribution target must remain ₹200/person = ₹1,600",
);

const contributions = (active.contributions || []).filter(
  (item) => item.status === "received",
);
assert(
  contributions.length === 7 && sum(contributions) === 140000,
  "active cash contributions must be seven records totaling ₹1,400",
);
for (const item of contributions)
  assert(item.amountPaise === 20000, `${item.id}: contribution must be ₹200`);
assert(
  !contributions.some((item) => item.memberId === "tirth"),
  "Tirth must not also have a cash contribution",
);
const milanContribution = contributions.find(
  (item) => item.id === "group-eight-contribution-milan-sep15",
);
assert(
  milanContribution?.memberId === "milan" &&
    milanContribution?.paidByMemberId === "vyas" &&
    milanContribution?.amountPaise === 20000,
  "Milan active contribution must be ₹200 physically funded by Devgna",
);
const historicalMilanAdvance = oldContributions
  .filter(
    (item) =>
      item.memberId === "milan" &&
      (item.paidByMemberId || item.memberId) === "vyas",
  )
  .reduce((total, item) => total + item.amountPaise, 0);
assert(
  historicalMilanAdvance === 300000 &&
    historicalMilanAdvance + milanContribution.amountPaise === 320000,
  "known Devgna group-account funding for Milan must total ₹3,200",
);

const tirthCredit = (active.credits || []).find(
  (item) => item.id === "group-eight-credit-tirth-pass-sep15",
);
assert(
  tirthCredit?.memberId === "tirth" &&
    tirthCredit?.amountPaise === 20000 &&
    tirthCredit?.status === "applied",
  "Tirth contribution credit must remain ₹200 applied",
);
assert(
  active.contributionCreditPaise === 20000 &&
    active.effectiveContributionPaise === 160000 &&
    active.outstandingContributionPaise === 0 &&
    (active.outstandingMemberIds || []).length === 0,
  "active contribution target must remain fully covered",
);

const expectedCashOutflows = new Map([
  ["group-eight-water-80-sep15", 8000],
  ["group-eight-vadapav-160-sep15", 16000],
  ["group-eight-water-40-sep15", 4000],
  ["group-eight-tejukya-pass-160-sep15", 16000],
  ["group-eight-water-60-sep15", 6000],
]);
const outflows = (active.outflows || []).filter(
  (item) => item.status === "paid",
);
assert(
  outflows.length === expectedCashOutflows.size,
  "active direct-cash outflow count mismatch",
);
for (const [id, amount] of expectedCashOutflows) {
  const row = outflows.find((item) => item.id === id);
  assert(row?.amountPaise === amount, `${id}: cash outflow missing or wrong amount`);
}
assert(sum(outflows) === 50000, "active cash outflows must total ₹500");
assert(
  active.cashCollectedPaise === 140000 &&
    active.cashPaidOutPaise === 50000 &&
    active.physicalCashBalancePaise === 90000,
  "active cash must reconcile ₹1,400 − ₹500 = ₹900",
);

// Payables remain recorded for trip-end settlement, but are NOT a contra-reserve
// against spendable cash during the trip.
const poolPayable = (active.interPoolPayables || []).find(
  (item) => item.id === "group-eight-payable-old-pool-taxi-sep15",
);
assert(
  poolPayable?.amountPaise === 20000 &&
    poolPayable?.toGroupFundId === "group-fund-six-sep14" &&
    poolPayable?.status === "due",
  "active account must retain ₹200 old-pool trip-end payable",
);
assert(
  interAccountLink?.payableRecordId === poolPayable?.id &&
    interAccountLink?.amountPaise === poolPayable?.amountPaise,
  "linked inter-account payable mismatch",
);
const memberPayables = active.memberPayables || [];
const prathamPayable = memberPayables.find(
  (item) => item.id === "group-eight-payable-pratham-taxi-sep15",
);
const tirthPayable = memberPayables.find(
  (item) => item.id === "group-eight-payable-tirth-pass-extra-sep15",
);
assert(
  prathamPayable?.memberId === "pratham" &&
    prathamPayable?.amountPaise === 20000,
  "Pratham trip-end payable must remain ₹200",
);
assert(
  tirthPayable?.memberId === "tirth" && tirthPayable?.amountPaise === 4000,
  "Tirth trip-end payable must remain ₹40",
);
const endSettlementTotal =
  sum(active.interPoolPayables || []) + sum(active.memberPayables || []);
assert(endSettlementTotal === 44000, "trip-end payables must total ₹440");
assert(
  active.interPoolPayablePaise === 20000 &&
    active.memberPayablePaise === 24000 &&
    active.endSettlementPayablesPaise === 44000,
  "stored trip-end settlement totals must equal ₹440",
);
assert(
  active.reservedPayablesPaise === 0,
  "no active cash may be held back as a contra-reserve",
);
assert(
  active.spendableBalancePaise === 90000 &&
    active.spendableBalancePaise === active.physicalCashBalancePaise,
  "cash on hand must equal spendable cash: ₹900",
);

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
  assert(
    sameMembers(charge?.participantIds || []),
    `${id}: participant set must contain all eight members`,
  );
}
const tejukyaCharge = charges.find(
  (item) => item.id === "group-eight-tejukya-pass-160-sep15",
);
assert(
  tejukyaCharge?.label === "Tejukya · pass" &&
    (tejukyaCharge?.fundingBreakdown || []).some(
      (item) =>
        item.kind === "new-group-cash" && item.amountPaise === 16000,
    ),
  "₹160 Tejukya pass charge/funding mismatch",
);
const taxiCharge = charges.find(
  (item) => item.id === "group-eight-taxi-mumbai-cha-raja-sep15",
);
assert(
  (taxiCharge?.fundingBreakdown || []).some(
    (item) =>
      item.kind === "old-group-advance" && item.amountPaise === 20000,
  ) &&
    (taxiCharge?.fundingBreakdown || []).some(
      (item) =>
        item.kind === "member-advance" &&
        item.memberId === "pratham" &&
        item.amountPaise === 20000,
    ),
  "taxi funding must retain ₹200 old-pool + ₹200 Pratham",
);
const mumbaiPass = charges.find(
  (item) => item.id === "group-eight-pass-mumbai-cha-raja-sep15",
);
assert(
  mumbaiPass?.paidByMemberId === "tirth",
  "Mumbai Cha Raja pass payer must remain Tirth",
);
assert(
  sum(charges) === 114000 &&
    active.totalChargedPaise === 114000 &&
    active.fundedChargedPaise === 114000 &&
    active.unfundedChargedPaise === 0 &&
    active.perMemberExpenseSharePaise === 14250,
  "active charges must remain ₹1,140 total / ₹142.50 per person with no unfunded amount",
);

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
  assert(
    expense?.fundingSource === "groupFund" &&
      expense?.groupFundId === "group-fund-eight-sep15" &&
      expense?.groupFundOutflowId === outflowId,
    `${id}: active group-cash linkage mismatch`,
  );
  assert(
    sameMembers(expense?.participantIds || []),
    `${id}: participant set must contain all eight members`,
  );
}
assert(
  !JSON.stringify(live).includes("Aprel Cha Raja") &&
    !JSON.stringify(live).includes("aprel-cha-raja"),
  "corrected ₹160 pass must not remain mislabeled as Aprel Cha Raja",
);

const oldTaxi = expenses.find(
  (item) => item.id === "expense-taxi-mumbai-cha-raja-sep15",
);
const taxiOldPool = expenses.find(
  (item) => item.id === "expense-taxi-mumbai-cha-raja-old-pool-sep15",
);
const taxiPratham = expenses.find(
  (item) => item.id === "expense-taxi-mumbai-cha-raja-pratham-sep15",
);
assert(
  oldTaxi?.status === "superseded" &&
    taxiOldPool?.amountPaise === 20000 &&
    taxiOldPool?.fundingSource === "groupFundExternalAdvance" &&
    taxiPratham?.amountPaise === 20000 &&
    taxiPratham?.payerId === "pratham" &&
    taxiPratham?.fundingSource === "groupFundMemberAdvance",
  "Mumbai Cha Raja taxi split must remain recorded as active-group expense funding",
);
const oldPass = expenses.find(
  (item) => item.id === "expense-mumbai-cha-raja-pass-sep15",
);
const passContribution = expenses.find(
  (item) => item.id === "expense-mumbai-cha-raja-pass-contribution-sep15",
);
const passExtra = expenses.find(
  (item) => item.id === "expense-mumbai-cha-raja-pass-extra-sep15",
);
assert(
  oldPass?.status === "superseded" &&
    passContribution?.amountPaise === 20000 &&
    passContribution?.payerId === "tirth" &&
    passContribution?.fundingSource === "groupFundMemberCredit" &&
    passExtra?.amountPaise === 4000 &&
    passExtra?.payerId === "tirth" &&
    passExtra?.fundingSource === "groupFundMemberAdvance",
  "Mumbai Cha Raja pass split must remain recorded as contribution credit + trip-end reimbursement",
);
const reconciliation = expenses.find(
  (item) => item.id === "expense-cash-reconciliation-sep15",
);
assert(
  reconciliation?.status === "reconciliation",
  "₹462 historical cash variance must remain audit-only",
);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Live finance valid: active cash on hand equals spendable cash ₹900; ₹440 reimbursements remain recorded for trip-end settlement without contra-reserving cash; charges ₹1,140 / ₹142.50 each; Milan → Devgna ₹3,778.75 remains separate",
);
