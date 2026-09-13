import fs from "node:fs";
import { buildFinanceSnapshot } from "../src/finance.js";

const read = (relative) =>
  JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));

const base = read("../src/data/trip.json");
const extra = read("../src/data/return-branch.json");
const errors = [];

const all = (key) => [...(base[key] || []), ...(extra[key] || [])];
const ids = (key) => new Set(all(key).map((item) => item.id));
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

for (const key of [
  "members",
  "places",
  "activities",
  "travelLegs",
  "branches",
  "checkpoints",
  "resources",
  "signals",
  "expenses",
  "reimbursements",
]) {
  const seen = new Set();
  for (const item of all(key)) {
    if (!item?.id) errors.push(`${key}: missing id`);
    else if (seen.has(item.id)) errors.push(`${key}: duplicate id ${item.id}`);
    else seen.add(item.id);
  }
}

const members = ids("members");
const places = ids("places");
const activities = ids("activities");
const checkpoints = ids("checkpoints");
const resources = ids("resources");

for (const activity of extra.activities || []) {
  assert(!activity.placeId || places.has(activity.placeId), `activity ${activity.id}: unknown place`);
  for (const memberId of activity.participants || [])
    assert(members.has(memberId), `activity ${activity.id}: unknown participant ${memberId}`);
  for (const sourceId of activity.sourceIds || [])
    assert(resources.has(sourceId), `activity ${activity.id}: unknown source ${sourceId}`);
  assert(
    activity.date >= base.trip.startDate && activity.date <= base.trip.endDate,
    `activity ${activity.id}: outside trip dates`,
  );
  assert(
    ["fixed", "target", "window", "floating"].includes(activity.timing?.type),
    `activity ${activity.id}: invalid timing type`,
  );
  if (activity.timing?.type === "fixed")
    assert(Boolean(activity.timing.start), `activity ${activity.id}: fixed timing missing start`);
  const duration = activity.duration || {};
  assert(
    duration.minMinutes > 0 && duration.targetMinutes > 0 && duration.maxMinutes > 0,
    `activity ${activity.id}: invalid duration`,
  );
  assert(
    duration.minMinutes <= duration.targetMinutes &&
      duration.targetMinutes <= duration.maxMinutes,
    `activity ${activity.id}: duration range is not monotonic`,
  );
}

for (const place of extra.places || []) {
  assert(Number.isFinite(place.latitude) && place.latitude >= -90 && place.latitude <= 90, `place ${place.id}: invalid latitude`);
  assert(Number.isFinite(place.longitude) && place.longitude >= -180 && place.longitude <= 180, `place ${place.id}: invalid longitude`);
}

for (const leg of extra.travelLegs || [])
  assert(places.has(leg.fromPlaceId) && places.has(leg.toPlaceId), `travel leg ${leg.id}: broken place reference`);

for (const branch of extra.branches || []) {
  assert(branch.participants?.length > 0, `branch ${branch.id}: missing participants`);
  for (const memberId of branch.participants || [])
    assert(members.has(memberId), `branch ${branch.id}: unknown participant ${memberId}`);
  if (branch.rejoinCheckpointId)
    assert(checkpoints.has(branch.rejoinCheckpointId), `branch ${branch.id}: unknown checkpoint`);
  assert(branch.lanes?.length > 1, `branch ${branch.id}: expected at least two lanes`);
  for (const lane of branch.lanes || []) {
    assert(lane.participants?.length > 0, `branch ${branch.id}/${lane.id}: missing participants`);
    for (const memberId of lane.participants || [])
      assert(members.has(memberId), `branch ${branch.id}/${lane.id}: unknown participant ${memberId}`);
    for (const activityId of lane.activityIds || [])
      assert(activities.has(activityId), `branch ${branch.id}/${lane.id}: unknown activity ${activityId}`);
  }
}

for (const checkpoint of extra.checkpoints || []) {
  if (checkpoint.placeId)
    assert(places.has(checkpoint.placeId), `checkpoint ${checkpoint.id}: unknown place`);
  for (const memberId of checkpoint.participants || [])
    assert(members.has(memberId), `checkpoint ${checkpoint.id}: unknown participant ${memberId}`);
}

for (const resource of extra.resources || []) {
  assert(["pdf", "image", "link", "note"].includes(resource.type), `resource ${resource.id}: unsupported type`);
  if (resource.type === "pdf" || resource.type === "image")
    assert(Boolean(resource.path), `resource ${resource.id}: local file missing path`);
}

for (const expense of extra.expenses || []) {
  assert(Number.isSafeInteger(expense.amountPaise) && expense.amountPaise > 0, `expense ${expense.id}: invalid amount`);
  assert(members.has(expense.payerId), `expense ${expense.id}: unknown payer`);
  assert(expense.participantIds?.length > 0, `expense ${expense.id}: missing participants`);
  assert(new Set(expense.participantIds || []).size === (expense.participantIds || []).length, `expense ${expense.id}: duplicate participant`);
  for (const memberId of expense.participantIds || [])
    assert(members.has(memberId), `expense ${expense.id}: unknown participant ${memberId}`);
  if (expense.sourceId)
    assert(resources.has(expense.sourceId), `expense ${expense.id}: unknown source`);
  if (expense.componentsPaise) {
    const componentTotal = Object.values(expense.componentsPaise).reduce((sum, value) => {
      assert(Number.isSafeInteger(value) && value >= 0, `expense ${expense.id}: invalid component`);
      return sum + value;
    }, 0);
    assert(componentTotal === expense.amountPaise, `expense ${expense.id}: component total mismatch`);
  }
}

const expectedFinanceMembers = ["het", "milan", "nishit", "tirth", "vyas"],
  financeMembers = [...(extra.finance?.budgetMemberIds || [])].sort();
assert(
  financeMembers.join(",") === expectedFinanceMembers.join(","),
  "finance: shared-cost cohort must be Vyas, Tirth, Nishit, Milan and Het exactly once",
);
assert(!financeMembers.includes("pratham"), "finance: Pratham must not be in budget or settlement cohort");
assert(
  (base.activities || []).some((activity) => (activity.participants || []).includes("pratham")),
  "plan: Pratham must remain present in itinerary activities",
);

const dinner = (extra.expenses || []).find((expense) => expense.id === "expense-pretrip-dinner-sep13");
assert(Boolean(dinner), "finance: pre-trip dinner is missing");
if (dinner) {
  assert(dinner.amountPaise === 82000, "finance: dinner must be ₹820");
  assert(dinner.payerId === "vyas", "finance: Vyas must be dinner payer");
  assert(
    [...(dinner.participantIds || [])].sort().join(",") === expectedFinanceMembers.join(","),
    "finance: dinner participant set is wrong",
  );
  assert(dinner.budgetScope === "core", "finance: dinner must be core spend");
}

const hetTicket = (extra.expenses || []).find((expense) => expense.id === "expense-return-het");
assert(Boolean(hetTicket), "finance: Het return ticket is missing");
if (hetTicket) {
  assert(hetTicket.amountPaise === 23315, "finance: Het ticket amount mismatch");
  assert(hetTicket.payerId === "het", "finance: Het must pay his own ticket");
  assert(
    hetTicket.participantIds?.length === 1 && hetTicket.participantIds[0] === "het",
    "finance: Het ticket must be allocated only to Het",
  );
  assert(hetTicket.budgetScope === "core", "finance: Het ticket must remain group trip spend");
}

const merged = {
  ...base,
  finance: { ...(base.finance || {}), ...(extra.finance || {}) },
  members: all("members"),
  places: all("places"),
  activities: all("activities"),
  travelLegs: all("travelLegs"),
  branches: all("branches"),
  checkpoints: all("checkpoints"),
  fallbacks: all("fallbacks"),
  candidates: all("candidates"),
  expenses: all("expenses"),
  reimbursements: all("reimbursements"),
  signals: all("signals"),
  resources: all("resources"),
};

const without = (...idsToRemove) => {
  const removed = new Set(idsToRemove);
  return merged.expenses.filter((expense) => !removed.has(expense.id));
};
const baseline = buildFinanceSnapshot(merged, without("expense-pretrip-dinner-sep13", "expense-return-het"));
const preDinner = buildFinanceSnapshot(merged, without("expense-pretrip-dinner-sep13"));
const finance = buildFinanceSnapshot(merged, merged.expenses);

const expectNet = (snapshot, expected, label) => {
  for (const [memberId, expectedPaise] of Object.entries(expected))
    assert(
      snapshot.settlement.rows[memberId]?.netPaise === expectedPaise,
      `${label}: ${memberId} net ${snapshot.settlement.rows[memberId]?.netPaise}, expected ${expectedPaise}`,
    );
};

const railNet = {
  vyas: 41475,
  tirth: 0,
  nishit: 0,
  milan: -41475,
  pratham: 0,
  het: 0,
};
expectNet(baseline, railNet, "baseline rail");
expectNet(preDinner, railNet, "pre-dinner");

assert(baseline.recordedPaidPaise === 165900, "baseline: paid total mismatch");
assert(preDinner.recordedPaidPaise === 189215, "pre-dinner: paid total mismatch");
assert(preDinner.corePaidPaise === 189215, "pre-dinner: core paid mismatch");

const finalNet = {
  vyas: 107075,
  tirth: -16400,
  nishit: -16400,
  milan: -57875,
  pratham: 0,
  het: -16400,
};
expectNet(finance, finalNet, "final settlement");

const expectedTransfers = [
  ["milan", "vyas", 57875],
  ["het", "vyas", 16400],
  ["nishit", "vyas", 16400],
  ["tirth", "vyas", 16400],
];
const actualTransfers = finance.settlement.transfers.map((item) => [item.from, item.to, item.amountPaise]);
assert(JSON.stringify(actualTransfers) === JSON.stringify(expectedTransfers), `finance: transfer plan mismatch ${JSON.stringify(actualTransfers)}`);

assert(finance.recordedPaidPaise === 271215, "finance: recorded paid mismatch");
assert(finance.corePaidPaise === 271215, "finance: core paid mismatch");
assert(finance.personalPaidPaise === 0, "finance: unexpected personal paid amount");
assert(finance.corePlannedPaise === 40000, "finance: planned shared costs mismatch");
assert(finance.forecastCorePaise === 311215, "finance: forecast mismatch");
assert(finance.ceilingPaise === 3000000, "finance: five-person budget ceiling must be ₹30,000");
assert(finance.plannedShareByMember.pratham === 0, "finance: Pratham received a planned budget share");
assert(finance.settlement.rows.pratham?.netPaise === 0, "finance: Pratham received a settlement balance");
assert(finance.settlement.rows.pratham?.sharePaise === 0, "finance: Pratham received a settlement share");
assert(
  !finance.settlement.transfers.some((transfer) => transfer.from === "pratham" || transfer.to === "pratham"),
  "finance: settlement transfer includes Pratham",
);
assert(finance.settlement.merchantPaidPaise === 271215, "finance: merchant paid mismatch");
assert(finance.settlement.allocatedSharePaise === 271215, "finance: allocated shares mismatch");
assert(finance.settlement.confirmedReimbursementPaise === 82950, "finance: reimbursement total mismatch");
assert(finance.settlement.unassignedPaidPaise === 0, "finance: unassigned paid money exists");
assert(finance.settlement.unallocatedSharePaise === 0, "finance: unallocated share exists");
assert(finance.settlement.netBalancePaise === 0, "finance: settlement does not net to zero");
assert(finance.settlement.diagnostics.length === 0, `finance: ${finance.settlement.diagnostics.join("; ")}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Return branch + finance valid: 5-member finance cohort, ₹${(finance.recordedPaidPaise / 100).toFixed(2)} paid, settlement balanced to the paisa`,
);
