import fs from "node:fs";
import { buildFinanceSnapshot } from "../src/finance.js";

const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const base = read("../src/data/trip.json");
const extra = read("../src/data/return-branch.json");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const mergeById = (key) => {
  const merged = [...(base[key] || [])];
  const index = new Map(merged.map((item, i) => [item?.id, i]).filter(([id]) => id));
  for (const item of extra[key] || []) {
    const i = item?.id ? index.get(item.id) : undefined;
    if (i != null) merged[i] = { ...merged[i], ...item };
    else { if (item?.id) index.set(item.id, merged.length); merged.push(item); }
  }
  return merged;
};

const merged = {
  ...base,
  trip: { ...(base.trip || {}), ...(extra.trip || {}) },
  finance: { ...(base.finance || {}), ...(extra.finance || {}) },
  members: mergeById("members"),
  expenses: mergeById("expenses"),
  reimbursements: mergeById("reimbursements"),
};

const fund = merged.finance?.groupFund;
const financeMembers = merged.finance?.budgetMemberIds || [];
const financeMemberSet = new Set(financeMembers);
const expenseById = new Map(merged.expenses.map((expense) => [expense.id, expense]));

assert(Boolean(fund), "group fund is missing");
assert(fund?.currency === "INR", "group fund currency must be INR");
assert(Number.isSafeInteger(fund?.targetPerMemberPaise) && fund.targetPerMemberPaise > 0, "group fund target must be positive paise");
assert(JSON.stringify([...(fund?.targetMemberIds || [])].sort()) === JSON.stringify([...financeMembers].sort()), "group fund member set must match finance cohort");
assert(!(fund?.targetMemberIds || []).includes("pratham"), "Pratham must stay outside the group fund");

const contributions = (fund?.contributions || []).filter((item) => item.status === "received");
const credits = (fund?.credits || []).filter((item) => item.status === "applied");
const outflows = (fund?.outflows || []).filter((item) => item.status === "paid");
const cashByMember = Object.fromEntries(financeMembers.map((id) => [id, 0]));
const creditByMember = Object.fromEntries(financeMembers.map((id) => [id, 0]));
const physicalPaidByMember = Object.fromEntries(financeMembers.map((id) => [id, 0]));

for (const item of contributions) {
  const paidBy = item.paidByMemberId || item.memberId;
  assert(financeMemberSet.has(item.memberId), `unknown contribution member ${item.memberId}`);
  assert(financeMemberSet.has(paidBy), `unknown contribution payer ${paidBy}`);
  assert(Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0, `invalid contribution ${item.id}`);
  if (cashByMember[item.memberId] != null) cashByMember[item.memberId] += item.amountPaise;
  if (physicalPaidByMember[paidBy] != null) physicalPaidByMember[paidBy] += item.amountPaise;
}

for (const item of credits) {
  const expense = expenseById.get(item.expenseId);
  assert(financeMemberSet.has(item.memberId), `unknown expense-credit member ${item.memberId}`);
  assert(Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0, `invalid expense credit ${item.id}`);
  assert(Boolean(expense), `expense credit ${item.id} references missing expense`);
  assert(expense?.status === "paid", `expense credit ${item.id} must reference paid expense`);
  assert(expense?.fundingSource === "groupFundMemberCredit", `expense credit ${item.id} funding source mismatch`);
  assert(expense?.groupFundCreditId === item.id, `expense credit ${item.id} backlink mismatch`);
  assert(expense?.amountPaise === item.amountPaise, `expense credit ${item.id} amount mismatch`);
  if (creditByMember[item.memberId] != null) creditByMember[item.memberId] += item.amountPaise;
}

for (const item of outflows) {
  const expense = expenseById.get(item.expenseId);
  assert(Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0, `invalid group-fund outflow ${item.id}`);
  assert(Boolean(expense), `outflow ${item.id} references missing expense`);
  assert(expense?.status === "paid", `outflow ${item.id} must reference paid expense`);
  assert(expense?.fundingSource === "groupFund", `outflow ${item.id} funding source mismatch`);
  assert(expense?.groupFundOutflowId === item.id, `outflow ${item.id} backlink mismatch`);
  assert(expense?.amountPaise === item.amountPaise, `outflow ${item.id} amount mismatch`);
  assert(!expense?.payerId, `group-cash expense ${expense?.id} must not invent a personal payer`);
}

const paidGroupExpenses = merged.expenses.filter((expense) => expense.status === "paid" && expense.fundingSource === "groupFund");
const paidCreditExpenses = merged.expenses.filter((expense) => expense.status === "paid" && expense.fundingSource === "groupFundMemberCredit");
assert(paidGroupExpenses.length === outflows.length, "every paid group-cash expense must have exactly one outflow");
assert(paidCreditExpenses.length === credits.length, "every member-paid pool-credit expense must have exactly one credit");

const collectedPaise = contributions.reduce((sum, item) => sum + item.amountPaise, 0);
const spentPaise = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
const cashBalancePaise = collectedPaise - spentPaise;
assert(cashBalancePaise >= 0, "group cash cannot be negative");
assert(collectedPaise === 1700000, "historical cash received must be ₹17,000 before Jugal's later ₹500 replacement");
assert(spentPaise === 1230000, "historical cash outflows must be ₹12,300 including Jugal ₹100 reimbursement and ₹462 audit control");
assert(cashBalancePaise === 470000, "corrected historical physical group cash checkpoint must remain ₹4,700");

const outstandingByMember = Object.fromEntries(
  financeMembers.map((id) => [id, Math.max(0, fund.targetPerMemberPaise - (cashByMember[id] || 0) - (creditByMember[id] || 0))]),
);
const outstandingPaise = Object.values(outstandingByMember).reduce((sum, amount) => sum + amount, 0);

assert(cashByMember.vyas === 300000, "Vyas cash contribution must remain ₹3,000");
assert(cashByMember.tirth === 300000, "Tirth cash contribution must total ₹3,000");
assert(cashByMember.nishit === 250000, "Nishit cash contribution must total ₹2,500 plus ₹500 direct-expense credits");
assert(cashByMember.milan === 300000, "Milan must remain credited ₹3,000 to the pool");
assert(cashByMember.het === 300000, "Het cash contribution must total ₹3,000");
assert(cashByMember.jugal === 250000, "historical base must show Jugal ₹1,500 + ₹1,000 = ₹2,500 cash before his later ₹500 replacement");
assert(physicalPaidByMember.vyas === 600000, "Vyas must physically fund his own ₹3,000 plus Milan's ₹3,000");
assert(physicalPaidByMember.milan === 0, "Milan must remain physically unpaid to the pool until he repays Vyas");
assert(physicalPaidByMember.nishit === 250000, "Nishit must physically contribute ₹2,500 cash to the pool");
assert(physicalPaidByMember.het === 300000, "Het must physically contribute ₹3,000 cash to the pool");
assert(physicalPaidByMember.jugal === 250000, "historical base Jugal physical cash must be ₹2,500 before replacement");
assert(creditByMember.nishit === 50000, "Nishit direct-expense credits must total ₹500");
assert(creditByMember.jugal === 0, "Jugal must have no contribution credit after his ₹100 auto reimbursement");
for (const id of financeMembers) {
  const expected = id === "jugal" ? 50000 : 0;
  assert(outstandingByMember[id] === expected, `${id} historical pool outstanding mismatch`);
}
assert(outstandingPaise === 50000, "historical base must retain ₹500 Jugal outstanding until live replacement is applied");

const jugalMorning = (fund?.contributions || []).find((item) => item.id === "group-fund-jugal-morning-sep14");
assert(jugalMorning?.amountPaise === 50000 && jugalMorning?.status === "not-received", "Jugal morning ₹500 must be explicitly marked not received");
const jugalSettlement = (fund?.contributions || []).find((item) => item.id === "group-fund-jugal-settlement-sep15");
assert(jugalSettlement?.amountPaise === 100000 && jugalSettlement?.status === "received", "Jugal settlement must be corrected to ₹1,000");
assert(!(fund?.credits || []).some((item) => item.id === "group-fund-credit-jugal-auto-sep14"), "Jugal ₹100 auto credit must be removed after reimbursement");
const jugalAuto = expenseById.get("expense-auto-jugal-sep14");
assert(jugalAuto?.amountPaise === 10000 && !jugalAuto?.payerId, "reimbursed Jugal auto must be represented as old-group cash funding without a final personal payer");
assert(jugalAuto?.fundingSource === "groupFund" && jugalAuto?.groupFundOutflowId === "group-fund-reimburse-jugal-auto-sep14", "Jugal auto must link to the old-pool reimbursement outflow");
assert(jugalAuto?.reimbursedMemberId === "jugal", "Jugal auto reimbursement provenance must retain Jugal as reimbursed member");
const jugalReimbursement = outflows.find((item) => item.id === "group-fund-reimburse-jugal-auto-sep14");
assert(jugalReimbursement?.amountPaise === 10000 && jugalReimbursement?.expenseId === "expense-auto-jugal-sep14", "old pool must contain ₹100 reimbursement outflow to Jugal");
const groupAuto = expenseById.get("expense-auto-90-sep14");
assert(groupAuto?.amountPaise === 9000 && groupAuto?.fundingSource === "groupFund", "₹90 auto must be paid from group cash");
const sep15Water = expenseById.get("expense-water-hotel-sep15");
assert(sep15Water?.amountPaise === 10000 && sep15Water?.fundingSource === "groupFund", "15 Sep hotel water must be ₹100 from group cash");
const sep15TeaCoffee = expenseById.get("expense-tea-coffee-sep15");
assert(sep15TeaCoffee?.amountPaise === 7000 && sep15TeaCoffee?.fundingSource === "groupFund", "15 Sep tea / coffee must total ₹70 from group cash");
const sep15Reconciliation = expenseById.get("expense-cash-reconciliation-sep15");
assert(sep15Reconciliation?.amountPaise === 46200 && sep15Reconciliation?.fundingSource === "groupFund", "15 Sep historical cash reconciliation must retain ₹462 unidentified variance");

const finance = buildFinanceSnapshot(merged, merged.expenses);
const paidTotal = merged.expenses.filter((expense) => expense.status === "paid").reduce((sum, expense) => sum + expense.amountPaise, 0);
assert(finance.recordedPaidPaise === paidTotal, "finance recorded paid total must equal canonical paid expenses");
assert(finance.corePaidPaise === paidTotal, "all current paid expenses must stay in core trip spend");
assert(finance.corePlannedPaise === 0, "planned shared costs must remain ₹0");
assert(finance.settlement.groupFundAdvancePaise === 300000, "Vyas → Milan advance must total ₹3,000");
assert(finance.settlement.netBalancePaise === 0, "settlement conservation failed");
assert(finance.settlement.diagnostics.length === 0, `finance diagnostics: ${finance.settlement.diagnostics.join("; ")}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Historical group account valid: Jugal ₹2,500 cash before live replacement, no Jugal credit, ₹100 reimbursement outflow, ₹${(cashBalancePaise / 100).toFixed(2)} corrected checkpoint cash; ₹${(outstandingPaise / 100).toFixed(2)} Jugal outstanding before replacement`);
