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
const credited = Object.fromEntries(members.map((id) => [id, 0]));
const physical = Object.fromEntries(members.map((id) => [id, 0]));
for (const item of contributions) {
  const paidBy = item.paidByMemberId || item.memberId;
  assert(members.includes(item.memberId), `unknown credited member ${item.memberId}`);
  assert(members.includes(paidBy), `unknown physical payer ${paidBy}`);
  assert(Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0, `invalid contribution ${item.id}`);
  if (credited[item.memberId] != null) credited[item.memberId] += item.amountPaise;
  if (physical[paidBy] != null) physical[paidBy] += item.amountPaise;
}

const expectedCredited = { vyas:300000, milan:300000, tirth:300000, nishit:200000, het:200000, jugal:150000 };
const expectedPhysical = { vyas:600000, milan:0, tirth:300000, nishit:200000, het:200000, jugal:150000 };
for (const [id, amount] of Object.entries(expectedCredited)) assert(credited[id] === amount, `${id} credited ${credited[id]}, expected ${amount}`);
for (const [id, amount] of Object.entries(expectedPhysical)) assert(physical[id] === amount, `${id} physical ${physical[id]}, expected ${amount}`);

const collected = contributions.reduce((sum, item) => sum + item.amountPaise, 0);
const outflows = (fund?.outflows || []).filter((item) => item.status === "paid");
const spent = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
assert(collected === 1450000, `group fund collected ${collected}, expected ₹14,500`);
assert(spent === 800000, `group fund spent ${spent}, expected ₹8,000`);
assert(collected - spent === 650000, "current group cash must be ₹6,500");

const outstanding = Object.fromEntries(members.map((id) => [id, Math.max(0, 300000 - credited[id])]));
assert(outstanding.nishit === 100000, "Nishit must have ₹1,000 outstanding");
assert(outstanding.het === 100000, "Het must have ₹1,000 outstanding");
assert(outstanding.jugal === 150000, "Jugal must have ₹1,500 outstanding");
assert(Object.values(outstanding).reduce((a, b) => a + b, 0) === 350000, "total outstanding must be ₹3,500");

const storage14 = merged.expenses.find((e) => e.id === "expense-storage-sep14");
const storage16 = merged.expenses.find((e) => e.id === "expense-storage-sep16");
assert(storage14?.status === "cancelled", "14→15 storage must be cancelled");
assert(storage16?.status === "cancelled", "16→17 cloak-room storage must be cancelled");
assert(!merged.expenses.some((e) => e.category === "storage" && e.status === "planned"), "no planned cloak-room/storage expense may remain");

const hotel = merged.expenses.find((e) => e.id === "expense-hotel-blue-stone-sep14");
assert(hotel?.amountPaise === 800000 && hotel?.status === "paid", "Hotel Blue Stone expense must be ₹8,000 paid");
assert(hotel?.fundingSource === "groupFund", "hotel must be group-funded");
assert(!hotel?.payerId, "group-funded hotel must not invent a personal payer");

const finance = buildFinanceSnapshot(merged, merged.expenses);
assert(finance.recordedPaidPaise === 1071215, "recorded trip spend must be ₹10,712.15");
assert(finance.corePaidPaise === 1071215, "core trip spend must be ₹10,712.15");
assert(finance.corePlannedPaise === 0, "planned shared costs must be ₹0 after cloak-room removal");
assert(finance.forecastCorePaise === 1071215, "known forecast must equal paid spend after cloak-room removal");
assert(finance.ceilingPaise === 3600000, "six-person planning ceiling must be ₹36,000");
assert(finance.settlement.groupFundAdvancePaise === 300000, "Vyas → Milan advance must total ₹3,000");
assert(finance.settlement.netBalancePaise === 0, "settlement conservation failed");

const expectedNet = { vyas:407075, tirth:-16400, nishit:-16400, milan:-357875, het:-16400, jugal:0, pratham:0 };
for (const [id, amount] of Object.entries(expectedNet)) assert(finance.settlement.rows[id]?.netPaise === amount, `${id} net mismatch`);
const expectedTransfers = [["milan","vyas",357875],["het","vyas",16400],["nishit","vyas",16400],["tirth","vyas",16400]];
const actualTransfers = finance.settlement.transfers.map((t) => [t.from, t.to, t.amountPaise]);
assert(JSON.stringify(actualTransfers) === JSON.stringify(expectedTransfers), `transfer plan mismatch ${JSON.stringify(actualTransfers)}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Group expense account valid: ₹6,500 cash; no planned cloak-room cost; settlement balanced to the paisa");
