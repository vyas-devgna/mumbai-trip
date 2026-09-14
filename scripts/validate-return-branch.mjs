import fs from "node:fs";
import { buildFinanceSnapshot } from "../src/finance.js";

const read = (relative) =>
  JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));

const base = read("../src/data/trip.json");
const extra = read("../src/data/return-branch.json");
const errors = [];

const all = (key) => {
  const merged = [...(base[key] || [])],
    indexById = new Map(
      merged
        .map((item, index) => [item?.id, index])
        .filter(([id]) => Boolean(id)),
    );
  for (const item of extra[key] || []) {
    const existingIndex = item?.id ? indexById.get(item.id) : undefined;
    if (existingIndex != null) merged[existingIndex] = { ...merged[existingIndex], ...item };
    else {
      if (item?.id) indexById.set(item.id, merged.length);
      merged.push(item);
    }
  }
  return merged;
};
const ids = (key) => new Set(all(key).map((item) => item.id));
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

for (const [sourceLabel, source] of [["base", base], ["extra", extra]]) {
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
    for (const item of source[key] || []) {
      if (!item?.id) errors.push(`${sourceLabel}/${key}: missing id`);
      else if (seen.has(item.id)) errors.push(`${sourceLabel}/${key}: duplicate id ${item.id}`);
      else seen.add(item.id);
    }
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
  if (expense.fundingSource === "groupFund")
    assert(!expense.payerId, `expense ${expense.id}: group-funded expense must not invent a member payer`);
  else
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

const expectedFinanceMembers = ["het", "jugal", "milan", "nishit", "tirth", "vyas"],
  expectedDinnerMembers = ["het", "milan", "nishit", "tirth", "vyas"],
  financeMembers = [...(extra.finance?.budgetMemberIds || [])].sort();
assert(
  financeMembers.join(",") === expectedFinanceMembers.join(","),
  "finance: shared-cost cohort must be Vyas, Tirth, Nishit, Milan, Het and Jugal exactly once",
);
assert(!financeMembers.includes("pratham"), "finance: Pratham must not be in budget or settlement cohort");
assert(
  (base.activities || []).some((activity) => (activity.participants || []).includes("pratham")),
  "plan: Pratham must remain present in itinerary activities",
);
assert(members.has("jugal"), "finance: Jugal member record is missing");

const dinner = (extra.expenses || []).find((expense) => expense.id === "expense-pretrip-dinner-sep13");
assert(Boolean(dinner), "finance: pre-trip dinner is missing");
if (dinner) {
  assert(dinner.amountPaise === 82000, "finance: dinner must be ₹820");
  assert(dinner.payerId === "vyas", "finance: Vyas must be dinner payer");
  assert(
    [...(dinner.participantIds || [])].sort().join(",") === expectedDinnerMembers.join(","),
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
}

const merged = {
  ...base,
  trip: { ...(base.trip || {}), ...(extra.trip || {}) },
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

const finance = buildFinanceSnapshot(merged, merged.expenses);
const expectNet = (expected, label) => {
  for (const [memberId, expectedPaise] of Object.entries(expected))
    assert(
      finance.settlement.rows[memberId]?.netPaise === expectedPaise,
      `${label}: ${memberId} net ${finance.settlement.rows[memberId]?.netPaise}, expected ${expectedPaise}`,
    );
};

const groupFund = merged.finance?.groupFund,
  targetMembers = [...(groupFund?.targetMemberIds || [])].sort(),
  contributions = (groupFund?.contributions || []).filter((item) => item.status === "received"),
  outflows = (groupFund?.outflows || []).filter((item) => item.status === "paid"),
  credited = Object.fromEntries(expectedFinanceMembers.map((id) => [id, 0])),
  physical = Object.fromEntries(expectedFinanceMembers.map((id) => [id, 0]));
for (const contribution of contributions) {
  assert(expectedFinanceMembers.includes(contribution.memberId), `group fund: unknown credited member ${contribution.memberId}`);
  const paidBy = contribution.paidByMemberId || contribution.memberId;
  assert(expectedFinanceMembers.includes(paidBy), `group fund: unknown physical payer ${paidBy}`);
  credited[contribution.memberId] += contribution.amountPaise;
  physical[paidBy] += contribution.amountPaise;
}

assert(groupFund?.targetPerMemberPaise === 300000, "group fund: target must be ₹3,000 per member");
assert(targetMembers.join(",") === expectedFinanceMembers.join(","), "group fund: target member set mismatch");
assert(contributions.reduce((sum, item) => sum + item.amountPaise, 0) === 1450000, "group fund: collected total must be ₹14,500");
assert(outflows.reduce((sum, item) => sum + item.amountPaise, 0) === 800000, "group fund: spent total must be ₹8,000");
assert(1450000 - 800000 === 650000, "group fund: current cash must be ₹6,500");

const expectedCredited = {
  vyas: 300000,
  milan: 300000,
  tirth: 300000,
  nishit: 200000,
  het: 200000,
  jugal: 150000,
};
const expectedPhysical = {
  vyas: 600000,
  milan: 0,
  tirth: 300000,
  nishit: 200000,
  het: 200000,
  jugal: 150000,
};
for (const [id, amount] of Object.entries(expectedCredited))
  assert(credited[id] === amount, `group fund: ${id} credited ${credited[id]}, expected ${amount}`);
for (const [id, amount] of Object.entries(expectedPhysical))
  assert(physical[id] === amount, `group fund: ${id} physically paid ${physical[id]}, expected ${amount}`);

const outstanding = Object.fromEntries(
  expectedFinanceMembers.map((id) => [id, Math.max(0, 300000 - credited[id])]),
);
assert(outstanding.nishit === 100000, "group fund: Nishit must have ₹1,000 outstanding");
assert(outstanding.het === 100000, "group fund: Het must have ₹1,000 outstanding");
assert(outstanding.jugal === 150000, "group fund: Jugal must have ₹1,500 outstanding");
assert(Object.values(outstanding).reduce((sum, value) => sum + value, 0) === 350000, "group fund: total outstanding must be ₹3,500");

const milanMorningAdvance = contributions.find((item) => item.id === "group-fund-milan-morning-sep14"),
  milanTopupAdvance = contributions.find((item) => item.id === "group-fund-milan-topup-sep14");
assert(milanMorningAdvance?.memberId === "milan", "group fund: Milan morning credit missing");
assert(milanMorningAdvance?.paidByMemberId === "vyas", "group fund: Milan morning ₹1,000 must be physically funded by Vyas");
assert(milanMorningAdvance?.amountPaise === 100000, "group fund: Milan morning advance must be ₹1,000");
assert(milanTopupAdvance?.memberId === "milan", "group fund: Milan top-up credit missing");
assert(milanTopupAdvance?.paidByMemberId === "vyas", "group fund: Milan ₹2,000 top-up must be physically funded by Vyas");
assert(milanTopupAdvance?.amountPaise === 200000, "group fund: Milan top-up advance must be ₹2,000");
assert(
  milanMorningAdvance.amountPaise + milanTopupAdvance.amountPaise === 300000,
  "group fund: Vyas must have funded Milan's full ₹3,000 contribution",
);

const hotelExpense = merged.expenses.find((expense) => expense.id === "expense-hotel-blue-stone-sep14"),
  hotelOutflow = outflows.find((outflow) => outflow.id === "group-fund-hotel-blue-stone-sep14"),
  hotelParticipants = [...(hotelExpense?.participantIds || [])].sort();
assert(Boolean(hotelExpense), "hotel: ₹8,000 Hotel Blue Stone expense is missing");
assert(hotelExpense?.amountPaise === 800000, "hotel: expense must be ₹8,000");
assert(hotelExpense?.fundingSource === "groupFund", "hotel: expense must be funded by group account");
assert(hotelExpense?.groupFundOutflowId === hotelOutflow?.id, "hotel: expense/outflow link mismatch");
assert(hotelParticipants.join(",") === expectedFinanceMembers.join(","), "hotel: room participant set must be the six group-account members");
assert(!hotelParticipants.includes("pratham"), "hotel: room 204 expense must not include Pratham");

const finalNet = {
  vyas: 407075,
  tirth: -16400,
  nishit: -16400,
  milan: -357875,
  pratham: 0,
  het: -16400,
  jugal: 0,
};
expectNet(finalNet, "final settlement");

const expectedTransfers = [
  ["milan", "vyas", 357875],
  ["het", "vyas", 16400],
  ["nishit", "vyas", 16400],
  ["tirth", "vyas", 16400],
];
const actualTransfers = finance.settlement.transfers.map((item) => [item.from, item.to, item.amountPaise]);
assert(JSON.stringify(actualTransfers) === JSON.stringify(expectedTransfers), `finance: transfer plan mismatch ${JSON.stringify(actualTransfers)}`);

assert(finance.recordedPaidPaise === 1071215, "finance: recorded paid must be ₹10,712.15");
assert(finance.corePaidPaise === 1071215, "finance: core paid must be ₹10,712.15");
assert(finance.personalPaidPaise === 0, "finance: unexpected personal paid amount");
assert(finance.corePlannedPaise === 20000, "finance: planned shared costs must be ₹200");
assert(finance.forecastCorePaise === 1091215, "finance: forecast must be ₹10,912.15");
assert(finance.ceilingPaise === 3600000, "finance: six-person budget ceiling must be ₹36,000");
assert(finance.plannedShareByMember.pratham === 0, "finance: Pratham received a planned budget share");
assert(finance.settlement.rows.pratham?.netPaise === 0, "finance: Pratham received a settlement balance");
assert(finance.settlement.rows.pratham?.sharePaise === 0, "finance: Pratham received a settlement share");
assert(
  !finance.settlement.transfers.some((transfer) => transfer.from === "pratham" || transfer.to === "pratham"),
  "finance: settlement transfer includes Pratham",
);
assert(finance.settlement.merchantPaidPaise === 271215, "finance: personally funded merchant total mismatch");
assert(finance.settlement.allocatedSharePaise === 271215, "finance: personal allocated shares mismatch");
assert(finance.settlement.confirmedReimbursementPaise === 82950, "finance: reimbursement total mismatch");
assert(finance.settlement.groupFundAdvancePaise === 300000, "finance: member advance total must be ₹3,000");
assert(finance.settlement.unassignedPaidPaise === 0, "finance: unassigned personal paid money exists");
assert(finance.settlement.unallocatedSharePaise === 0, "finance: unallocated personal share exists");
assert(finance.settlement.netBalancePaise === 0, "finance: settlement does not net to zero");
assert(finance.settlement.diagnostics.length === 0, `finance: ${finance.settlement.diagnostics.join("; ")}`);

const hotel = merged.places.find((place) => place.id === "hotel-blue-stone"),
  arrival = merged.activities.find((activity) => activity.id === "sep14-arrival-storage"),
  arrivalLeg = merged.travelLegs.find((leg) => leg.id === "leg-bandra-hotel"),
  sep14Storage = merged.expenses.find((expense) => expense.id === "expense-storage-sep14");
assert(Boolean(hotel), "plan: Hotel Blue Stone is missing");
assert(arrival?.placeId === "hotel-blue-stone", "plan: arrival must resolve to Hotel Blue Stone");
assert(arrival?.status === "completed", "plan: hotel check-in must be marked completed");
assert((arrival?.notes || []).some((note) => note.includes("room 204")), "plan: room 204 is missing from check-in record");
assert([...((arrival?.participants) || [])].sort().join(",") === expectedFinanceMembers.join(","), "plan: room 204 occupants must be the six group-account members");
assert(arrivalLeg?.fromPlaceId === "bandra-terminus" && arrivalLeg?.toPlaceId === "hotel-blue-stone", "plan: Bandra Terminus → hotel leg is missing");
assert(sep14Storage?.status === "cancelled", "finance: obsolete 14 Sep railway storage must be cancelled");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Return branch + finance valid: 6-member finance cohort, ₹${(finance.recordedPaidPaise / 100).toFixed(2)} paid, ₹${((1450000 - 800000) / 100).toFixed(2)} group cash, settlement balanced to the paisa`,
);
