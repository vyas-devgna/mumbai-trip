import fs from "node:fs";

const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const base = read("../src/data/trip.json");
const historical = read("../src/data/return-branch.json");
const live = read("../src/data/live-finance.json");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const expectedEight = ["het", "jugal", "milan", "neet", "nishit", "pratham", "tirth", "vyas"];
const oldSix = ["het", "jugal", "milan", "nishit", "tirth", "vyas"];
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
assert(oldSpent === 1268000, `historical pool cash outflows ${oldSpent}, expected ₹12,680 including reconciliation + latest ₹480`);
assert(oldBalance === 472000, `historical pool balance ${oldBalance}, expected ₹4,720`);
assert(patch.closedObservedBalancePaise === 472000, "closed observed balance must be ₹4,720");
assert(patch.auditVariancePaise === -46200, "historical audit variance must remain -₹462");
assert(patch.cashCheckpoint?.previousObservedBalancePaise === 520000, "previous observed cash checkpoint must be ₹5,200");
assert(patch.cashCheckpoint?.movementSincePreviousPaise === -48000, "latest old-pool movement must be -₹480");

const water = (live.expenses || []).find((item) => item.id === "expense-water-80-sep15");
const taxi = (live.expenses || []).find((item) => item.id === "expense-taxi-mumbai-cha-raja-sep15");
assert(water?.amountPaise === 8000 && water?.groupFundId === "group-fund-six-sep14", "₹80 water must belong to the old six-person pool");
assert(taxi?.amountPaise === 40000 && taxi?.groupFundId === "group-fund-six-sep14", "₹400 Mumbai Cha Raja taxi must belong to the old six-person pool");
assert([...(water?.participantIds || [])].sort().join(",") === oldSix.join(","), "₹80 water participant set must remain the old six");
assert([...(taxi?.participantIds || [])].sort().join(",") === oldSix.join(","), "₹400 taxi participant set must remain the old six");

const reconciliationOverride = (live.expenses || []).find((item) => item.id === "expense-cash-reconciliation-sep15");
assert(reconciliationOverride?.status === "reconciliation", "₹462 cash variance must not remain a confirmed paid merchant expense in the live app");

const active = live.finance?.activeGroupFund;
assert(active?.id === "group-fund-eight-sep15", "active eight-person account id mismatch");
assert(active?.status === "active", "eight-person account must be active");
assert([...(active?.targetMemberIds || [])].sort().join(",") === expectedEight.join(","), "active account member set must contain exactly eight people");
assert(active?.openingBalancePaise === 0, "new eight-person account must start at ₹0");
assert(active?.targetPerMemberPaise === 0, "no per-person contribution target may be invented before the user supplies one");
assert((active?.contributions || []).length === 0, "new account must not invent contributions");
assert((active?.outflows || []).length === 0, "new account must have no expenses before its opening boundary");
assert(live.finance?.activeGroupFundId === active?.id, "active group-fund pointer mismatch");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Live finance valid: old six-person pool closed at ₹4,720; new eight-person pool starts separately at ₹0");
