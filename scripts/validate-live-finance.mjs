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
const sum = (items = []) =>
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

// Milan: previously fronted costs remain payable to Devgna. The new ₹500
// round-2 contribution was explicitly paid directly by Milan and therefore is
// not a new Devgna advance.
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
  "known Milan → Devgna liability must remain ₹3,778.75",
);
const liabilityBreakdown = coveragePolicy?.currentKnownLiabilityBreakdown || [];
assert(
  liabilityBreakdown.length === 4 && sum(liabilityBreakdown) === 377875,
  "Milan liability breakdown must keep four sources totaling ₹3,778.75",
);
for (const item of liabilityBreakdown)
  assert(item.status === "due", `${item.id}: Milan liability must remain due`);
const liabilityById = new Map(
  liabilityBreakdown.map((item) => [item.id, item]),
);
assert(
  liabilityById.get("milan-old-group-contribution")?.amountPaise === 300000,
  "Milan old-pool Devgna advance must remain ₹3,000",
);
assert(
  liabilityById.get("milan-active-group-contribution")?.amountPaise === 20000,
  "Milan first-round active Devgna advance must remain ₹200",
);

// Historical six-person account: preserve the original discrepancy as audit
// provenance, but record Jugal's ₹500 post-close cash recovery separately.
const oldBase = historical.finance?.groupFund || {};
const patch = live.finance?.groupFundPatch || {};
const oldBaseContributions = (oldBase.contributions || []).filter(
  (item) => item.status === "received",
);
const oldOutflows = (oldBase.outflows || []).filter(
  (item) => item.status === "paid",
);
const oldMerchantOutflows = oldOutflows.filter(
  (item) => item.category !== "reconciliation",
);
const oldCollected = sum(oldBaseContributions);
const oldAccountingSpent = sum(oldOutflows);
const oldMerchantSpent = sum(oldMerchantOutflows);
assert(patch.id === "group-fund-six-sep14", "historical pool id mismatch");
assert(oldCollected === 1740000, "historical base cash collected must remain ₹17,400");
assert(oldMerchantSpent === 1173800, "historical merchant spend must remain ₹11,738");
assert(oldAccountingSpent === 1220000, "historical accounting outflows must remain ₹12,200");
assert(oldCollected - oldAccountingSpent === 520000, "historical closing boundary must remain ₹5,200");
assert(patch.closedObservedBalancePaise === 520000, "old closing checkpoint must remain ₹5,200");
assert(patch.auditVariancePaise === -46200, "original historical audit variance must remain -₹462");
assert(
  patch.cashShortfallStatus === "operationally-covered" &&
    patch.cashShortfallCoveragePaise === 46200 &&
    patch.cashShortfallCoverageExcessPaise === 3800,
  "Jugal recovery must operationally cover ₹462 shortfall with ₹38 excess",
);
const recovery = (patch.contributions || []).find(
  (item) => item.id === "group-fund-jugal-shortfall-recovery-sep15",
);
assert(
  recovery?.memberId === "jugal" &&
    recovery?.paidByMemberId === "jugal" &&
    recovery?.amountPaise === 50000 &&
    recovery?.status === "received",
  "old pool must contain exactly Jugal's ₹500 shortfall-recovery contribution",
);
assert(
  sum((patch.contributions || []).filter((item) => item.status === "received")) === 50000,
  "old-pool post-close recovery contributions must total ₹500",
);
assert(patch.postCloseContributionPaise === 50000, "stored old-pool recovery must be ₹500");
assert(patch.currentPhysicalBalancePaise === 550000, "old pool physical cash must now be ₹5,500");
assert(
  patch.interPoolReceivablePaise === 20000 &&
    patch.economicBalancePaise === 570000,
  "old pool must be ₹5,500 cash + ₹200 receivable = ₹5,700 economic balance",
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

// Active eight-person account: cumulative target is now ₹700 each = original
// ₹200 round plus a new ₹500 round.
const active = live.finance?.activeGroupFund || {};
assert(active.id === "group-fund-eight-sep15", "active group id mismatch");
assert(active.status === "active", "eight-person account must be active");
assert(sameMembers(active.targetMemberIds || []), "active member set must contain exactly eight people");
assert(
  active.targetMode === "fixed-contribution" &&
    active.targetPerMemberPaise === 70000 &&
    active.targetTotalPaise === 560000,
  "active cumulative target must be ₹700/person = ₹5,600",
);

const contributions = (active.contributions || []).filter(
  (item) => item.status === "received",
);
const round1 = contributions.filter((item) => item.phase === "round-1-200");
const round2 = contributions.filter((item) => item.phase === "round-2-500");
assert(round1.length === 7 && sum(round1) === 140000, "round 1 must remain seven cash records totaling ₹1,400");
assert(round2.length === 6 && sum(round2) === 300000, "round 2 must have six ₹500 payments totaling ₹3,000");
for (const item of round1)
  assert(item.amountPaise === 20000, `${item.id}: round-1 amount must be ₹200`);
for (const item of round2)
  assert(item.amountPaise === 50000, `${item.id}: round-2 amount must be ₹500`);
const round2Members = round2.map((item) => item.memberId).sort();
assert(
  round2Members.join(",") === ["jugal", "milan", "neet", "pratham", "tirth", "vyas"].join(","),
  "round 2 payers must be Vyas, Tirth, Milan, Jugal, Pratham and Neet only",
);
assert(!round2.some((item) => item.memberId === "nishit" || item.memberId === "het"), "Nishit and Het must remain unpaid for round 2");
const jugalRound2 = round2.find((item) => item.memberId === "jugal");
assert(jugalRound2?.amountPaise === 50000, "only ₹500 of Jugal's ₹1,000 handover may enter active account");
assert(jugalRound2.amountPaise + recovery.amountPaise === 100000, "Jugal split must total exactly ₹1,000 across the two separate accounts");
const milanRound1 = round1.find((item) => item.memberId === "milan");
const milanRound2 = round2.find((item) => item.memberId === "milan");
assert(
  milanRound1?.paidByMemberId === "vyas" && milanRound1?.amountPaise === 20000,
  "Milan original ₹200 must remain Devgna-funded",
);
assert(
  milanRound2?.paidByMemberId === "milan" && milanRound2?.amountPaise === 50000,
  "Milan new ₹500 must be recorded as paid directly by Milan",
);
const historicalMilanAdvance = oldBaseContributions
  .filter(
    (item) =>
      item.memberId === "milan" &&
      (item.paidByMemberId || item.memberId) === "vyas",
  )
  .reduce((total, item) => total + item.amountPaise, 0);
assert(
  historicalMilanAdvance === 300000 &&
    historicalMilanAdvance + milanRound1.amountPaise === 320000,
  "known Devgna-funded Milan group contributions must remain ₹3,200",
);

const tirthCredit = (active.credits || []).find(
  (item) => item.id === "group-eight-credit-tirth-pass-sep15",
);
assert(
  tirthCredit?.memberId === "tirth" &&
    tirthCredit?.amountPaise === 20000 &&
    tirthCredit?.status === "applied",
  "Tirth original ₹200 contribution credit must remain applied",
);
assert(active.cashCollectedPaise === 440000, "active cash collected must now total ₹4,400");
assert(active.contributionCreditPaise === 20000, "active contribution credit must remain ₹200");
assert(active.effectiveContributionPaise === 460000, "effective active contribution must be ₹4,600");
assert(active.outstandingContributionPaise === 100000, "active outstanding contribution must be ₹1,000");
assert(
  [...(active.outstandingMemberIds || [])].sort().join(",") === ["het", "nishit"].join(","),
  "only Nishit and Het may remain ₹500 outstanding",
);
const memberEffective = Object.fromEntries(expectedEight.map((id) => [id, 0]));
for (const item of contributions)
  memberEffective[item.memberId] += item.amountPaise;
for (const item of active.credits || [])
  if (item.status === "applied") memberEffective[item.memberId] += item.amountPaise;
for (const id of expectedEight) {
  const expected = id === "nishit" || id === "het" ? 20000 : 70000;
  assert(memberEffective[id] === expected, `${id}: cumulative active contribution mismatch`);
}

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
assert(sum(outflows) === 50000, "active direct cash outflows must remain ₹500");
assert(active.cashPaidOutPaise === 50000, "stored active cash paid out must remain ₹500");
assert(active.physicalCashBalancePaise === 390000, "active physical cash must be ₹3,900");
assert(active.spendableBalancePaise === 390000, "active spendable cash must equal ₹3,900 cash on hand");
assert(active.reservedPayablesPaise === 0, "no active cash may be contra-reserved");

const poolPayable = (active.interPoolPayables || []).find(
  (item) => item.id === "group-eight-payable-old-pool-taxi-sep15",
);
const prathamPayable = (active.memberPayables || []).find(
  (item) => item.id === "group-eight-payable-pratham-taxi-sep15",
);
const tirthPayable = (active.memberPayables || []).find(
  (item) => item.id === "group-eight-payable-tirth-pass-extra-sep15",
);
assert(poolPayable?.amountPaise === 20000, "old-pool trip-end payable must remain ₹200");
assert(prathamPayable?.amountPaise === 20000, "Pratham trip-end payable must remain ₹200");
assert(tirthPayable?.amountPaise === 4000, "Tirth trip-end payable must remain ₹40");
assert(
  active.endSettlementPayablesPaise === 44000 &&
    active.interPoolPayablePaise === 20000 &&
    active.memberPayablePaise === 24000,
  "trip-end settlements must remain ₹440 total",
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
  assert(sameMembers(charge?.participantIds || []), `${id}: participant set must contain all eight members`);
}
assert(
  sum(charges) === 114000 &&
    active.totalChargedPaise === 114000 &&
    active.fundedChargedPaise === 114000 &&
    active.unfundedChargedPaise === 0 &&
    active.perMemberExpenseSharePaise === 14250,
  "active charges must remain ₹1,140 total / ₹142.50 per person",
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
  assert(expense?.status === "paid", `${id}: expense must remain paid`);
  assert(
    expense?.fundingSource === "groupFund" &&
      expense?.groupFundId === "group-fund-eight-sep15" &&
      expense?.groupFundOutflowId === outflowId,
    `${id}: active group-cash linkage mismatch`,
  );
  assert(sameMembers(expense?.participantIds || []), `${id}: participant set mismatch`);
}
assert(
  !JSON.stringify(live).includes("Aprel Cha Raja") &&
    !JSON.stringify(live).includes("aprel-cha-raja"),
  "corrected ₹160 pass must remain labeled Tejukya only",
);
const reconciliation = expenses.find(
  (item) => item.id === "expense-cash-reconciliation-sep15",
);
assert(reconciliation?.status === "reconciliation", "historical ₹462 discrepancy must remain audit-only");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Live finance valid: active round-2 ₹500 received from six members; Nishit + Het ₹500 each outstanding; active cash/spendable ₹3,900; Jugal split ₹500 active + ₹500 old pool; old physical ₹5,500 / economic ₹5,700; original ₹462 variance retained as audit history; Milan → Devgna ₹3,778.75 unchanged",
);
