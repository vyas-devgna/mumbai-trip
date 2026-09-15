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
const oldOutflows = [...(oldBase.outflows || []), ...(patch.outflows || [])].filter((item) => item.status === "paid");
const oldContributions = (oldBase.contributions || []).filter((item) => item.status === "received");
const oldCollected = oldContributions.reduce((sum, item) => sum + item.amountPaise, 0);
const oldSpent = oldOutflows.reduce((sum, item) => sum + item.amountPaise, 0);
const oldBalance = oldCollected - oldSpent;

assert(patch.id === "group-fund-six-sep14", "historical six-person pool id mismatch");
assert(patch.status === "closed", "historical six-person pool must be closed");
assert(oldCollected === 1740000, `historical pool cash collected ${oldCollected}, expected ₹17,400`);
assert(oldSpent === 1220000, `historical pool cash outflows ${oldSpent}, expected ₹12,200 including the historical reconciliation`);
assert(oldBalance === 520000, `historical pool balance ${oldBalance}, expected ₹5,200`);
assert(patch.closedObservedBalancePaise === 520000, "closed observed balance must remain ₹5,200");
assert(patch.auditVariancePaise === -46200, "historical audit variance must remain -₹462");
assert((patch.outflows || []).length === 0, "Mumbai Cha Raja phase expenses must not be appended to old six-person cash outflows");
assert(patch.cashCheckpoint?.observedBalancePaise === 520000, "old-pool checkpoint must remain ₹5,200");
assert(patch.cashCheckpoint?.movementSincePreviousPaise === 0, "old-pool movement after phase boundary must be zero");

const active = live.finance?.activeGroupFund;
assert(active?.id === "group-fund-eight-sep15", "active eight-person account id mismatch");
assert(active?.status === "active", "eight-person account must be active");
assert([...(active?.targetMemberIds || [])].sort().join(",") === expectedEight.join(","), "active account member set must contain exactly eight people");
assert(active?.openingBalancePaise === 0, "new eight-person account must start with no transferred old cash");
assert(active?.cashBalancePaise === 0, "new eight-person account cash must remain ₹0 until a real contribution/funding source is supplied");
assert(active?.targetMode === "accrued-share", "eight-person account must derive dues from accrued shared charges");
assert(active?.targetPerMemberPaise === 9000, "current accrued share must be ₹90 per person");
assert(active?.perMemberAccruedSharePaise === 9000, "per-member accrued share must be ₹90");
assert((active?.contributions || []).length === 0, "new account must not invent cash contributions");
assert((active?.outflows || []).length === 0, "new account must not invent cash outflows without a supplied funding source");
assert(live.finance?.activeGroupFundId === active?.id, "active group-fund pointer mismatch");

const charges = active?.charges || [];
assert(charges.length === 3, "eight-person account must contain exactly the three current Mumbai Cha Raja phase charges");
const chargeById = new Map(charges.map((item) => [item.id, item]));
assert(chargeById.get("group-eight-water-80-sep15")?.amountPaise === 8000, "₹80 water charge missing from eight-person account");
assert(chargeById.get("group-eight-taxi-mumbai-cha-raja-sep15")?.amountPaise === 40000, "₹400 Mumbai Cha Raja taxi charge missing from eight-person account");
assert(chargeById.get("group-eight-pass-mumbai-cha-raja-sep15")?.amountPaise === 24000, "₹240 Mumbai Cha Raja pass charge missing from eight-person account");
const totalCharged = charges.reduce((sum, item) => sum + item.amountPaise, 0);
assert(totalCharged === 72000, `eight-person charged total ${totalCharged}, expected ₹720`);
assert(active?.totalChargedPaise === 72000, "eight-person total charged must be ₹720");
assert(active?.unfundedChargedPaise === 72000, "all ₹720 remains unfunded until a payer/contribution is supplied");
for (const charge of charges) {
  assert(charge.status === "charged", `${charge.id}: must remain an accrued charge, not a fabricated cash payment`);
  assert([...(charge.participantIds || [])].sort().join(",") === expectedEight.join(","), `${charge.id}: participant set must contain all eight members`);
}

const water = (live.expenses || []).find((item) => item.id === "expense-water-80-sep15");
const taxi = (live.expenses || []).find((item) => item.id === "expense-taxi-mumbai-cha-raja-sep15");
const pass = (live.expenses || []).find((item) => item.id === "expense-mumbai-cha-raja-pass-sep15");
for (const [label, expense, amount] of [["water", water, 8000], ["taxi", taxi, 40000], ["pass", pass, 24000]]) {
  assert(expense?.amountPaise === amount, `${label}: amount mismatch`);
  assert(expense?.groupFundId === "group-fund-eight-sep15", `${label}: must belong to new eight-person account`);
  assert(expense?.fundingSource === "groupFundAccrued", `${label}: funding must remain accrued until actual payer/cash source is supplied`);
  assert(expense?.status === "charged", `${label}: must be recorded as charged rather than a fabricated paid cash movement`);
  assert([...(expense?.participantIds || [])].sort().join(",") === expectedEight.join(","), `${label}: participant set must contain all eight members`);
}

const reconciliationOverride = (live.expenses || []).find((item) => item.id === "expense-cash-reconciliation-sep15");
assert(reconciliationOverride?.status === "reconciliation", "₹462 cash variance must not remain a confirmed paid merchant expense in the live app");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Live finance valid: old six-person pool remains ₹5,200; new eight-person account carries ₹720 accrued charges = ₹90 each");
