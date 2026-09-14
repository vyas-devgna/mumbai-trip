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

const outstandingByMember = Object.fromEntries(
  financeMembers.map((id) => [id, Math.max(0, fund.targetPerMemberPaise - (cashByMember[id] || 0) - (creditByMember[id] || 0))]),
);
const outstandingPaise = Object.values(outstandingByMember).reduce((sum, amount) => sum + amount, 0);

assert(cashByMember.vyas === 300000, "Vyas cash contribution must remain ₹3,000");
assert(cashByMember.milan === 300000, "Milan must remain credited ₹3,000 to the pool");
assert(cashByMember.jugal === 200000, "Jugal cash contribution must total ₹2,000 after backfilled ₹500 morning payment");
assert(physicalPaidByMember.vyas === 600000, "Vyas must physically fund his own ₹3,000 plus Milan's ₹3,000");
assert(physicalPaidByMember.milan === 0, "Milan must remain physically unpaid to the pool until he repays Vyas");
assert(physicalPaidByMember.jugal === 200000, "Jugal must physically contribute ₹2,000 cash to the pool");
assert(creditByMember.nishit === 50000, "Nishit direct-expense credits must total ₹500");
assert(creditByMember.jugal === 10000, "Jugal direct-expense credit must be ₹100");
assert(outstandingByMember.nishit === 50000, "Nishit pool outstanding must be ₹500");
assert(outstandingByMember.het === 100000, "Het pool outstanding must be ₹1,000");
assert(outstandingByMember.jugal === 90000, "Jugal pool outstanding must be ₹900 after ₹2,000 cash + ₹100 auto credit");
assert(outstandingPaise === 240000, "total pool outstanding must be ₹2,400");

const jugalAuto = expenseById.get("expense-auto-jugal-sep14");
assert(jugalAuto?.amountPaise === 10000 && jugalAuto?.payerId === "jugal", "Jugal auto must be ₹100 paid by Jugal");
assert(jugalAuto?.fundingSource === "groupFundMemberCredit", "Jugal auto must reduce his pool outstanding");
const groupAuto = expenseById.get("expense-auto-90-sep14");
assert(groupAuto?.amountPaise === 9000 && groupAuto?.fundingSource === "groupFund", "₹90 auto must be paid from group cash");

const finance = buildFinanceSnapshot(merged, merged.expenses);
const paidTotal = merged.expenses.filter((expense) => expense.status === "paid").reduce((sum, expense) => sum + expense.amountPaise, 0);
assert(finance.recordedPaidPaise === paidTotal, "finance recorded paid total must equal canonical paid expenses");
assert(finance.corePaidPaise === paidTotal, "all current paid expenses must stay in core trip spend");
assert(finance.corePlannedPaise === 0, "planned shared costs must remain ₹0");
assert(finance.settlement.groupFundAdvancePaise === 300000, "Vyas → Milan advance must total ₹3,000");
assert(finance.settlement.netBalancePaise === 0, "settlement conservation failed");
assert(finance.settlement.diagnostics.length === 0, `finance diagnostics: ${finance.settlement.diagnostics.join("; ")}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Group expense account valid: ₹${(cashBalancePaise / 100).toFixed(2)} cash; ₹${(outstandingPaise / 100).toFixed(2)} outstanding; ₹${(finance.recordedPaidPaise / 100).toFixed(2)} trip spend; ledger balanced`);
