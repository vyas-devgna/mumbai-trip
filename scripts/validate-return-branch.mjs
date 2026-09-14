import fs from "node:fs";
import { buildFinanceSnapshot } from "../src/finance.js";

const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const base = read("../src/data/trip.json");
const extra = read("../src/data/return-branch.json");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const all = (key) => {
  const merged = [...(base[key] || [])];
  const index = new Map(merged.map((item, i) => [item?.id, i]).filter(([id]) => id));
  for (const item of extra[key] || []) {
    const i = item?.id ? index.get(item.id) : undefined;
    if (i != null) merged[i] = { ...merged[i], ...item };
    else { if (item?.id) index.set(item.id, merged.length); merged.push(item); }
  }
  return merged;
};
const ids = (key) => new Set(all(key).map((item) => item.id));

for (const [sourceLabel, source] of [["base", base], ["extra", extra]]) {
  for (const key of ["members","places","activities","travelLegs","branches","checkpoints","resources","signals","expenses","reimbursements"]) {
    const seen = new Set();
    for (const item of source[key] || []) {
      if (!item?.id) errors.push(`${sourceLabel}/${key}: missing id`);
      else if (seen.has(item.id)) errors.push(`${sourceLabel}/${key}: duplicate id ${item.id}`);
      else seen.add(item.id);
    }
  }
}

const members = ids("members"), places = ids("places"), activities = ids("activities"), checkpoints = ids("checkpoints"), resources = ids("resources");
for (const activity of extra.activities || []) {
  assert(!activity.placeId || places.has(activity.placeId), `activity ${activity.id}: unknown place`);
  for (const id of activity.participants || []) assert(members.has(id), `activity ${activity.id}: unknown participant ${id}`);
  for (const id of activity.sourceIds || []) assert(resources.has(id), `activity ${activity.id}: unknown source ${id}`);
  assert(activity.date >= base.trip.startDate && activity.date <= base.trip.endDate, `activity ${activity.id}: outside trip dates`);
  assert(["fixed","target","window","floating"].includes(activity.timing?.type), `activity ${activity.id}: invalid timing type`);
}
for (const place of extra.places || []) {
  assert(Number.isFinite(place.latitude) && place.latitude >= -90 && place.latitude <= 90, `place ${place.id}: invalid latitude`);
  assert(Number.isFinite(place.longitude) && place.longitude >= -180 && place.longitude <= 180, `place ${place.id}: invalid longitude`);
}
for (const leg of extra.travelLegs || []) assert(places.has(leg.fromPlaceId) && places.has(leg.toPlaceId), `travel leg ${leg.id}: broken place reference`);
for (const branch of extra.branches || []) {
  for (const id of branch.participants || []) assert(members.has(id), `branch ${branch.id}: unknown participant ${id}`);
  if (branch.rejoinCheckpointId) assert(checkpoints.has(branch.rejoinCheckpointId), `branch ${branch.id}: unknown checkpoint`);
  for (const lane of branch.lanes || []) for (const id of lane.activityIds || []) assert(activities.has(id), `branch ${branch.id}/${lane.id}: unknown activity ${id}`);
}
for (const resource of extra.resources || []) {
  assert(["pdf","image","link","note"].includes(resource.type), `resource ${resource.id}: unsupported type`);
  if (["pdf","image"].includes(resource.type)) assert(Boolean(resource.path), `resource ${resource.id}: local file missing path`);
}
for (const expense of extra.expenses || []) {
  assert(Number.isSafeInteger(expense.amountPaise) && expense.amountPaise > 0, `expense ${expense.id}: invalid amount`);
  if (expense.fundingSource === "groupFund") assert(!expense.payerId, `expense ${expense.id}: group-funded expense must not invent a payer`);
  else assert(members.has(expense.payerId), `expense ${expense.id}: unknown payer`);
  if (expense.fundingSource === "groupFundMemberCredit") assert(Boolean(expense.groupFundCreditId), `expense ${expense.id}: missing group-fund credit link`);
  for (const id of expense.participantIds || []) assert(members.has(id), `expense ${expense.id}: unknown participant ${id}`);
}

const expectedFinanceMembers = ["het","jugal","milan","nishit","tirth","vyas"];
const financeMembers = [...(extra.finance?.budgetMemberIds || [])].sort();
assert(financeMembers.join(",") === expectedFinanceMembers.join(","), "finance cohort must be Vyas, Tirth, Nishit, Milan, Het and Jugal");
assert(!financeMembers.includes("pratham"), "Pratham must remain outside budget and settlement");
assert((base.activities || []).some((a) => (a.participants || []).includes("pratham")), "Pratham must remain in the itinerary");

const merged = {
  ...base,
  trip: { ...(base.trip || {}), ...(extra.trip || {}) },
  finance: { ...(base.finance || {}), ...(extra.finance || {}) },
  members: all("members"), places: all("places"), activities: all("activities"), travelLegs: all("travelLegs"),
  branches: all("branches"), checkpoints: all("checkpoints"), fallbacks: all("fallbacks"), candidates: all("candidates"),
  expenses: all("expenses"), reimbursements: all("reimbursements"), signals: all("signals"), resources: all("resources"),
};

const dinner = merged.expenses.find((e) => e.id === "expense-pretrip-dinner-sep13");
assert(dinner?.amountPaise === 82000 && dinner?.payerId === "vyas", "pre-trip dinner mismatch");
assert([...(dinner?.participantIds || [])].sort().join(",") === ["het","milan","nishit","tirth","vyas"].join(","), "dinner participants mismatch");
const hetTicket = merged.expenses.find((e) => e.id === "expense-return-het");
assert(hetTicket?.amountPaise === 23315 && hetTicket?.payerId === "het", "Het return ticket mismatch");

const storage14 = merged.expenses.find((e) => e.id === "expense-storage-sep14");
const storage16 = merged.expenses.find((e) => e.id === "expense-storage-sep16");
assert(storage14?.status === "cancelled", "14→15 railway storage must be cancelled");
assert(storage16?.status === "cancelled", "16→17 cloak-room storage must be cancelled");
assert(!merged.expenses.some((e) => e.category === "storage" && e.status === "planned"), "planned storage expense still exists");

const hotel = merged.places.find((p) => p.id === "hotel-blue-stone");
const arrival = merged.activities.find((a) => a.id === "sep14-arrival-storage");
const arrivalLeg = merged.travelLegs.find((l) => l.id === "leg-bandra-hotel");
assert(Boolean(hotel), "Hotel Blue Stone is missing");
assert(arrival?.placeId === "hotel-blue-stone" && arrival?.status === "completed", "hotel check-in must be completed");
assert((arrival?.notes || []).some((note) => note.includes("room 204")), "room 204 missing from check-in record");
assert([...(arrival?.participants || [])].sort().join(",") === expectedFinanceMembers.join(","), "room 204 occupants mismatch");
assert(arrivalLeg?.fromPlaceId === "bandra-terminus" && arrivalLeg?.toPlaceId === "hotel-blue-stone", "Bandra Terminus → hotel leg missing");

const fund = merged.finance?.groupFund;
const uber = merged.expenses.find((e) => e.id === "expense-uber-siddhivinayak-sep14");
const uberCredit = (fund?.credits || []).find((c) => c.id === "group-fund-credit-nishit-uber-sep14");
assert(uber?.amountPaise === 44000 && uber?.status === "paid", "Uber expense must be ₹440 paid");
assert(uber?.payerId === "nishit", "Uber must be paid directly by Nishit");
assert(uber?.fundingSource === "groupFundMemberCredit", "Uber must be credited against Nishit's pool target");
assert(uber?.groupFundCreditId === uberCredit?.id && uberCredit?.amountPaise === 44000, "Uber pool credit mismatch");
assert([...(uber?.participantIds || [])].sort().join(",") === expectedFinanceMembers.join(","), "Uber participant set mismatch");
assert(!(fund?.outflows || []).some((item) => item.expenseId === uber?.id && item.status === "paid"), "Nishit-paid Uber must not reduce group cash");

const snacks = merged.expenses.find((e) => e.id === "expense-snacks-sep14");
assert(snacks?.amountPaise === 10000 && snacks?.status === "paid", "snacks expense must be ₹100 paid");
assert(snacks?.fundingSource === "groupFund" && !snacks?.payerId, "snacks must be paid from group cash");
assert([...(snacks?.participantIds || [])].sort().join(",") === expectedFinanceMembers.join(","), "snacks participant set mismatch");

const finance = buildFinanceSnapshot(merged, merged.expenses);
assert(finance.recordedPaidPaise === 1125215, "recorded paid must be ₹11,252.15");
assert(finance.corePaidPaise === 1125215, "core paid must be ₹11,252.15");
assert(finance.personalPaidPaise === 0, "unexpected personal paid amount");
assert(finance.corePlannedPaise === 0, "planned core costs must be ₹0 after removing cloak-room expense");
assert(finance.forecastCorePaise === 1125215, "forecast must equal paid costs after corrected Uber and snacks");
assert(finance.ceilingPaise === 3600000, "six-person budget ceiling must be ₹36,000");
assert(finance.plannedShareByMember.pratham === 0, "Pratham received a planned budget share");
assert(finance.settlement.rows.pratham?.netPaise === 0 && finance.settlement.rows.pratham?.sharePaise === 0, "Pratham entered settlement");
assert(finance.settlement.groupFundAdvancePaise === 300000, "Vyas-funded Milan advance must total ₹3,000");
assert(finance.settlement.netBalancePaise === 0, "settlement does not net to zero");
assert(finance.settlement.diagnostics.length === 0, `finance diagnostics: ${finance.settlement.diagnostics.join("; ")}`);

const expectedNet = { vyas:407075, tirth:-16400, nishit:-16400, milan:-357875, pratham:0, het:-16400, jugal:0 };
for (const [id, amount] of Object.entries(expectedNet)) assert(finance.settlement.rows[id]?.netPaise === amount, `${id} settlement mismatch`);
const expectedTransfers = [["milan","vyas",357875],["het","vyas",16400],["nishit","vyas",16400],["tirth","vyas",16400]];
const actualTransfers = finance.settlement.transfers.map((t) => [t.from,t.to,t.amountPaise]);
assert(JSON.stringify(actualTransfers) === JSON.stringify(expectedTransfers), `transfer plan mismatch ${JSON.stringify(actualTransfers)}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Return branch + finance valid: 6-member cohort, ₹${(finance.recordedPaidPaise / 100).toFixed(2)} spent, ₹3,060 pool outstanding`);
