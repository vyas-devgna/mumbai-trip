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

const members = ["het", "jugal", "milan", "nishit", "tirth", "vyas"];
const fund = merged.finance?.groupFund;
assert(Boolean(fund), "group fund is missing");
assert(fund?.currency === "INR", "group fund currency must be INR");
assert(fund?.targetPerMemberPaise === 300000, "group fund target must be ₹3,000 per member");
assert([...(fund?.targetMemberIds || [])].sort().join(",") === members.join(","), "group fund member set mismatch");
assert(!(fund?.targetMemberIds || []).includes("pratham"), "Pratham must stay outside the group fund");

const contributions = (fund?.contributions || []).filter((item) => item.status === "received");
const creditedCash = Object.fromEntries(members.map((id) => [id, 0]));
const physical = Object.fromEntries(members.map((id) => [id, 0]));
for (const item of contributions) {
  const paidBy = item.paidByMemberId || item.memberId;
  assert(members.includes(item.memberId), `unknown credited member ${item.memberId}`);
  assert(members.includes(paidBy), `unknown physical payer ${paidBy}`);
  assert(Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0, `invalid contribution ${item.id}`);
  if (creditedCash[item.memberId] != null) creditedCash[item.memberId] += item.amountPaise;
  if (physical[paidBy] != null) physical[paidBy] += item.amountPaise;
}

const expectedCreditedCash = { vyas:300000, milan:300000, tirth:300000, nishit:200000, het:200000, jugal:150000 };
const expectedPhysical = { vyas:600000, milan:0, tirth:300000, nishit:200000, het:200000, jugal:150000 };
for (const [id, amount] of Object.entries(expectedCreditedCash)) assert(creditedCash[id] === amount, `${id} cash credited ${creditedCash[id]}, expected ${amount}`);
for (const [id, amount] of Object.entries(expectedPhysical)) assert(physical[id] === amount, `${id} physical ${physical[id]}, expected ${amount}`);

const credits = (fund?.credits || []).filter((item) => item.status === "applied");
const expenseCredit = Object.fromEntries(members.map((id) => [id, 0]));
for (const item of credits) {
  assert(members.includes(item.memberId), `unknown expense-credit member ${item.memberId}`);
  assert(Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0, `invalid expense credit ${item.id}`);
  assert(Boolean(item.expenseId), `expense credit ${item.id} must reference an expense`);
  if (expenseCredit[item.memberId] != null) expenseCredit[item.memberId] += item.amountPaise;
}
assert(credits.length === 1, "exactly one direct-expense pool credit is expected");
assert(expenseCredit.nishit === 44000, "Nishit must have a ₹440 direct-expense credit");
assert(Object.entries(expenseCredit).filter(([id]) => id !== "nishit").every(([, amount]) => amount === 0), "only Nishit should have a direct-expense credit");

const collected = contributions.reduce((sum, item) => sum + item.amountPaise, 0);
const creditTotal = credits.reduce((sum, item) => sum + item.amountPaise, 0);
const outflows = (fund?.outflows || []).filter((item) => item.status === "paid");
const spent = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
assert(collected === 1450000, `cash collected ${collected}, expected ₹14,500`);
assert(creditTotal === 44000, `expense credits ${creditTotal}, expected ₹440`);
assert(spent === 810000, `group cash spent ${spent}, expected ₹8,100`);
assert(collected - spent === 640000, "current group cash must be ₹6,400");

const outstanding = Object.fromEntries(
  members.map((id) => [
    id,
    Math.max(0, 300000 - creditedCash[id] - expenseCredit[id]),
  ]),
);
assert(outstanding.nishit === 56000, "Nishit must have ₹560 outstanding after the ₹440 Uber credit");
assert(outstanding.het === 100000, "Het must have ₹1,000 outstanding");
assert(outstanding.jugal === 150000, "Jugal must have ₹1,500 outstanding");
assert(Object.values(outstanding).reduce((a, b) => a + b, 0) === 306000, "total outstanding must be ₹3,060");

const storage14 = merged.expenses.find((e) => e.id === "expense-storage-sep14");
const storage16 = merged.expenses.find((e) => e.id === "expense-storage-sep16");
assert(storage14?.status === "cancelled", "14→15 storage must be cancelled");
assert(storage16?.status === "cancelled", "16→17 cloak-room storage must be cancelled");
assert(!merged.expenses.some((e) => e.category === "storage" && e.status === "planned"), "no planned cloak-room/storage expense may remain");

const hotel = merged.expenses.find((e) => e.id === "expense-hotel-blue-stone-sep14");
assert(hotel?.amountPaise === 800000 && hotel?.status === "paid", "Hotel Blue Stone expense must be ₹8,000 paid");
assert(hotel?.fundingSource === "groupFund", "hotel must be group-funded");
assert(!hotel?.payerId, "group-funded hotel must not invent a personal payer");

const uber = merged.expenses.find((e) => e.id === "expense-uber-siddhivinayak-sep14");
const uberCredit = credits.find((e) => e.id === "group-fund-credit-nishit-uber-sep14");
assert(uber?.amountPaise === 44000 && uber?.status === "paid", "Uber must be recorded as ₹440 paid");
assert(uber?.payerId === "nishit", "Uber must be paid by Nishit");
assert(uber?.fundingSource === "groupFundMemberCredit", "Uber must be a member-paid pool credit expense");
assert(uber?.groupFundCreditId === uberCredit?.id, "Uber expense must link to Nishit's pool credit");
assert(uberCredit?.amountPaise === 44000 && uberCredit?.expenseId === uber?.id, "Uber pool credit mismatch");
assert(!outflows.some((e) => e.expenseId === uber?.id), "Uber must not reduce shared cash because Nishit paid it directly");

const snacks = merged.expenses.find((e) => e.id === "expense-snacks-sep14");
const snacksOutflow = outflows.find((e) => e.id === "group-fund-snacks-sep14");
assert(snacks?.amountPaise === 10000 && snacks?.status === "paid", "snacks must be recorded as ₹100 paid");
assert(snacks?.fundingSource === "groupFund" && !snacks?.payerId, "snacks must be paid from shared cash");
assert(snacksOutflow?.amountPaise === 10000 && snacksOutflow?.expenseId === snacks?.id, "snacks group-fund outflow mismatch");

const groupFundExpenses = merged.expenses.filter((e) => e.status === "paid" && e.fundingSource === "groupFund");
const groupFundExpenseTotal = groupFundExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
assert(groupFundExpenseTotal === spent, `group-cash expense/outflow mismatch ${groupFundExpenseTotal} vs ${spent}`);
const memberCreditExpenses = merged.expenses.filter((e) => e.status === "paid" && e.fundingSource === "groupFundMemberCredit");
const memberCreditExpenseTotal = memberCreditExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
assert(memberCreditExpenseTotal === creditTotal, `member credit/expense mismatch ${memberCreditExpenseTotal} vs ${creditTotal}`);

const finance = buildFinanceSnapshot(merged, merged.expenses);
assert(finance.recordedPaidPaise === 1125215, "recorded trip spend must be ₹11,252.15");
assert(finance.corePaidPaise === 1125215, "core trip spend must be ₹11,252.15");
assert(finance.corePlannedPaise === 0, "planned shared costs must be ₹0 after cloak-room removal");
assert(finance.forecastCorePaise === 1125215, "known forecast must equal paid spend including corrected Uber and snacks");
assert(finance.ceilingPaise === 3600000, "six-person planning ceiling must be ₹36,000");
assert(finance.settlement.groupFundAdvancePaise === 300000, "Vyas → Milan advance must total ₹3,000");
assert(finance.settlement.netBalancePaise === 0, "settlement conservation failed");

const expectedNet = { vyas:407075, tirth:-16400, nishit:-16400, milan:-357875, het:-16400, jugal:0, pratham:0 };
for (const [id, amount] of Object.entries(expectedNet)) assert(finance.settlement.rows[id]?.netPaise === amount, `${id} net mismatch`);
const expectedTransfers = [["milan","vyas",357875],["het","vyas",16400],["nishit","vyas",16400],["tirth","vyas",16400]];
const actualTransfers = finance.settlement.transfers.map((t) => [t.from, t.to, t.amountPaise]);
assert(JSON.stringify(actualTransfers) === JSON.stringify(expectedTransfers), `transfer plan mismatch ${JSON.stringify(actualTransfers)}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Group expense account valid: ₹6,400 cash; ₹3,060 outstanding; Nishit has ₹440 Uber credit; settlement balanced");
