import fs from "node:fs";
import { buildFinanceSnapshot } from "../src/finance.js";

const read = (relative) =>
  JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));

const base = read("../src/data/trip.json");
const extra = read("../src/data/return-branch.json");
const errors = [];

const all = (key) => [...(base[key] || []), ...(extra[key] || [])];
const ids = (key) => new Set(all(key).map((item) => item.id));
const duplicateIds = (key) => {
  const seen = new Set();
  for (const item of all(key)) {
    if (!item?.id) errors.push(`${key}: missing id`);
    else if (seen.has(item.id)) errors.push(`${key}: duplicate id ${item.id}`);
    else seen.add(item.id);
  }
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
]) duplicateIds(key);

const members = ids("members");
const places = ids("places");
const activities = ids("activities");
const checkpoints = ids("checkpoints");
const resources = ids("resources");

for (const activity of extra.activities || []) {
  if (activity.placeId && !places.has(activity.placeId))
    errors.push(`activity ${activity.id}: unknown place ${activity.placeId}`);
  for (const memberId of activity.participants || [])
    if (!members.has(memberId))
      errors.push(`activity ${activity.id}: unknown participant ${memberId}`);
  for (const sourceId of activity.sourceIds || [])
    if (!resources.has(sourceId))
      errors.push(`activity ${activity.id}: unknown source ${sourceId}`);
  if (activity.date < base.trip.startDate || activity.date > base.trip.endDate)
    errors.push(`activity ${activity.id}: outside trip dates`);
  if (!["fixed", "target", "window", "floating"].includes(activity.timing?.type))
    errors.push(`activity ${activity.id}: invalid timing type`);
  if (activity.timing?.type === "fixed" && !activity.timing.start)
    errors.push(`activity ${activity.id}: fixed timing missing start`);
  const duration = activity.duration || {};
  if (!(duration.minMinutes > 0 && duration.targetMinutes > 0 && duration.maxMinutes > 0))
    errors.push(`activity ${activity.id}: invalid duration`);
  if (!(duration.minMinutes <= duration.targetMinutes && duration.targetMinutes <= duration.maxMinutes))
    errors.push(`activity ${activity.id}: duration range is not monotonic`);
}

for (const place of extra.places || []) {
  if (!Number.isFinite(place.latitude) || place.latitude < -90 || place.latitude > 90)
    errors.push(`place ${place.id}: invalid latitude`);
  if (!Number.isFinite(place.longitude) || place.longitude < -180 || place.longitude > 180)
    errors.push(`place ${place.id}: invalid longitude`);
}

for (const leg of extra.travelLegs || []) {
  if (!places.has(leg.fromPlaceId) || !places.has(leg.toPlaceId))
    errors.push(`travel leg ${leg.id}: broken place reference`);
}

for (const branch of extra.branches || []) {
  if (!(branch.participants?.length > 0))
    errors.push(`branch ${branch.id}: missing participants`);
  for (const memberId of branch.participants || [])
    if (!members.has(memberId))
      errors.push(`branch ${branch.id}: unknown participant ${memberId}`);
  if (branch.rejoinCheckpointId && !checkpoints.has(branch.rejoinCheckpointId))
    errors.push(`branch ${branch.id}: unknown checkpoint ${branch.rejoinCheckpointId}`);
  if (!(branch.lanes?.length > 1))
    errors.push(`branch ${branch.id}: expected at least two lanes`);
  for (const lane of branch.lanes || []) {
    if (!(lane.participants?.length > 0))
      errors.push(`branch ${branch.id}/${lane.id}: missing participants`);
    for (const memberId of lane.participants || [])
      if (!members.has(memberId))
        errors.push(`branch ${branch.id}/${lane.id}: unknown participant ${memberId}`);
    for (const activityId of lane.activityIds || [])
      if (!activities.has(activityId))
        errors.push(`branch ${branch.id}/${lane.id}: unknown activity ${activityId}`);
  }
}

for (const checkpoint of extra.checkpoints || []) {
  if (checkpoint.placeId && !places.has(checkpoint.placeId))
    errors.push(`checkpoint ${checkpoint.id}: unknown place ${checkpoint.placeId}`);
  for (const memberId of checkpoint.participants || [])
    if (!members.has(memberId))
      errors.push(`checkpoint ${checkpoint.id}: unknown participant ${memberId}`);
}

for (const resource of extra.resources || []) {
  if (!["pdf", "image", "link", "note"].includes(resource.type))
    errors.push(`resource ${resource.id}: unsupported type ${resource.type}`);
  if ((resource.type === "pdf" || resource.type === "image") && !resource.path)
    errors.push(`resource ${resource.id}: local file missing path`);
}

for (const expense of extra.expenses || []) {
  if (!Number.isSafeInteger(expense.amountPaise) || expense.amountPaise <= 0)
    errors.push(`expense ${expense.id}: amountPaise must be positive integer paise`);
  if (!members.has(expense.payerId))
    errors.push(`expense ${expense.id}: unknown payer ${expense.payerId}`);
  if (!(expense.participantIds?.length > 0))
    errors.push(`expense ${expense.id}: missing participants`);
  if (new Set(expense.participantIds || []).size !== (expense.participantIds || []).length)
    errors.push(`expense ${expense.id}: duplicate participant`);
  for (const memberId of expense.participantIds || [])
    if (!members.has(memberId))
      errors.push(`expense ${expense.id}: unknown participant ${memberId}`);
  if (expense.sourceId && !resources.has(expense.sourceId))
    errors.push(`expense ${expense.id}: unknown source ${expense.sourceId}`);
  if (expense.budgetScope && !["core", "personal"].includes(expense.budgetScope))
    errors.push(`expense ${expense.id}: unsupported budgetScope ${expense.budgetScope}`);
  if (expense.componentsPaise) {
    const componentTotal = Object.values(expense.componentsPaise).reduce((sum, value) => {
      if (!Number.isSafeInteger(value) || value < 0) {
        errors.push(`expense ${expense.id}: invalid component amount`);
        return sum;
      }
      return sum + value;
    }, 0);
    if (componentTotal !== expense.amountPaise)
      errors.push(
        `expense ${expense.id}: components total ${componentTotal}, expected ${expense.amountPaise}`,
      );
  }
}

// The return-branch overlay extends the original five-person planning data with Het.
// budgetMemberIds is authoritative after the merge and must contain all six equal members.
const budgetMemberIds = extra.finance?.budgetMemberIds || [],
  expectedBudgetMembers = ["het", "milan", "nishit", "pratham", "tirth", "vyas"];
if (new Set(budgetMemberIds).size !== budgetMemberIds.length)
  errors.push("finance: duplicate budget member");
for (const memberId of budgetMemberIds)
  if (!members.has(memberId)) errors.push(`finance: unknown budget member ${memberId}`);
if ([...budgetMemberIds].sort().join(",") !== expectedBudgetMembers.join(","))
  errors.push("finance: merged group budget must contain Vyas, Tirth, Nishit, Milan, Pratham and Het exactly once");

const hetExpense = (extra.expenses || []).find(
  (expense) => expense.id === "expense-return-het",
);
if (!hetExpense) errors.push("finance: Het return expense is missing");
else {
  if (hetExpense.amountPaise !== 23315)
    errors.push(`finance: Het return amount is ${hetExpense.amountPaise}, expected 23315`);
  if (hetExpense.payerId !== "het") errors.push("finance: Het must be the ticket payer");
  if (
    hetExpense.participantIds?.length !== 1 ||
    hetExpense.participantIds[0] !== "het"
  )
    errors.push("finance: Het return ticket must be allocated only to Het");
  if (hetExpense.budgetScope !== "core")
    errors.push("finance: Het is a group member, so his self-paid return ticket must be core spend");
}

const dinner = (extra.expenses || []).find(
  (expense) => expense.id === "expense-pretrip-dinner-sep13",
);
if (!dinner) {
  errors.push("finance: pre-trip dinner is missing");
} else {
  if (dinner.amountPaise !== 82000)
    errors.push(`finance: dinner amount is ${dinner.amountPaise}, expected 82000`);
  if (dinner.payerId !== "vyas") errors.push("finance: Vyas must be the dinner payer");
  const dinnerParticipants = [...(dinner.participantIds || [])].sort(),
    expectedDinnerParticipants = ["het", "milan", "nishit", "tirth", "vyas"];
  if (dinnerParticipants.join(",") !== expectedDinnerParticipants.join(","))
    errors.push("finance: dinner must be shared by Vyas, Tirth, Nishit, Milan and Het only");
  if ((dinner.participantIds || []).includes("pratham"))
    errors.push("finance: Pratham was absent from the pre-trip dinner");
  if (dinner.budgetScope !== "core")
    errors.push("finance: dinner must be a single core group transaction");
  if (82000 / 5 !== 16400)
    errors.push("finance: dinner equal-share invariant failed");
}
if ((extra.expenses || []).some((expense) =>
  ["expense-pretrip-dinner-core-sep13", "expense-pretrip-dinner-het-sep13"].includes(expense.id),
))
  errors.push("finance: legacy split dinner rows must not exist");

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

const withoutIds = (...removedIds) => {
  const removed = new Set(removedIds);
  return merged.expenses.filter((expense) => !removed.has(expense.id));
};
const baseline = buildFinanceSnapshot(
    merged,
    withoutIds("expense-pretrip-dinner-sep13", "expense-return-het"),
  ),
  preDinner = buildFinanceSnapshot(
    merged,
    withoutIds("expense-pretrip-dinner-sep13"),
  ),
  finance = buildFinanceSnapshot(merged, merged.expenses);

const expectNet = (snapshot, expected, label) => {
  for (const [memberId, expectedPaise] of Object.entries(expected)) {
    const actualPaise = snapshot.settlement.rows[memberId]?.netPaise;
    if (actualPaise !== expectedPaise)
      errors.push(`${label}: ${memberId} net is ${actualPaise}, expected ${expectedPaise}`);
  }
};

// Back-trace the known-good state before Het's ticket and before dinner.
const knownRailState = {
  vyas: 41475,
  tirth: 0,
  nishit: 0,
  milan: -41475,
  pratham: 0,
  het: 0,
};
expectNet(baseline, knownRailState, "baseline rail settlement");
if (baseline.recordedPaidPaise !== 165900)
  errors.push(`baseline: recorded paid is ${baseline.recordedPaidPaise}, expected 165900`);
if (baseline.corePaidPaise !== 165900)
  errors.push(`baseline: core paid is ${baseline.corePaidPaise}, expected 165900`);

// Het paid his own ₹233.15 return ticket. It is core trip spend but must not alter anyone's net balance.
expectNet(preDinner, knownRailState, "pre-dinner settlement");
if (preDinner.recordedPaidPaise !== 189215)
  errors.push(`pre-dinner: recorded paid is ${preDinner.recordedPaidPaise}, expected 189215`);
if (preDinner.corePaidPaise !== 189215)
  errors.push(`pre-dinner: core paid is ${preDinner.corePaidPaise}, expected 189215`);
if (preDinner.personalPaidPaise !== 0)
  errors.push(`pre-dinner: personal paid is ${preDinner.personalPaidPaise}, expected 0`);

// The ₹820 dinner adds five exact ₹164 shares. Vyas paid the merchant.
const expectedDinnerDelta = {
  vyas: 65600,
  tirth: -16400,
  nishit: -16400,
  milan: -16400,
  pratham: 0,
  het: -16400,
};
for (const [memberId, expectedDelta] of Object.entries(expectedDinnerDelta)) {
  const actualDelta =
    finance.settlement.rows[memberId].netPaise -
    preDinner.settlement.rows[memberId].netPaise;
  if (actualDelta !== expectedDelta)
    errors.push(`dinner delta: ${memberId} is ${actualDelta}, expected ${expectedDelta}`);
}

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
  ],
  actualTransfers = finance.settlement.transfers.map((item) => [
    item.from,
    item.to,
    item.amountPaise,
  ]);
if (JSON.stringify(actualTransfers) !== JSON.stringify(expectedTransfers))
  errors.push(
    `final settlement transfers are ${JSON.stringify(actualTransfers)}, expected ${JSON.stringify(expectedTransfers)}`,
  );

if (finance.recordedPaidPaise !== 271215)
  errors.push(`finance: recorded paid is ${finance.recordedPaidPaise}, expected 271215`);
if (finance.corePaidPaise !== 271215)
  errors.push(`finance: core paid is ${finance.corePaidPaise}, expected 271215`);
if (finance.personalPaidPaise !== 0)
  errors.push(`finance: personal paid is ${finance.personalPaidPaise}, expected 0`);
if (finance.corePlannedPaise !== 40000)
  errors.push(`finance: core planned is ${finance.corePlannedPaise}, expected 40000`);
if (finance.forecastCorePaise !== 311215)
  errors.push(`finance: forecast core is ${finance.forecastCorePaise}, expected 311215`);
if (finance.ceilingPaise !== 3600000)
  errors.push(`finance: six-person ceiling is ${finance.ceilingPaise}, expected 3600000`);
if (finance.settlement.merchantPaidPaise !== 271215)
  errors.push(`finance: merchant paid is ${finance.settlement.merchantPaidPaise}, expected 271215`);
if (finance.settlement.allocatedSharePaise !== 271215)
  errors.push(`finance: allocated shares are ${finance.settlement.allocatedSharePaise}, expected 271215`);
if (finance.settlement.confirmedReimbursementPaise !== 82950)
  errors.push(`finance: confirmed reimbursements are ${finance.settlement.confirmedReimbursementPaise}, expected 82950`);
if (finance.settlement.unassignedPaidPaise !== 0)
  errors.push(`finance: ${finance.settlement.unassignedPaidPaise} paise has no payer`);
if (finance.settlement.unallocatedSharePaise !== 0)
  errors.push(`finance: ${finance.settlement.unallocatedSharePaise} paise is unallocated`);
if (finance.settlement.netBalancePaise !== 0)
  errors.push(`finance: net balances total ${finance.settlement.netBalancePaise}, expected 0`);
if (finance.settlement.diagnostics.length)
  errors.push(...finance.settlement.diagnostics.map((item) => `finance: ${item}`));

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Return branch + finance valid: six equal group members, ₹820 dinner = 5 × ₹164, final paid paise ${finance.recordedPaidPaise}`,
);
