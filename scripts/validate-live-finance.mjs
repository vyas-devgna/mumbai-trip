import fs from "node:fs";

const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const historical = read("../src/data/return-branch.json");
const live = read("../src/data/live-finance.json");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const sum = (items = []) => items.reduce((total, item) => total + (item.amountPaise || 0), 0);
const expectedEight = ["het", "jugal", "milan", "neet", "nishit", "pratham", "tirth", "vyas"];
const sameMembers = (ids = []) => [...ids].sort().join(",") === expectedEight.join(",");

assert(sameMembers(live.finance?.budgetMemberIds || []), "live finance cohort must contain exactly eight members");

const coverage = (live.finance?.memberCoveragePolicies || []).find((x) => x.id === "vyas-covers-milan-trip");
assert(coverage?.currentKnownLiabilityPaise === 377875, "Milan → Devgna liability must remain ₹3,778.75");
assert(sum(coverage?.currentKnownLiabilityBreakdown || []) === 377875, "Milan liability breakdown mismatch");
assert(!(coverage?.currentKnownLiabilityBreakdown || []).some((x) => (x.sourceRecordIds || []).includes("expense-taxi-600-sep15")), "group-funded ₹600 taxi must not enter Milan personal debt");

const oldBase = historical.finance?.groupFund || {};
const patch = live.finance?.groupFundPatch || {};
const oldContributions = (oldBase.contributions || []).filter((x) => x.status === "received");
const oldCredits = (oldBase.credits || []).filter((x) => x.status === "applied");
const oldOutflows = (oldBase.outflows || []).filter((x) => x.status === "paid");
const replacement = (patch.contributions || []).find((x) => x.id === "group-fund-jugal-replacement-500-sep15");
const jugalCash = oldContributions.filter((x) => x.memberId === "jugal").reduce((t, x) => t + x.amountPaise, 0);
assert(jugalCash === 250000 && replacement?.amountPaise === 50000, "Jugal old cash history must be ₹1,500 + ₹1,000 + ₹500 = ₹3,000");
assert(!oldCredits.some((x) => x.memberId === "jugal"), "Jugal must have no old-pool contribution credit after reimbursement");
assert(oldOutflows.some((x) => x.id === "group-fund-reimburse-jugal-auto-sep14" && x.amountPaise === 10000), "Jugal ₹100 reimbursement outflow missing");
assert(patch.historicalAuditVariancePaise === -46200, "historical -₹462 variance must remain");
assert(patch.currentPhysicalBalancePaise === 450000 && patch.expectedPhysicalBalancePaise === 500000 && patch.currentCashVariancePaise === -50000, "old current cash must remain ₹4,500 observed vs ₹5,000 expected = -₹500");
assert(patch.interPoolReceivablePaise === 20000, "old pool ₹200 active-account receivable must remain");

const active = live.finance?.activeGroupFund || {};
assert(active.id === "group-fund-eight-sep15" && active.status === "active", "active account mismatch");
assert(sameMembers(active.targetMemberIds || []), "active account must contain all eight members");
assert(active.targetPerMemberPaise === 70000 && active.targetTotalPaise === 560000, "active target must remain ₹700/person = ₹5,600");
assert(active.cashCollectedPaise === 440000 && active.contributionCreditPaise === 20000 && active.effectiveContributionPaise === 460000, "active contribution totals mismatch");
assert(active.outstandingContributionPaise === 100000 && [...(active.outstandingMemberIds || [])].sort().join(",") === "het,nishit", "only Het and Nishit may remain ₹500 outstanding");

const outflows = (active.outflows || []).filter((x) => x.status === "paid");
const taxiOutflow = outflows.find((x) => x.id === "group-eight-taxi-600-sep15");
assert(taxiOutflow?.amountPaise === 60000 && taxiOutflow?.expenseId === "expense-taxi-600-sep15", "latest ₹600 taxi cash outflow missing");
assert(sum(outflows) === 353000 && active.cashPaidOutPaise === 353000, "active direct cash outflows must total ₹3,530");
assert(active.bookCashBalancePaise === 87000 && active.cashCollectedPaise - active.cashPaidOutPaise === 87000, "active book cash must be ₹870");
assert(active.physicalCashBalancePaise === 100000 && active.spendableBalancePaise === 100000, "active physical/spendable cash must be ₹1,000 after taxi");
assert(active.cashVariancePaise === 13000 && active.physicalCashBalancePaise - active.bookCashBalancePaise === 13000, "active +₹130 audit surplus must remain unresolved");
assert(active.cashVarianceStatus === "unresolved-surplus", "active cash variance status mismatch");
assert(active.cashCheckpoint?.expectedBalancePaise === 87000 && active.cashCheckpoint?.observedBalancePaise === 100000 && active.cashCheckpoint?.variancePaise === 13000, "active checkpoint must be ₹870 book vs ₹1,000 observed = +₹130");
assert(active.reservedPayablesPaise === 0 && active.endSettlementPayablesPaise === 44000, "trip-end payables must remain ₹440 and not be reserved from live cash");

const charges = active.charges || [];
const taxiCharge = charges.find((x) => x.id === "group-eight-taxi-600-sep15");
assert(taxiCharge?.amountPaise === 60000 && sameMembers(taxiCharge?.participantIds || []), "latest ₹600 taxi charge must be shared by all eight");
assert(sum(charges) === 417000 && active.totalChargedPaise === 417000 && active.fundedChargedPaise === 417000 && active.unfundedChargedPaise === 0, "active charges must total ₹4,170 and remain fully funded");
assert(active.perMemberExpenseSharePaise === 52125, "₹4,170 / 8 must equal ₹521.25 per person");

const expenses = live.expenses || [];
const taxi = expenses.find((x) => x.id === "expense-taxi-600-sep15");
assert(taxi?.amountPaise === 60000 && taxi?.status === "paid" && taxi?.fundingSource === "groupFund", "₹600 taxi expense missing/wrong");
assert(taxi?.groupFundId === active.id && taxi?.groupFundOutflowId === taxiOutflow?.id, "₹600 taxi expense/outflow linkage mismatch");
assert(sameMembers(taxi?.participantIds || []), "₹600 taxi must apply to all eight members");
const dinner = expenses.find((x) => x.id === "expense-dinner-2430-sep15");
assert(String(dinner?.note || "").includes("₹1,510 + ₹620 + ₹300"), "dinner payment breakdown must remain exact");
assert(expenses.find((x) => x.id === "expense-cash-reconciliation-sep15")?.status === "reconciliation", "historical reconciliation must remain audit-only");
assert(!JSON.stringify(live).includes("Aprel Cha Raja"), "stale Aprel label must not return");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Live finance valid: ₹600 taxi from active cash; cash outflows ₹3,530; book ₹870 vs physical/spendable ₹1,000 = +₹130 audit surplus; charges ₹4,170 / ₹521.25 each; Milan → Devgna ₹3,778.75 unchanged");
