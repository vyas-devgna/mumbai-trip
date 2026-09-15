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
assert(patch.postCloseAdvancePaise === 20000, "old pool must advance exactly ₹200 for one new-group taxi");
assert(patch.currentPhysicalBalancePaise === 500000, "old pool physical cash after ₹200 taxi advance must be ₹5,000");
assert(patch.interPoolReceivablePaise === 20000, "old pool must carry ₹200 receivable from new pool");
assert(patch.economicBalancePaise === 520000, "old pool economic balance must remain ₹5,200 after receivable");
const oldAdvance = (patch.postCloseAdvances || []).find((item) => item.id === "old-pool-advance-taxi-mumbai-cha-raja-sep15");
assert(oldAdvance?.amountPaise === 20000, "old-pool taxi advance must be ₹200");
assert(oldAdvance?.toGroupFundId === "group-fund-eight-sep15", "old-pool taxi advance must belong to new eight-person account");
assert(oldAdvance?.status === "receivable", "old-pool taxi advance must remain receivable until reimbursed");

const active = live.finance?.activeGroupFund;
assert(active?.id === "group-fund-eight-sep15", "active eight-person account id mismatch");
assert(active?.status === "active", "eight-person account must be active");
assert([...(active?.targetMemberIds || [])].sort().join(",") === expectedEight.join(","), "active account member set must contain exactly eight people");
assert(active?.targetMode === "fixed-contribution", "eight-person account must use fixed contribution mode");
assert(active?.targetPerMemberPaise === 20000, "new group target must be ₹200 per member");
assert(active?.targetTotalPaise === 160000, "new group total contribution target must be ₹1,600");

const contributions = (active?.contributions || []).filter((item) => item.status === "received");
assert(contributions.length === 7, "exactly seven new-group cash contributions must be received");
const contributionTotal = contributions.reduce((sum, item) => sum + item.amountPaise, 0);
assert(contributionTotal === 140000, `new-group cash collected ${contributionTotal}, expected ₹1,400`);
for (const contribution of contributions) assert(contribution.amountPaise === 20000, `${contribution.id}: cash contribution must be ₹200`);
assert(!contributions.some((item) => item.memberId === "tirth"), "Tirth must not be recorded as a separate ₹200 cash contributor");

const tirthCredit = (active?.credits || []).find((item) => item.id === "group-eight-credit-tirth-pass-sep15");
assert(tirthCredit?.memberId === "tirth", "Tirth contribution credit missing");
assert(tirthCredit?.amountPaise === 20000, "Tirth contribution credit must be ₹200");
assert(tirthCredit?.status === "applied", "Tirth contribution credit must be applied");
assert(active?.contributionCreditPaise === 20000, "stored contribution credit must be ₹200");
assert(active?.effectiveContributionPaise === 160000, "cash + contribution credit must fully fund ₹1,600 target");
assert(active?.outstandingContributionPaise === 0, "no new-group contribution should remain outstanding");
assert((active?.outstandingMemberIds || []).length === 0, "no member should remain due after Tirth's ₹200 credit");

const outflows = (active?.outflows || []).filter((item) => item.status === "paid");
assert(outflows.length === 1, "only the ₹80 water should be a direct new-group cash outflow");
assert(outflows[0]?.id === "group-eight-water-80-sep15" && outflows[0]?.amountPaise === 8000, "₹80 water must be the only new-group cash outflow");
assert(active?.cashCollectedPaise === 140000, "stored new-group cash collected must be ₹1,400");
assert(active?.cashPaidOutPaise === 8000, "stored new-group direct cash outflow must be ₹80");
assert(active?.physicalCashBalancePaise === 132000, "new-group physical cash must be ₹1,320");

const poolPayable = (active?.interPoolPayables || []).find((item) => item.id === "group-eight-payable-old-pool-taxi-sep15");
assert(poolPayable?.amountPaise === 20000, "new group must owe old pool ₹200 for taxi");
assert(poolPayable?.toGroupFundId === "group-fund-six-sep14", "₹200 inter-pool payable must point to old pool");
assert(poolPayable?.status === "due", "old-pool taxi reimbursement must remain due until physically settled");

const memberPayables = active?.memberPayables || [];
const prathamPayable = memberPayables.find((item) => item.id === "group-eight-payable-pratham-taxi-sep15");
const tirthPayable = memberPayables.find((item) => item.id === "group-eight-payable-tirth-pass-extra-sep15");
assert(prathamPayable?.memberId === "pratham" && prathamPayable?.amountPaise === 20000, "Pratham must be owed ₹200 for second taxi");
assert(tirthPayable?.memberId === "tirth" && tirthPayable?.amountPaise === 4000, "Tirth must be owed only the extra ₹40 on the pass");
assert(active?.interPoolPayablePaise === 20000, "stored old-pool payable must be ₹200");
assert(active?.memberPayablePaise === 24000, "stored member payables must total ₹240");
assert(active?.reservedPayablesPaise === 44000, "total reserves must be ₹440");
assert(active?.spendableBalancePaise === 88000, "new-group free-to-spend balance must be ₹880 after reserves");

const charges = active?.charges || [];
assert(charges.length === 3, "eight-person account must contain exactly three current charges");
const chargeById = new Map(charges.map((item) => [item.id, item]));
assert(chargeById.get("group-eight-water-80-sep15")?.amountPaise === 8000, "₹80 water charge missing");
const taxiCharge = chargeById.get("group-eight-taxi-mumbai-cha-raja-sep15");
assert(taxiCharge?.amountPaise === 40000, "₹400 taxi charge missing");
assert((taxiCharge?.fundingBreakdown || []).some((item) => item.kind === "old-group-advance" && item.amountPaise === 20000), "taxi must include ₹200 old-group funding");
assert((taxiCharge?.fundingBreakdown || []).some((item) => item.kind === "member-advance" && item.memberId === "pratham" && item.amountPaise === 20000), "taxi must include ₹200 Pratham funding");
const passCharge = chargeById.get("group-eight-pass-mumbai-cha-raja-sep15");
assert(passCharge?.amountPaise === 24000, "₹240 pass charge missing");
assert(passCharge?.paidByMemberId === "tirth", "Tirth must be recorded as pass payer");
assert((passCharge?.fundingBreakdown || []).some((item) => item.kind === "member-contribution-credit" && item.memberId === "tirth" && item.amountPaise === 20000), "pass must apply ₹200 as Tirth contribution");
assert((passCharge?.fundingBreakdown || []).some((item) => item.kind === "member-advance" && item.memberId === "tirth" && item.amountPaise === 4000), "pass must leave only ₹40 reimbursable to Tirth");
const totalCharged = charges.reduce((sum, item) => sum + item.amountPaise, 0);
assert(totalCharged === 72000, `new-group charged total ${totalCharged}, expected ₹720`);
assert(active?.totalChargedPaise === 72000, "stored charged total must be ₹720");
assert(active?.fundedChargedPaise === 72000, "all ₹720 current charges must have known funding");
assert(active?.unfundedChargedPaise === 0, "no current eight-person charge should remain unfunded");
assert(active?.perMemberExpenseSharePaise === 9000, "₹720 expense total must equal ₹90 per person");
for (const charge of charges) assert([...(charge.participantIds || [])].sort().join(",") === expectedEight.join(","), `${charge.id}: participant set must contain all eight members`);

const expenses = live.expenses || [];
const oldTaxi = expenses.find((item) => item.id === "expense-taxi-mumbai-cha-raja-sep15");
const taxiOldPool = expenses.find((item) => item.id === "expense-taxi-mumbai-cha-raja-old-pool-sep15");
const taxiPratham = expenses.find((item) => item.id === "expense-taxi-mumbai-cha-raja-pratham-sep15");
assert(oldTaxi?.status === "superseded", "original ₹400 taxi row must be superseded by funding splits");
assert(taxiOldPool?.amountPaise === 20000 && taxiOldPool?.fundingSource === "groupFundExternalAdvance", "taxi 1 must be ₹200 old-pool advance");
assert(taxiPratham?.amountPaise === 20000 && taxiPratham?.payerId === "pratham" && taxiPratham?.fundingSource === "groupFundMemberAdvance", "taxi 2 must be ₹200 Pratham advance");

const oldPass = expenses.find((item) => item.id === "expense-mumbai-cha-raja-pass-sep15");
const passContribution = expenses.find((item) => item.id === "expense-mumbai-cha-raja-pass-contribution-sep15");
const passExtra = expenses.find((item) => item.id === "expense-mumbai-cha-raja-pass-extra-sep15");
assert(oldPass?.status === "superseded", "original ₹240 pass row must be superseded by contribution/extra split");
assert(passContribution?.amountPaise === 20000 && passContribution?.payerId === "tirth" && passContribution?.fundingSource === "groupFundMemberCredit", "₹200 pass portion must settle Tirth contribution");
assert(passExtra?.amountPaise === 4000 && passExtra?.payerId === "tirth" && passExtra?.fundingSource === "groupFundMemberAdvance", "only ₹40 pass portion may remain Tirth advance");

const reconciliationOverride = expenses.find((item) => item.id === "expense-cash-reconciliation-sep15");
assert(reconciliationOverride?.status === "reconciliation", "₹462 cash variance must remain an audit-only record");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Live finance valid: 8-person target fully funded; ₹1,320 physical cash; ₹440 reserved; ₹880 free; Tirth contribution settled via pass");
