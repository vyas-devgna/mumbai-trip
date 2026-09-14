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
assert(credits.length === 4, `expected 4 direct-expense credits, found ${credits.length}`);
assert(expenseCredit.nishit === 50000, "Nishit must have ₹500 total direct-expense credit: ₹440 Uber + ₹60 auto");
assert(expenseCredit.vyas === 1000, "Vyas must have ₹10 direct-expense credit for auto 2");
assert(expenseCredit.tirth === 5000, "Tirth must have ₹50 direct-expense credit for auto 2");
assert(expenseCredit.milan === 0 && expenseCredit.het === 0 && expenseCredit.jugal === 0, "unexpected direct-expense credit");

const collected = contributions.reduce((sum, item) => sum + item.amountPaise, 0);
const creditTotal = credits.reduce((sum, item) => sum + item.amountPaise, 0);
const outflows = (fund?.outflows || []).filter((item) => item.status === "paid");
const spent = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
assert(collected === 1450000, `cash collected ${collected}, expected ₹14,500`);
assert(creditTotal === 56000, `direct-expense credits ${creditTotal}, expected ₹560`);
assert(spent === 819000, `group cash spent ${spent}, expected ₹8,190`);
assert(collected - spent === 631000, "current group cash must be ₹6,310");

const outstanding = Object.fromEntries(
  members.map((id) => [
    id,
    Math.max(0, 300000 - creditedCash[id] - expenseCredit[id]),
  ]),
);
assert(outstanding.nishit === 50000, "Nishit must have ₹500 outstanding after Uber + auto credits");
assert(outstanding.het === 100000, "Het must have ₹1,000 outstanding");
assert(outstanding.jugal === 150000, "Jugal must have ₹1,500 outstanding");
assert(outstanding.vyas === 0 && outstanding.tirth === 0 && outstanding.milan === 0, "fully funded members must not show pool dues");
assert(Object.values(outstanding).reduce((a, b) => a + b, 0) === 300000, "total outstanding must be ₹3,000");

const overCredit = Object.fromEntries(
  members.map((id) => [id, Math.max(0, creditedCash[id] + expenseCredit[id] - 300000)]),
);
assert(overCredit.vyas === 1000, "Vyas must be ₹10 over target from auto 2 direct spend");
assert(overCredit.tirth === 5000, "Tirth must be ₹50 over target from auto 2 direct spend");
assert(Object.values(overCredit).reduce((a, b) => a + b, 0) === 6000, "extra direct spend beyond completed targets must total ₹60");

const storage14 = merged.expenses.find((e) => e.id === "expense-storage-sep14");
const storage16 = merged.expenses.find((e) => e.id === "expense-storage-sep16");
assert(storage14?.status === "cancelled", "14→15 storage must be cancelled");
assert(storage16?.status === "cancelled", "16→17 cloak-room storage must be cancelled");
assert(!merged.expenses.some((e) => e.category === "storage" && e.status === "planned"), "no planned cloak-room/storage expense may remain");

const hotel = merged.expenses.find((e) => e.id === "expense-hotel-blue-stone-sep14");
assert(hotel?.amountPaise === 800000 && hotel?.status === "paid", "Hotel Blue Stone expense must be ₹8,000 paid");
assert(hotel?.fundingSource === "groupFund" && !hotel?.payerId, "hotel must be group-funded without a personal payer");

const uber = merged.expenses.find((e) => e.id === "expense-uber-siddhivinayak-sep14");
const uberCredit = credits.find((e) => e.id === "group-fund-credit-nishit-uber-sep14");
assert(uber?.amountPaise === 44000 && uber?.payerId === "nishit", "Uber must be ₹440 paid by Nishit");
assert(uber?.fundingSource === "groupFundMemberCredit" && uber?.groupFundCreditId === uberCredit?.id, "Uber pool-credit link mismatch");
assert(uberCredit?.amountPaise === 44000 && uberCredit?.expenseId === uber?.id, "Uber pool credit mismatch");
assert(!outflows.some((e) => e.expenseId === uber?.id), "Nishit-paid Uber must not reduce group cash");

const auto1 = merged.expenses.find((e) => e.id === "expense-auto-1-sep14");
assert(auto1?.amountPaise === 6000 && auto1?.payerId === "nishit", "auto 1 must be ₹60 paid by Nishit");
assert(auto1?.fundingSource === "groupFundMemberCredit", "auto 1 must be a direct group-account credit");

const auto2Vyas = merged.expenses.find((e) => e.id === "expense-auto-2-vyas-part-sep14");
const auto2Tirth = merged.expenses.find((e) => e.id === "expense-auto-2-tirth-part-sep14");
assert(auto2Vyas?.amountPaise === 1000 && auto2Vyas?.payerId === "vyas", "auto 2 Vyas part must be ₹10");
assert(auto2Tirth?.amountPaise === 5000 && auto2Tirth?.payerId === "tirth", "auto 2 Tirth part must be ₹50");
assert(auto2Vyas?.transactionGroupId === "auto-2-sep14" && auto2Tirth?.transactionGroupId === "auto-2-sep14", "auto 2 split must stay linked");
assert(auto2Vyas.amountPaise + auto2Tirth.amountPaise === 6000, "auto 2 total must be ₹60");

const snacks = merged.expenses.find((e) => e.id === "expense-snacks-sep14");
assert(snacks?.amountPaise === 10000 && snacks?.fundingSource === "groupFund", "snacks must be ₹100 from group cash");

const localTrain = merged.expenses.find((e) => e.id === "expense-local-train-sep14");
const localTrainOutflow = outflows.find((e) => e.id === "group-fund-local-train-sep14");
assert(localTrain?.amountPaise === 9000 && localTrain?.status === "paid", "local train must be recorded as ₹90 paid");
assert(localTrain?.fundingSource === "groupFund" && !localTrain?.payerId, "local train must be a group-cash expense");
assert(localTrainOutflow?.amountPaise === 9000 && localTrainOutflow?.expenseId === localTrain?.id, "local train group-fund outflow mismatch");

const groupFundExpenses = merged.expenses.filter((e) => e.status === "paid" && e.fundingSource === "groupFund");
const groupFundExpenseTotal = groupFundExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
assert(groupFundExpenseTotal === spent, `group-cash expense/outflow mismatch ${groupFundExpenseTotal} vs ${spent}`);
const memberCreditExpenses = merged.expenses.filter((e) => e.status === "paid" && e.fundingSource === "groupFundMemberCredit");
const memberCreditExpenseTotal = memberCreditExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
assert(memberCreditExpenseTotal === creditTotal, `member credit/expense mismatch ${memberCreditExpenseTotal} vs ${creditTotal}`);

const finance = buildFinanceSnapshot(merged, merged.expenses);
assert(finance.recordedPaidPaise === 1146215, "recorded trip spend must be ₹11,462.15");
assert(finance.corePaidPaise === 1146215, "core trip spend must be ₹11,462.15");
assert(finance.corePlannedPaise === 0, "planned shared costs must be ₹0 after cloak-room removal");
assert(finance.forecastCorePaise === 1146215, "known forecast must equal paid spend after autos and local train");
assert(finance.ceilingPaise === 3600000, "six-person planning ceiling must be ₹36,000");
assert(finance.settlement.groupFundAdvancePaise === 300000, "Vyas → Milan advance must total ₹3,000");
assert(finance.settlement.netBalancePaise === 0, "settlement conservation failed");

const expectedNet = { vyas:407075, tirth:-16400, nishit:-16400, milan:-357875, het:-16400, jugal:0, pratham:0 };
for (const [id, amount] of Object.entries(expectedNet)) assert(finance.settlement.rows[id]?.netPaise === amount, `${id} net mismatch`);
const expectedTransfers = [["milan","vyas",357875],["het","vyas",16400],["nishit","vyas",16400],["tirth","vyas",16400]];
const actualTransfers = finance.settlement.transfers.map((t) => [t.from, t.to, t.amountPaise]);
assert(JSON.stringify(actualTransfers) === JSON.stringify(expectedTransfers), `transfer plan mismatch ${JSON.stringify(actualTransfers)}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Group expense account valid: ₹6,310 cash; ₹3,000 outstanding; autos + local train reconciled; settlement balanced");
