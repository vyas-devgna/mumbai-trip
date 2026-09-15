import fs from "node:fs";

const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const base = read("../src/data/trip.json");
const historical = read("../src/data/return-branch.json");
const live = read("../src/data/live-finance.json");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const sum = (items = []) => items.reduce((total, item) => total + (item.amountPaise || 0), 0);
const expectedEight = ["het", "jugal", "milan", "neet", "nishit", "pratham", "tirth", "vyas"];
const sameMembers = (ids = []) => [...ids].sort().join(",") === expectedEight.join(",");

const memberIds = new Set([...(base.members || []), ...(historical.members || []), ...(live.members || [])].map((m) => m.id));
for (const id of expectedEight) assert(memberIds.has(id), `missing eight-person member ${id}`);
assert(sameMembers(live.finance?.budgetMemberIds || []), "live finance cohort must contain exactly eight members");

const coveragePolicy = (live.finance?.memberCoveragePolicies || []).find((x) => x.id === "vyas-covers-milan-trip");
assert(coveragePolicy?.beneficiaryMemberId === "milan" && coveragePolicy?.paidByMemberId === "vyas", "Milan coverage payer/beneficiary mismatch");
assert(coveragePolicy?.currentKnownLiabilityPaise === 377875, "Milan → Devgna liability must remain ₹3,778.75");
const liabilityBreakdown = coveragePolicy?.currentKnownLiabilityBreakdown || [];
assert(liabilityBreakdown.length === 4 && sum(liabilityBreakdown) === 377875, "Milan liability breakdown must remain four sources totaling ₹3,778.75");
assert(!liabilityBreakdown.some((item) => (item.sourceRecordIds || []).includes("expense-dinner-2430-sep15")), "group-funded dinner must not be double-counted as Milan personal debt");

const oldBase = historical.finance?.groupFund || {};
const patch = live.finance?.groupFundPatch || {};
const oldBaseContributions = (oldBase.contributions || []).filter((x) => x.status === "received");
const oldCredits = (oldBase.credits || []).filter((x) => x.status === "applied");
const oldOutflows = (oldBase.outflows || []).filter((x) => x.status === "paid");
const oldNonAuditOutflows = oldOutflows.filter((x) => x.category !== "reconciliation");
const jugalMorning = (oldBase.contributions || []).find((x) => x.id === "group-fund-jugal-morning-sep14");
const jugalSettlement = (oldBase.contributions || []).find((x) => x.id === "group-fund-jugal-settlement-sep15");
assert(jugalMorning?.amountPaise === 50000 && jugalMorning?.status === "not-received", "Jugal Sep 14 morning ₹500 must remain marked never received");
assert(jugalSettlement?.amountPaise === 100000 && jugalSettlement?.status === "received", "Jugal Sep 15 settlement must be corrected to ₹1,000");
assert(!(oldBase.credits || []).some((x) => x.id === "group-fund-credit-jugal-auto-sep14"), "Jugal ₹100 contribution credit must be removed after reimbursement");
assert(sum(oldBaseContributions) === 1700000, "historical base cash actually received must be ₹17,000 before Jugal replacement");
assert(sum(oldCredits) === 50000, "historical direct-expense credits must be ₹500 after removing Jugal credit");
assert(sum(oldNonAuditOutflows) === 1183800, "historical confirmed non-audit cash outflows must be ₹11,838 including Jugal ₹100 reimbursement");
assert(sum(oldOutflows) === 1230000, "historical accounting outflows including ₹462 control must be ₹12,300");
assert(sum(oldBaseContributions) - sum(oldOutflows) === 470000, "corrected historical checkpoint must derive to ₹4,700");
const jugalReimbursement = oldOutflows.find((x) => x.id === "group-fund-reimburse-jugal-auto-sep14");
assert(jugalReimbursement?.amountPaise === 10000 && jugalReimbursement?.expenseId === "expense-auto-jugal-sep14", "Jugal ₹100 old-pool reimbursement outflow missing");
const jugalAutoExpense = (historical.expenses || []).find((x) => x.id === "expense-auto-jugal-sep14");
assert(jugalAutoExpense?.fundingSource === "groupFund" && jugalAutoExpense?.groupFundOutflowId === "group-fund-reimburse-jugal-auto-sep14" && jugalAutoExpense?.reimbursedMemberId === "jugal", "Jugal reimbursed auto provenance mismatch");
assert(patch.closedObservedBalancePaise === 470000, "corrected old checkpoint must be ₹4,700");
assert(patch.historicalAuditVariancePaise === -46200, "historical unidentified variance must remain -₹462");
assert(patch.auditVariancePaise === -50000, "current old-pool unexplained variance must remain -₹500");
const replacement = (patch.contributions || []).find((x) => x.id === "group-fund-jugal-replacement-500-sep15");
assert(replacement?.memberId === "jugal" && replacement?.amountPaise === 50000 && replacement?.status === "received" && replacement?.phase === "replacement-contribution", "old pool must contain Jugal ₹500 replacement contribution");
assert(sum((patch.contributions || []).filter((x) => x.status === "received")) === 50000, "old-pool post-close replacement contribution must total ₹500");
assert(sum(oldBaseContributions) + sum(oldCredits) + replacement.amountPaise === 1800000, "corrected old-pool target coverage must still equal ₹18,000");
const jugalOldBaseCash = oldBaseContributions.filter((x) => x.memberId === "jugal").reduce((t, x) => t + x.amountPaise, 0);
const jugalOldCredit = oldCredits.filter((x) => x.memberId === "jugal").reduce((t, x) => t + x.amountPaise, 0);
assert(jugalOldBaseCash === 250000 && jugalOldBaseCash + replacement.amountPaise === 300000 && jugalOldCredit === 0, "Jugal old account must be ₹1,500 + ₹1,000 + ₹500 = ₹3,000 actual cash and no credit");
assert(patch.cashShortfallStatus === "current-variance-open", "current old-pool ₹500 variance must remain open");
assert(patch.expectedPhysicalBalancePaise === 500000, "old-pool expected current cash must be ₹5,000");
assert(patch.currentObservedBalancePaise === 450000 && patch.currentPhysicalBalancePaise === 450000, "latest old-pool physical count must be ₹4,500");
assert(patch.currentCashVariancePaise === -50000, "old-pool current cash variance must be -₹500");
assert(patch.interPoolReceivablePaise === 20000, "old pool must retain ₹200 receivable from active pool");
assert(patch.economicBalancePaise === 470000, "observed old-pool economic balance must be ₹4,700");
assert(patch.expectedEconomicBalancePaise === 520000, "expected old-pool economic balance must be ₹5,200");
assert(patch.cashCheckpoint?.observedBalancePaise === 470000, "corrected historical cash checkpoint must be ₹4,700");
assert(patch.currentCashCheckpoint?.observedBalancePaise === 450000 && patch.currentCashCheckpoint?.expectedBalancePaise === 500000 && patch.currentCashCheckpoint?.variancePaise === -50000, "current old-pool checkpoint must be ₹4,500 observed vs ₹5,000 expected = -₹500");

const active = live.finance?.activeGroupFund || {};
assert(active.id === "group-fund-eight-sep15" && active.status === "active", "active group id/status mismatch");
assert(sameMembers(active.targetMemberIds || []), "active member set must contain exactly eight people");
assert(active.targetPerMemberPaise === 70000 && active.targetTotalPaise === 560000, "active cumulative target must be ₹700/person = ₹5,600");
const contributions = (active.contributions || []).filter((x) => x.status === "received");
const round1 = contributions.filter((x) => x.phase === "round-1-200");
const round2 = contributions.filter((x) => x.phase === "round-2-500");
assert(round1.length === 7 && sum(round1) === 140000, "round 1 must remain seven cash records totaling ₹1,400");
assert(round2.length === 6 && sum(round2) === 300000, "round 2 must contain six ₹500 payments totaling ₹3,000");
assert(round2.map((x) => x.memberId).sort().join(",") === ["jugal", "milan", "neet", "pratham", "tirth", "vyas"].join(","), "round 2 payers mismatch");
assert(!round2.some((x) => x.memberId === "nishit" || x.memberId === "het"), "Nishit and Het must remain unpaid for round 2");
const jugalRound2 = round2.find((x) => x.memberId === "jugal");
assert(jugalRound2?.amountPaise === 50000 && jugalRound2.amountPaise + replacement.amountPaise === 100000, "Jugal ₹1,000 handover must split ₹500 active + ₹500 old replacement");
const milanRound1 = round1.find((x) => x.memberId === "milan");
const milanRound2 = round2.find((x) => x.memberId === "milan");
assert(milanRound1?.paidByMemberId === "vyas" && milanRound1?.amountPaise === 20000, "Milan original ₹200 must remain Devgna-funded");
assert(milanRound2?.paidByMemberId === "milan" && milanRound2?.amountPaise === 50000, "Milan new ₹500 must be paid directly by Milan");
assert(active.cashCollectedPaise === 440000 && active.contributionCreditPaise === 20000 && active.effectiveContributionPaise === 460000, "active contribution totals must be ₹4,400 cash + ₹200 credit = ₹4,600");
assert(active.outstandingContributionPaise === 100000, "active contribution due must be ₹1,000");
assert([...(active.outstandingMemberIds || [])].sort().join(",") === ["het", "nishit"].join(","), "only Nishit and Het may remain ₹500 outstanding");

const expectedCashOutflows = new Map([
  ["group-eight-water-80-sep15", 8000],
  ["group-eight-vadapav-160-sep15", 16000],
  ["group-eight-water-40-sep15", 4000],
  ["group-eight-tejukya-pass-160-sep15", 16000],
  ["group-eight-water-60-sep15", 6000],
  ["group-eight-dinner-2430-sep15", 243000],
]);
const outflows = (active.outflows || []).filter((x) => x.status === "paid");
assert(outflows.length === expectedCashOutflows.size, "active direct-cash outflow count mismatch");
for (const [id, amount] of expectedCashOutflows) assert(outflows.find((x) => x.id === id)?.amountPaise === amount, `${id}: active cash outflow missing/wrong`);
assert(sum(outflows) === 293000 && active.cashPaidOutPaise === 293000, "active direct cash outflows must total ₹2,930");
const activeBookCash = active.cashCollectedPaise - active.cashPaidOutPaise;
assert(activeBookCash === 147000 && active.bookCashBalancePaise === 147000, "active book cash must be ₹1,470");
assert(active.physicalCashBalancePaise === 160000, "active physical cash count must be ₹1,600");
assert(active.cashVariancePaise === 13000 && active.cashVarianceStatus === "unresolved-surplus", "active unexplained cash variance must be +₹130 surplus");
assert(active.physicalCashBalancePaise - active.bookCashBalancePaise === active.cashVariancePaise, "active cash variance must equal observed minus book cash");
assert(active.cashCheckpoint?.expectedBalancePaise === 147000 && active.cashCheckpoint?.observedBalancePaise === 160000 && active.cashCheckpoint?.variancePaise === 13000 && active.cashCheckpoint?.status === "unresolved", "active checkpoint must audit ₹1,470 book vs ₹1,600 observed = +₹130");
assert(active.spendableBalancePaise === 160000 && active.spendableBalancePaise === active.physicalCashBalancePaise, "all ₹1,600 active physical cash must be spendable under current policy");
assert(active.reservedPayablesPaise === 0, "no active cash may be contra-reserved");
assert(active.endSettlementPayablesPaise === 44000, "trip-end settlements must remain ₹440");

const expectedCharges = new Map([
  ["group-eight-water-80-sep15", 8000],
  ["group-eight-vadapav-160-sep15", 16000],
  ["group-eight-water-40-sep15", 4000],
  ["group-eight-tejukya-pass-160-sep15", 16000],
  ["group-eight-water-60-sep15", 6000],
  ["group-eight-dinner-2430-sep15", 243000],
  ["group-eight-taxi-mumbai-cha-raja-sep15", 40000],
  ["group-eight-pass-mumbai-cha-raja-sep15", 24000],
]);
const charges = active.charges || [];
assert(charges.length === expectedCharges.size, "active charge count mismatch");
for (const [id, amount] of expectedCharges) {
  const row = charges.find((x) => x.id === id);
  assert(row?.amountPaise === amount, `${id}: charge missing/wrong`);
  assert(sameMembers(row?.participantIds || []), `${id}: participant set must contain all eight members`);
}
assert(sum(charges) === 357000 && active.totalChargedPaise === 357000 && active.fundedChargedPaise === 357000 && active.unfundedChargedPaise === 0, "active charges must total ₹3,570 and be fully funded");
assert(active.perMemberExpenseSharePaise === 44625, "₹3,570 / 8 must equal ₹446.25 per person");

const expenses = live.expenses || [];
const dinner = expenses.find((x) => x.id === "expense-dinner-2430-sep15");
assert(dinner?.amountPaise === 243000 && dinner?.status === "paid" && dinner?.fundingSource === "groupFund", "₹2,430 dinner expense missing or funding wrong");
assert(dinner?.groupFundId === "group-fund-eight-sep15" && dinner?.groupFundOutflowId === "group-eight-dinner-2430-sep15", "dinner expense/outflow linkage mismatch");
assert(sameMembers(dinner?.participantIds || []), "dinner participant set must contain all eight members");
assert(String(dinner?.note || "").includes("₹1,510 + ₹620 + ₹300"), "dinner payment breakdown must be retained exactly");
assert(!JSON.stringify(live).includes("Aprel Cha Raja") && !JSON.stringify(live).includes("aprel-cha-raja"), "corrected ₹160 pass must remain labeled Tejukya only");
const reconciliation = expenses.find((x) => x.id === "expense-cash-reconciliation-sep15");
assert(reconciliation?.status === "reconciliation", "historical ₹462 discrepancy must remain audit-only");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Live finance valid: old Jugal cash history ₹1,500 + ₹1,000 + ₹500 = ₹3,000 with ₹100 reimbursement/no credit; old current variance -₹500; active book cash ₹1,470 vs physical ₹1,600 = +₹130 unresolved audit surplus; active spendable ₹1,600; Milan → Devgna ₹3,778.75 unchanged");
