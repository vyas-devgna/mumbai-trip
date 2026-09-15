import fs from "node:fs";

const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const base = read("../src/data/trip.json");
const historical = read("../src/data/return-branch.json");
const live = read("../src/data/live-finance.json");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const expectedEight = ["het", "jugal", "milan", "neet", "nishit", "pratham", "tirth", "vyas"];
const allMembers = [...(base.members || []), ...(historical.members || []), ...(live.members || [])];
const memberIds = new Set(allMembers.map((member) => member.id));
for (const id of expectedEight) assert(memberIds.has(id), `missing eight-person member ${id}`);
assert((live.finance?.budgetMemberIds || []).slice().sort().join(",") === expectedEight.join(","), "live finance cohort must contain exactly eight members");

const oldBase = historical.finance?.groupFund || {};
const patch = live.finance?.groupFundPatch || {};
const oldHistoricalOutflows = (oldBase.outflows || []).filter((item) => item.status === "paid");
const oldContributions = (oldBase.contributions || []).filter((item) => item.status === "received");
const oldCollected = oldContributions.reduce((sum, item) => sum + item.amountPaise, 0);
const oldHistoricalSpent = oldHistoricalOutflows.reduce((sum, item) => sum + item.amountPaise, 0);
const oldBoundaryBalance = oldCollected - oldHistoricalSpent;

assert(patch.id === "group-fund-six-sep14", "historical six-person pool id mismatch");
assert(oldCollected === 1740000, `historical pool cash collected ${oldCollected}, expected ₹17,400`);
assert(oldHistoricalSpent === 1220000, `historical pool historical outflows ${oldHistoricalSpent}, expected ₹12,200 including reconciliation`);
assert(oldBoundaryBalance === 520000, `historical boundary balance ${oldBoundaryBalance}, expected ₹5,200`);
assert(patch.closedObservedBalancePaise === 520000, "old-pool boundary must remain ₹5,200");
assert(patch.auditVariancePaise === -46200, "historical audit variance must remain -₹462");
assert(patch.postCloseAdvancePaise === 24000, "old pool must advance exactly ₹240 for the new group's pass");
assert(patch.currentPhysicalBalancePaise === 496000, "old pool physical cash after ₹240 advance must be ₹4,960");
assert(patch.interPoolReceivablePaise === 24000, "old pool must carry ₹240 receivable from new pool");
assert(patch.economicBalancePaise === 520000, "old pool economic balance must remain ₹5,200 after receivable");
const oldAdvance = (patch.postCloseAdvances || []).find((item) => item.id === "old-pool-advance-pass-mumbai-cha-raja-sep15");
assert(oldAdvance?.amountPaise === 24000, "old-pool pass advance must be ₹240");
assert(oldAdvance?.handledByMemberId === "tirth", "Tirth must be recorded as handling the old-pool pass payment");
assert(oldAdvance?.toGroupFundId === "group-fund-eight-sep15", "old-pool advance must belong to new eight-person account");
assert(oldAdvance?.status === "receivable", "old-pool pass advance must remain receivable until reimbursed");

const active = live.finance?.activeGroupFund;
assert(active?.id === "group-fund-eight-sep15", "active eight-person account id mismatch");
assert(active?.status === "active", "eight-person account must be active");
assert([...(active?.targetMemberIds || [])].sort().join(",") === expectedEight.join(","), "active account member set must contain exactly eight people");
assert(active?.targetMode === "fixed-contribution", "eight-person account must use fixed contribution mode");
assert(active?.targetPerMemberPaise === 20000, "new group target must be ₹200 per member");
assert(active?.targetTotalPaise === 160000, "new group total contribution target must be ₹1,600");

const contributions = (active?.contributions || []).filter((item) => item.status === "received");
assert(contributions.length === 7, "exactly seven new-group contributions must be received");
const contributionTotal = contributions.reduce((sum, item) => sum + item.amountPaise, 0);
assert(contributionTotal === 140000, `new-group cash collected ${contributionTotal}, expected ₹1,400`);
for (const contribution of contributions) assert(contribution.amountPaise === 20000, `${contribution.id}: contribution must be ₹200`);
assert(!contributions.some((item) => item.memberId === "tirth"), "Tirth's ₹200 contribution must remain outstanding");
assert(active?.outstandingContributionPaise === 20000, "new-group outstanding contribution must be ₹200");
assert((active?.outstandingMemberIds || []).length === 1 && active.outstandingMemberIds[0] === "tirth", "Tirth must be the only outstanding new-group contributor");

const outflows = (active?.outflows || []).filter((item) => item.status === "paid");
const outflowById = new Map(outflows.map((item) => [item.id, item]));
assert(outflowById.get("group-eight-water-80-sep15")?.amountPaise === 8000, "₹80 water must be paid from new-group cash");
assert(outflowById.get("group-eight-taxi-mumbai-cha-raja-sep15")?.amountPaise === 40000, "₹400 taxi must be paid from new-group cash");
const newCashPaidOut = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
assert(newCashPaidOut === 48000, `new-group direct cash outflows ${newCashPaidOut}, expected ₹480`);
assert(active?.cashCollectedPaise === 140000, "stored new-group collected cash must be ₹1,400");
assert(active?.cashPaidOutPaise === 48000, "stored new-group direct cash outflow must be ₹480");
assert(active?.physicalCashBalancePaise === 92000, "new-group physical cash must be ₹920");

const payable = (active?.interPoolPayables || []).find((item) => item.id === "group-eight-payable-old-pool-pass-sep15");
assert(payable?.amountPaise === 24000, "new group must owe old pool ₹240 for pass");
assert(payable?.toGroupFundId === "group-fund-six-sep14", "₹240 payable must point to old six-person pool");
assert(payable?.status === "due", "₹240 inter-pool reimbursement must remain due until physically settled");
assert(active?.interPoolPayablePaise === 24000, "stored inter-pool payable must be ₹240");
assert(active?.spendableBalancePaise === 68000, "new-group free-to-spend balance must be ₹680 after reserving ₹240");

const charges = active?.charges || [];
assert(charges.length === 3, "eight-person account must contain exactly three current charges");
const chargeById = new Map(charges.map((item) => [item.id, item]));
assert(chargeById.get("group-eight-water-80-sep15")?.amountPaise === 8000, "₹80 water charge missing");
assert(chargeById.get("group-eight-taxi-mumbai-cha-raja-sep15")?.amountPaise === 40000, "₹400 taxi charge missing");
const passCharge = chargeById.get("group-eight-pass-mumbai-cha-raja-sep15");
assert(passCharge?.amountPaise === 24000, "₹240 pass charge missing");
assert(passCharge?.paymentSourceGroupFundId === "group-fund-six-sep14", "pass payment source must be old group");
assert(passCharge?.handledByMemberId === "tirth", "pass must record Tirth as handler");
const totalCharged = charges.reduce((sum, item) => sum + item.amountPaise, 0);
assert(totalCharged === 72000, `new-group charged total ${totalCharged}, expected ₹720`);
assert(active?.totalChargedPaise === 72000, "stored charged total must be ₹720");
assert(active?.fundedChargedPaise === 72000, "all ₹720 of current charges must have a known funding source");
assert(active?.unfundedChargedPaise === 0, "no current eight-person charge should remain unfunded");
assert(active?.perMemberExpenseSharePaise === 9000, "₹720 expense total must equal ₹90 per person");
for (const charge of charges) assert([...(charge.participantIds || [])].sort().join(",") === expectedEight.join(","), `${charge.id}: participant set must contain all eight members`);

const water = (live.expenses || []).find((item) => item.id === "expense-water-80-sep15");
const taxi = (live.expenses || []).find((item) => item.id === "expense-taxi-mumbai-cha-raja-sep15");
const pass = (live.expenses || []).find((item) => item.id === "expense-mumbai-cha-raja-pass-sep15");
for (const [label, expense, amount] of [["water", water, 8000], ["taxi", taxi, 40000], ["pass", pass, 24000]]) {
  assert(expense?.amountPaise === amount, `${label}: amount mismatch`);
  assert(expense?.groupFundId === "group-fund-eight-sep15", `${label}: must belong to new eight-person account`);
  assert(expense?.fundingSource === "groupFund", `${label}: must be group-funded`);
  assert(expense?.status === "paid", `${label}: must be confirmed paid`);
  assert([...(expense?.participantIds || [])].sort().join(",") === expectedEight.join(","), `${label}: participant set must contain all eight members`);
}
assert(pass?.paymentSourceGroupFundId === "group-fund-six-sep14", "pass expense must preserve old-pool payment source");
assert(pass?.handledByMemberId === "tirth", "pass expense must preserve Tirth as handler");

const reconciliationOverride = (live.expenses || []).find((item) => item.id === "expense-cash-reconciliation-sep15");
assert(reconciliationOverride?.status === "reconciliation", "₹462 cash variance must remain an audit-only record");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Live finance valid: new 8-person pool collected ₹1,400, Tirth ₹200 due, ₹920 physical cash, ₹240 reserved for old pool, ₹680 free");
