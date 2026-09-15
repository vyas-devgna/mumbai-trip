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

const coveragePolicy = (live.finance?.memberCoveragePolicies || []).find((item) => item.id === "vyas-covers-milan-trip");
assert(coveragePolicy?.beneficiaryMemberId === "milan", "Milan coverage policy must identify Milan as beneficiary");
assert(coveragePolicy?.paidByMemberId === "vyas", "Milan coverage policy must identify Vyas Devgna as payer");
assert(coveragePolicy?.scope === "all-trip-costs", "Milan coverage policy must cover all trip costs");
assert(coveragePolicy?.settlementTiming === "after-trip", "Milan must repay Devgna after the trip");
assert(coveragePolicy?.status === "active", "Milan coverage policy must remain active during the trip");
assert(coveragePolicy?.currentKnownLiabilityPaise === 377875, "current known Milan → Devgna liability must be ₹3,778.75");
const liabilityBreakdown = coveragePolicy?.currentKnownLiabilityBreakdown || [];
assert(liabilityBreakdown.length === 4, "Milan liability must have four current source records");
assert(liabilityBreakdown.reduce((sum, item) => sum + (item.amountPaise || 0), 0) === 377875, "Milan liability breakdown must sum exactly to ₹3,778.75");
const liabilityById = new Map(liabilityBreakdown.map((item) => [item.id, item]));
assert(liabilityById.get("milan-old-group-contribution")?.amountPaise === 300000, "Milan old-group Devgna advance must be ₹3,000");
assert(liabilityById.get("milan-old-group-contribution")?.sourceGroupFundId === "group-fund-six-sep14", "Milan ₹3,000 advance must point to old six-person pool");
assert(liabilityById.get("milan-active-group-contribution")?.amountPaise === 20000, "Milan active-group Devgna advance must be ₹200");
assert(liabilityById.get("milan-active-group-contribution")?.sourceGroupFundId === "group-fund-eight-sep15", "Milan ₹200 advance must point to active eight-person pool");
assert(liabilityById.get("milan-train-shares")?.amountPaise === 41475, "Milan train liability must be ₹414.75");
assert(liabilityById.get("milan-pretrip-dinner-share")?.amountPaise === 16400, "Milan pre-trip dinner liability must be ₹164");
for (const item of liabilityBreakdown) assert(item.status === "due", `${item.id}: Milan liability component must remain due until repayment`);
for (const activeCashExpenseId of ["expense-vadapav-160-sep15", "expense-water-40-sep15", "expense-aprel-cha-raja-pass-160-sep15"]) {
  assert(!liabilityBreakdown.some((item) => (item.sourceRecordIds || []).includes(activeCashExpenseId)), `${activeCashExpenseId}: active-group cash spend must not be double-counted as a separate Milan liability`);
}

const interAccountLink = (live.finance?.interAccountLinks || []).find((item) => item.id === "inter-account-old-to-active-taxi-sep15");
assert(interAccountLink?.kind === "advance", "inter-account taxi link must be an advance");
assert(interAccountLink?.fromGroupFundId === "group-fund-six-sep14", "inter-account taxi link must originate from old pool");
assert(interAccountLink?.toGroupFundId === "group-fund-eight-sep15", "inter-account taxi link must point to active pool");
assert(interAccountLink?.amountPaise === 20000, "inter-account taxi link must be ₹200");
assert(interAccountLink?.status === "due", "inter-account taxi link must remain due until reimbursement");
assert(interAccountLink?.expenseId === "expense-taxi-mumbai-cha-raja-old-pool-sep15", "inter-account taxi link expense mismatch");

const oldBase = historical.finance?.groupFund || {};
const patch = live.finance?.groupFundPatch || {};
const oldHistoricalOutflows = (oldBase.outflows || []).filter((item) => item.status === "paid");
const oldConfirmedMerchantOutflows = oldHistoricalOutflows.filter((item) => item.category !== "reconciliation");
const oldContributions = (oldBase.contributions || []).filter((item) => item.status === "received");
const oldCollected = oldContributions.reduce((sum, item) => sum + item.amountPaise, 0);
const oldHistoricalSpent = oldHistoricalOutflows.reduce((sum, item) => sum + item.amountPaise, 0);
const oldConfirmedMerchantSpent = oldConfirmedMerchantOutflows.reduce((sum, item) => sum + item.amountPaise, 0);
const oldBoundaryBalance = oldCollected - oldHistoricalSpent;

assert(patch.id === "group-fund-six-sep14", "historical six-person pool id mismatch");
assert(oldCollected === 1740000, `historical pool cash collected ${oldCollected}, expected ₹17,400`);
assert(oldConfirmedMerchantSpent === 1173800, `historical confirmed merchant outflows ${oldConfirmedMerchantSpent}, expected ₹11,738`);
assert(oldHistoricalSpent === 1220000, `historical pool accounting outflows ${oldHistoricalSpent}, expected ₹12,200 including reconciliation`);
assert(oldBoundaryBalance === 520000, `historical boundary balance ${oldBoundaryBalance}, expected ₹5,200`);
assert(oldCollected - oldConfirmedMerchantSpent + patch.auditVariancePaise === 520000, "historical confirmed spend plus -₹462 variance must reconcile to ₹5,200 boundary");
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
assert(interAccountLink?.receivableRecordId === oldAdvance?.id, "inter-account link must reference old-pool receivable record");

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
const milanContribution = contributions.find((item) => item.id === "group-eight-contribution-milan-sep15");
assert(milanContribution?.memberId === "milan" && milanContribution?.paidByMemberId === "vyas", "Milan's active ₹200 contribution must be physically funded by Vyas Devgna");
assert(milanContribution?.amountPaise === 20000, "Milan's active-group contribution must remain ₹200");

const historicalMilanAdvance = oldContributions
  .filter((item) => item.memberId === "milan" && (item.paidByMemberId || item.memberId) === "vyas")
  .reduce((sum, item) => sum + item.amountPaise, 0);
assert(historicalMilanAdvance === 300000, "historical Vyas-funded Milan group contribution must remain ₹3,000");
assert(historicalMilanAdvance + milanContribution.amountPaise === 320000, "group-account advances from Vyas for Milan must now total ₹3,200");

const tirthCredit = (active?.credits || []).find((item) => item.id === "group-eight-credit-tirth-pass-sep15");
assert(tirthCredit?.memberId === "tirth", "Tirth contribution credit missing");
assert(tirthCredit?.amountPaise === 20000, "Tirth contribution credit must be ₹200");
assert(tirthCredit?.status === "applied", "Tirth contribution credit must be applied");
assert(active?.contributionCreditPaise === 20000, "stored contribution credit must be ₹200");
assert(active?.effectiveContributionPaise === 160000, "cash + contribution credit must fully fund ₹1,600 target");
assert(active?.outstandingContributionPaise === 0, "no new-group contribution should remain outstanding");
assert((active?.outstandingMemberIds || []).length === 0, "no member should remain due after Tirth's ₹200 credit");

const outflows = (active?.outflows || []).filter((item) => item.status === "paid");
const outflowById = new Map(outflows.map((item) => [item.id, item]));
assert(outflows.length === 4, "active account must have exactly four direct cash outflows: ₹80 water, ₹160 vada pav, ₹40 water and ₹160 Aprel Cha Raja pass");
assert(outflowById.get("group-eight-water-80-sep15")?.amountPaise === 8000, "₹80 water active cash outflow missing");
assert(outflowById.get("group-eight-vadapav-160-sep15")?.amountPaise === 16000, "₹160 vada pav active cash outflow missing");
assert(outflowById.get("group-eight-water-40-sep15")?.amountPaise === 4000, "₹40 water active cash outflow missing");
assert(outflowById.get("group-eight-aprel-cha-raja-pass-160-sep15")?.amountPaise === 16000, "₹160 Aprel Cha Raja pass active cash outflow missing");
const activeCashPaidOut = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
assert(activeCashPaidOut === 44000, `active cash outflows ${activeCashPaidOut}, expected ₹440`);
assert(active?.cashCollectedPaise === 140000, "stored new-group cash collected must be ₹1,400");
assert(active?.cashPaidOutPaise === 44000, "stored new-group direct cash outflow must be ₹440");
assert(active?.physicalCashBalancePaise === 96000, "new-group physical cash must be ₹960 after active cash expenses");

const poolPayable = (active?.interPoolPayables || []).find((item) => item.id === "group-eight-payable-old-pool-taxi-sep15");
assert(poolPayable?.amountPaise === 20000, "new group must owe old pool ₹200 for taxi");
assert(poolPayable?.toGroupFundId === "group-fund-six-sep14", "₹200 inter-pool payable must point to old pool");
assert(poolPayable?.status === "due", "old-pool taxi reimbursement must remain due until physically settled");
assert(interAccountLink?.payableRecordId === poolPayable?.id, "inter-account link must reference active-pool payable record");
assert(interAccountLink?.amountPaise === oldAdvance?.amountPaise && interAccountLink?.amountPaise === poolPayable?.amountPaise, "inter-account link, receivable and payable must have identical amounts");

const memberPayables = active?.memberPayables || [];
const prathamPayable = memberPayables.find((item) => item.id === "group-eight-payable-pratham-taxi-sep15");
const tirthPayable = memberPayables.find((item) => item.id === "group-eight-payable-tirth-pass-extra-sep15");
assert(prathamPayable?.memberId === "pratham" && prathamPayable?.amountPaise === 20000, "Pratham must be owed ₹200 for second taxi");
assert(tirthPayable?.memberId === "tirth" && tirthPayable?.amountPaise === 4000, "Tirth must be owed only the extra ₹40 on the pass");
assert(active?.interPoolPayablePaise === 20000, "stored old-pool payable must be ₹200");
assert(active?.memberPayablePaise === 24000, "stored member payables must total ₹240");
assert(active?.reservedPayablesPaise === 44000, "total reserves must be ₹440");
assert(active?.spendableBalancePaise === 52000, "new-group free-to-spend balance must be ₹520 after ₹440 reserves");

const charges = active?.charges || [];
assert(charges.length === 6, "eight-person account must contain exactly six current charges");
const chargeById = new Map(charges.map((item) => [item.id, item]));
assert(chargeById.get("group-eight-water-80-sep15")?.amountPaise === 8000, "₹80 water charge missing");
const vadaCharge = chargeById.get("group-eight-vadapav-160-sep15");
assert(vadaCharge?.amountPaise === 16000, "₹160 vada pav charge missing");
assert((vadaCharge?.fundingBreakdown || []).some((item) => item.kind === "new-group-cash" && item.amountPaise === 16000), "₹160 vada pav must be funded directly from active group cash");
const water40Charge = chargeById.get("group-eight-water-40-sep15");
assert(water40Charge?.amountPaise === 4000, "₹40 water charge missing");
assert((water40Charge?.fundingBreakdown || []).some((item) => item.kind === "new-group-cash" && item.amountPaise === 4000), "₹40 water must be funded directly from active group cash");
const aprelPassCharge = chargeById.get("group-eight-aprel-cha-raja-pass-160-sep15");
assert(aprelPassCharge?.amountPaise === 16000, "₹160 Aprel Cha Raja pass charge missing");
assert((aprelPassCharge?.fundingBreakdown || []).some((item) => item.kind === "new-group-cash" && item.amountPaise === 16000), "₹160 Aprel Cha Raja pass must be funded directly from active group cash");
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
assert(totalCharged === 108000, `new-group charged total ${totalCharged}, expected ₹1,080`);
assert(active?.totalChargedPaise === 108000, "stored charged total must be ₹1,080");
assert(active?.fundedChargedPaise === 108000, "all ₹1,080 current charges must have known funding");
assert(active?.unfundedChargedPaise === 0, "no current eight-person charge should remain unfunded");
assert(active?.perMemberExpenseSharePaise === 13500, "₹1,080 expense total must equal ₹135 per person");
for (const charge of charges) assert([...(charge.participantIds || [])].sort().join(",") === expectedEight.join(","), `${charge.id}: participant set must contain all eight members`);

const expenses = live.expenses || [];
const vadaExpense = expenses.find((item) => item.id === "expense-vadapav-160-sep15");
assert(vadaExpense?.amountPaise === 16000, "₹160 vada pav expense row missing");
assert(vadaExpense?.status === "paid", "₹160 vada pav must be confirmed paid");
assert(vadaExpense?.fundingSource === "groupFund", "₹160 vada pav must be funded by active group cash");
assert(vadaExpense?.groupFundId === "group-fund-eight-sep15", "₹160 vada pav must belong only to active eight-person account");
assert(vadaExpense?.groupFundOutflowId === "group-eight-vadapav-160-sep15", "₹160 vada pav expense/outflow link mismatch");
assert([...(vadaExpense?.participantIds || [])].sort().join(",") === expectedEight.join(","), "₹160 vada pav participant set must contain all eight members");

const water40Expense = expenses.find((item) => item.id === "expense-water-40-sep15");
assert(water40Expense?.amountPaise === 4000, "₹40 water expense row missing");
assert(water40Expense?.status === "paid", "₹40 water must be confirmed paid");
assert(water40Expense?.fundingSource === "groupFund", "₹40 water must be funded by active group cash");
assert(water40Expense?.groupFundId === "group-fund-eight-sep15", "₹40 water must belong only to active eight-person account");
assert(water40Expense?.groupFundOutflowId === "group-eight-water-40-sep15", "₹40 water expense/outflow link mismatch");
assert([...(water40Expense?.participantIds || [])].sort().join(",") === expectedEight.join(","), "₹40 water participant set must contain all eight members");

const aprelPassExpense = expenses.find((item) => item.id === "expense-aprel-cha-raja-pass-160-sep15");
assert(aprelPassExpense?.amountPaise === 16000, "₹160 Aprel Cha Raja pass expense row missing");
assert(aprelPassExpense?.status === "paid", "₹160 Aprel Cha Raja pass must be confirmed paid");
assert(aprelPassExpense?.fundingSource === "groupFund", "₹160 Aprel Cha Raja pass must be funded by active group cash");
assert(aprelPassExpense?.groupFundId === "group-fund-eight-sep15", "₹160 Aprel Cha Raja pass must belong only to active eight-person account");
assert(aprelPassExpense?.groupFundOutflowId === "group-eight-aprel-cha-raja-pass-160-sep15", "₹160 Aprel Cha Raja pass expense/outflow link mismatch");
assert([...(aprelPassExpense?.participantIds || [])].sort().join(",") === expectedEight.join(","), "₹160 Aprel Cha Raja pass participant set must contain all eight members");

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

console.log("Live finance valid: separate 6-person and 8-person ledgers; linked ₹200 inter-account advance; Milan → Devgna liability ₹3,778.75 without double-counting active cash spend; active pool ₹960 on hand / ₹520 free");