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

const budgetMemberIds = extra.finance?.budgetMemberIds || [];
if (new Set(budgetMemberIds).size !== budgetMemberIds.length)
  errors.push("finance: duplicate budget member");
for (const memberId of budgetMemberIds)
  if (!members.has(memberId)) errors.push(`finance: unknown budget member ${memberId}`);
if (
  Number.isSafeInteger(base.trip?.budget?.groupSizeBudgeted) &&
  budgetMemberIds.length !== base.trip.budget.groupSizeBudgeted
)
  errors.push(
    `finance: ${budgetMemberIds.length} budget members, expected ${base.trip.budget.groupSizeBudgeted}`,
  );
if (budgetMemberIds.includes("het"))
  errors.push("finance: Het must remain outside the five-person core planning budget");

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
  if (hetExpense.budgetScope !== "personal")
    errors.push("finance: Het return ticket must be outside the core budget");
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
const finance = buildFinanceSnapshot(merged, merged.expenses),
  financeWithoutHet = buildFinanceSnapshot(
    merged,
    merged.expenses.filter((expense) => expense.id !== "expense-return-het"),
  );
if (finance.corePaidPaise !== financeWithoutHet.corePaidPaise)
  errors.push("finance: Het personal ticket leaked into the core paid total");
if (finance.recordedPaidPaise - financeWithoutHet.recordedPaidPaise !== 23315)
  errors.push("finance: Het ticket does not add exactly 23315 paise to recorded spend");
if (finance.settlement.rows.het?.netPaise !== 0)
  errors.push(`finance: Het net is ${finance.settlement.rows.het?.netPaise}, expected 0`);
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
  `Return branch + finance valid: ${(extra.members || []).length} extra member, ${(extra.activities || []).length} extra activity, ${finance.recordedPaidPaise} paid paise recorded`,
);
