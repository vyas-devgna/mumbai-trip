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
}
for (const leg of extra.travelLegs || []) assert(places.has(leg.fromPlaceId) && places.has(leg.toPlaceId), `travel leg ${leg.id}: broken place reference`);
for (const branch of extra.branches || []) {
  for (const id of branch.participants || []) assert(members.has(id), `branch ${branch.id}: unknown participant ${id}`);
  if (branch.rejoinCheckpointId) assert(checkpoints.has(branch.rejoinCheckpointId), `branch ${branch.id}: unknown checkpoint`);
  for (const lane of branch.lanes || []) for (const id of lane.activityIds || []) assert(activities.has(id), `branch ${branch.id}/${lane.id}: unknown activity ${id}`);
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

const merged = {
  ...base,
  trip: { ...(base.trip || {}), ...(extra.trip || {}) },
  finance: { ...(base.finance || {}), ...(extra.finance || {}) },
  members: all("members"), places: all("places"), activities: all("activities"), travelLegs: all("travelLegs"),
  branches: all("branches"), checkpoints: all("checkpoints"), fallbacks: all("fallbacks"), candidates: all("candidates"),
  expenses: all("expenses"), reimbursements: all("reimbursements"), signals: all("signals"), resources: all("resources"),
};

const hotel = merged.places.find((p) => p.id === "hotel-blue-stone");
const arrival = merged.activities.find((a) => a.id === "sep14-arrival-storage");
assert(Boolean(hotel), "Hotel Blue Stone is missing");
assert(arrival?.placeId === "hotel-blue-stone" && arrival?.status === "completed", "hotel check-in must be completed");
assert([...(arrival?.participants || [])].sort().join(",") === expectedFinanceMembers.join(","), "room 204 occupants mismatch");

const fund = merged.finance?.groupFund;
const credits = (fund?.credits || []).filter((item) => item.status === "applied");
const outflows = (fund?.outflows || []).filter((item) => item.status === "paid");
const contributions = (fund?.contributions || []).filter((item) => item.status === "received");
const expenseById = new Map(merged.expenses.map((expense) => [expense.id, expense]));

for (const outflow of outflows) {
  const expense = expenseById.get(outflow.expenseId);
  assert(expense?.fundingSource === "groupFund", `outflow ${outflow.id} must link to group-funded expense`);
  assert(expense?.groupFundOutflowId === outflow.id, `outflow ${outflow.id} backlink mismatch`);
  assert(expense?.amountPaise === outflow.amountPaise, `outflow ${outflow.id} amount mismatch`);
}
for (const credit of credits) {
  const expense = expenseById.get(credit.expenseId);
  assert(expense?.fundingSource === "groupFundMemberCredit", `credit ${credit.id} must link to member-credit expense`);
  assert(expense?.groupFundCreditId === credit.id, `credit ${credit.id} backlink mismatch`);
  assert(expense?.amountPaise === credit.amountPaise, `credit ${credit.id} amount mismatch`);
}

const cashByMember = Object.fromEntries(expectedFinanceMembers.map((id) => [id, 0]));
const creditByMember = Object.fromEntries(expectedFinanceMembers.map((id) => [id, 0]));
for (const item of contributions) cashByMember[item.memberId] += item.amountPaise;
for (const item of credits) creditByMember[item.memberId] += item.amountPaise;
const poolOutstanding = Object.fromEntries(expectedFinanceMembers.map((id) => [id, Math.max(0, fund.targetPerMemberPaise - cashByMember[id] - creditByMember[id])]));
assert(cashByMember.vyas === 300000, "Vyas pool contribution must be ₹3,000");
assert(cashByMember.tirth === 300000, "Tirth pool contribution must be ₹3,000");
assert(cashByMember.nishit === 250000 && creditByMember.nishit === 50000, "Nishit pool target must be ₹2,500 cash + ₹500 credits");
assert(cashByMember.milan === 300000, "Milan pool target must remain fully credited at ₹3,000");
assert(cashByMember.het === 300000, "Het pool contribution must be ₹3,000");
assert(cashByMember.jugal === 290000 && creditByMember.jugal === 10000, "Jugal pool target must be ₹2,900 cash + ₹100 credit");
for (const id of expectedFinanceMembers) assert(poolOutstanding[id] === 0, `${id} pool outstanding must be ₹0`);
assert(Object.values(poolOutstanding).reduce((sum, amount) => sum + amount, 0) === 0, "total pool outstanding must be ₹0");

const jugalAuto = merged.expenses.find((e) => e.id === "expense-auto-jugal-sep14");
assert(jugalAuto?.amountPaise === 10000 && jugalAuto?.payerId === "jugal", "Jugal auto must be ₹100 paid by Jugal");
assert(jugalAuto?.fundingSource === "groupFundMemberCredit", "Jugal auto must be a pool credit");
const groupAuto = merged.expenses.find((e) => e.id === "expense-auto-90-sep14");
assert(groupAuto?.amountPaise === 9000 && groupAuto?.fundingSource === "groupFund", "₹90 auto must be paid from group cash");
const sep15Water = merged.expenses.find((e) => e.id === "expense-water-hotel-sep15");
assert(sep15Water?.amountPaise === 10000 && sep15Water?.fundingSource === "groupFund", "15 Sep hotel water must be ₹100 from group cash");
const sep15TeaCoffee = merged.expenses.find((e) => e.id === "expense-tea-coffee-sep15");
assert(sep15TeaCoffee?.amountPaise === 7000 && sep15TeaCoffee?.fundingSource === "groupFund", "15 Sep tea / coffee must total ₹70 from group cash");
const sep15Reconciliation = merged.expenses.find((e) => e.id === "expense-cash-reconciliation-sep15");
assert(sep15Reconciliation?.amountPaise === 46200 && sep15Reconciliation?.fundingSource === "groupFund", "15 Sep cash reconciliation must record the ₹462 unidentified variance");

const cashCollected = contributions.reduce((sum, item) => sum + item.amountPaise, 0);
const cashSpent = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
assert(cashCollected === 1740000, "group cash contributions must total ₹17,400 after final settlements");
assert(cashSpent === 1220000, "group cash outflows must total ₹12,200 after Sep 15 reconciliation");
assert(cashCollected - cashSpent === 520000, "group cash balance must match observed ₹5,200");

const finance = buildFinanceSnapshot(merged, merged.expenses);
const paidTotal = merged.expenses.filter((expense) => expense.status === "paid").reduce((sum, expense) => sum + expense.amountPaise, 0);
assert(finance.recordedPaidPaise === paidTotal, "recorded paid must equal canonical paid expenses");
assert(finance.corePaidPaise === paidTotal, "all current paid expenses must remain core spend");
assert(finance.personalPaidPaise === 0, "unexpected personal paid amount");
assert(finance.corePlannedPaise === 0, "planned core costs must be ₹0 after removing cloak-room expense");
assert(finance.forecastCorePaise === paidTotal, "forecast must equal confirmed paid spend while no planned costs exist");
assert(finance.ceilingPaise === 3600000, "six-person budget ceiling must be ₹36,000");
assert(finance.plannedShareByMember.pratham === 0, "Pratham received a planned budget share");
assert(finance.settlement.rows.pratham?.netPaise === 0 && finance.settlement.rows.pratham?.sharePaise === 0, "Pratham entered settlement");
assert(finance.settlement.groupFundAdvancePaise === 300000, "Vyas-funded Milan advance must total ₹3,000");
assert(finance.settlement.netBalancePaise === 0, "settlement does not net to zero");
assert(finance.settlement.diagnostics.length === 0, `finance diagnostics: ${finance.settlement.diagnostics.join("; ")}`);

const expectedNet = { vyas:407075, tirth:-16400, nishit:-16400, milan:-357875, pratham:0, het:-16400, jugal:0 };
for (const [id, amount] of Object.entries(expectedNet)) assert(finance.settlement.rows[id]?.netPaise === amount, `${id} settlement mismatch`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Return branch + finance valid: 6-member cohort, ₹${(finance.recordedPaidPaise / 100).toFixed(2)} spent, ₹${(Object.values(poolOutstanding).reduce((s, a) => s + a, 0) / 100).toFixed(2)} pool outstanding, ₹${((cashCollected - cashSpent) / 100).toFixed(2)} cash`);
