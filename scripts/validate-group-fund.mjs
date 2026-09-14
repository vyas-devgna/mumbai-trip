import fs from "node:fs";
import { buildFinanceSnapshot } from "../src/finance.js";

const read = (relative) =>
  JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));

const base = read("../src/data/trip.json");
const extra = read("../src/data/return-branch.json");
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const mergeById = (key) => {
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

const merged = {
  ...base,
  trip: { ...(base.trip || {}), ...(extra.trip || {}) },
  finance: { ...(base.finance || {}), ...(extra.finance || {}) },
  members: mergeById("members"),
  expenses: mergeById("expenses"),
  reimbursements: mergeById("reimbursements"),
};

const expectedMembers = ["het", "jugal", "milan", "nishit", "tirth", "vyas"],
  fund = merged.finance?.groupFund;
assert(Boolean(fund), "group fund is missing");
assert(fund?.currency === "INR", "group fund currency must be INR");
assert(Array.isArray(fund?.contributions), "group fund contributions must be an array");
assert(Array.isArray(fund?.outflows), "group fund outflows must be an array");
assert(fund?.targetPerMemberPaise === 300000, "group fund target must be ₹3,000 per member");
assert(
  [...(fund?.targetMemberIds || [])].sort().join(",") === expectedMembers.join(","),
  "group fund target member set is wrong",
);
assert(
  !(fund?.targetMemberIds || []).includes("pratham"),
  "Pratham must not be included in the shared group fund",
);

const contributions = (fund?.contributions || []).filter(
    (item) => item.status === "received",
  ),
  contributionIds = new Set(),
  creditedByMember = Object.fromEntries(expectedMembers.map((id) => [id, 0])),
  physicallyPaidByMember = Object.fromEntries(expectedMembers.map((id) => [id, 0]));
let collectedPaise = 0;

for (const contribution of contributions) {
  assert(Boolean(contribution.id), "group fund contribution missing id");
  assert(
    !contributionIds.has(contribution.id),
    `duplicate group fund contribution ${contribution.id}`,
  );
  contributionIds.add(contribution.id);
  assert(
    expectedMembers.includes(contribution.memberId),
    `unexpected group fund credited member ${contribution.memberId}`,
  );
  const paidBy = contribution.paidByMemberId || contribution.memberId;
  assert(
    expectedMembers.includes(paidBy),
    `unexpected group fund physical payer ${paidBy}`,
  );
  assert(
    Number.isSafeInteger(contribution.amountPaise) && contribution.amountPaise > 0,
    `invalid group fund amount for ${contribution.memberId}`,
  );
  assert(
    contribution.date === "2026-09-14",
    `unexpected group fund date for ${contribution.memberId}`,
  );
  if (Object.hasOwn(creditedByMember, contribution.memberId))
    creditedByMember[contribution.memberId] += contribution.amountPaise;
  if (Object.hasOwn(physicallyPaidByMember, paidBy))
    physicallyPaidByMember[paidBy] += contribution.amountPaise;
  collectedPaise += contribution.amountPaise;
}

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
for (const [memberId, expectedPaise] of Object.entries(expectedCredited))
  assert(
    creditedByMember[memberId] === expectedPaise,
    `${memberId} credited contribution is ${creditedByMember[memberId]}, expected ${expectedPaise}`,
  );
for (const [memberId, expectedPaise] of Object.entries(expectedPhysical))
  assert(
    physicallyPaidByMember[memberId] === expectedPaise,
    `${memberId} physical contribution is ${physicallyPaidByMember[memberId]}, expected ${expectedPaise}`,
  );
assert(contributions.length === 11, `expected 11 received contribution records, got ${contributions.length}`);
assert(collectedPaise === 1450000, `group fund collected ${collectedPaise}, expected 1450000`);

const milanMorningAdvance = contributions.find(
    (item) => item.id === "group-fund-milan-morning-sep14",
  ),
  milanTopupAdvance = contributions.find(
    (item) => item.id === "group-fund-milan-topup-sep14",
  );
assert(milanMorningAdvance?.memberId === "milan", "Milan morning ₹1,000 credit is missing");
assert(milanMorningAdvance?.paidByMemberId === "vyas", "Milan morning ₹1,000 must be physically funded by Vyas");
assert(milanMorningAdvance?.amountPaise === 100000, "Milan morning advance must be ₹1,000");
assert(milanTopupAdvance?.memberId === "milan", "Milan ₹2,000 top-up credit is missing");
assert(milanTopupAdvance?.paidByMemberId === "vyas", "Milan ₹2,000 top-up must be physically funded by Vyas");
assert(milanTopupAdvance?.amountPaise === 200000, "Milan top-up advance must be ₹2,000");
assert(
  milanMorningAdvance.amountPaise + milanTopupAdvance.amountPaise === 300000,
  "Vyas must have funded Milan's full ₹3,000 group contribution",
);

const outstandingByMember = Object.fromEntries(
  expectedMembers.map((memberId) => [
    memberId,
    Math.max(0, fund.targetPerMemberPaise - creditedByMember[memberId]),
  ]),
);
assert(outstandingByMember.vyas === 0, "Vyas group-fund target should be fully funded");
assert(outstandingByMember.milan === 0, "Milan group-fund target should be fully credited");
assert(outstandingByMember.tirth === 0, "Tirth group-fund target should be fully funded");
assert(outstandingByMember.nishit === 100000, "Nishit must have ₹1,000 outstanding");
assert(outstandingByMember.het === 100000, "Het must have ₹1,000 outstanding");
assert(outstandingByMember.jugal === 150000, "Jugal must have ₹1,500 outstanding");
assert(
  Object.values(outstandingByMember).reduce((sum, value) => sum + value, 0) === 350000,
  "total group-fund outstanding must be ₹3,500",
);

const paidOutflows = (fund?.outflows || []).filter((item) => item.status === "paid");
const spentPaise = paidOutflows.reduce((sum, item) => {
  assert(
    Boolean(item.id) && Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0,
    `invalid group fund outflow ${item.id || "unknown"}`,
  );
  return sum + (Number.isSafeInteger(item.amountPaise) ? item.amountPaise : 0);
}, 0);
assert(paidOutflows.length === 1, `expected one paid group-fund outflow, got ${paidOutflows.length}`);
assert(spentPaise === 800000, `group fund spent ${spentPaise}, expected 800000`);
assert(collectedPaise - spentPaise === 650000, "current group cash must be ₹6,500");

const hotelExpense = merged.expenses.find(
  (expense) => expense.id === "expense-hotel-blue-stone-sep14",
);
assert(Boolean(hotelExpense), "Hotel Blue Stone expense is missing");
assert(hotelExpense?.amountPaise === 800000, "Hotel Blue Stone expense must be ₹8,000");
assert(hotelExpense?.status === "paid", "Hotel Blue Stone expense must be paid");
assert(hotelExpense?.fundingSource === "groupFund", "hotel must be marked as group-funded");
assert(!hotelExpense?.payerId, "group-funded hotel must not invent a personal payer");
assert(
  [...(hotelExpense?.participantIds || [])].sort().join(",") === expectedMembers.join(","),
  "Hotel Blue Stone room participant set is wrong",
);
assert(
  paidOutflows[0]?.expenseId === hotelExpense?.id &&
    paidOutflows[0]?.amountPaise === hotelExpense?.amountPaise,
  "hotel expense and group-fund outflow do not reconcile",
);

const finance = buildFinanceSnapshot(merged, merged.expenses);
assert(finance.recordedPaidPaise === 1071215, "recorded trip spend must be ₹10,712.15");
assert(finance.corePaidPaise === 1071215, "core trip spend must be ₹10,712.15");
assert(finance.corePlannedPaise === 20000, "remaining planned shared costs must be ₹200");
assert(finance.forecastCorePaise === 1091215, "known forecast must be ₹10,912.15");
assert(finance.ceilingPaise === 3600000, "six-person planning ceiling must be ₹36,000");
assert(finance.settlement.netBalancePaise === 0, "settlement conservation failed");
assert(finance.settlement.merchantPaidPaise === 271215, "personally funded merchant costs must remain ₹2,712.15");
assert(finance.settlement.allocatedSharePaise === 271215, "personal settlement shares must remain ₹2,712.15");
assert(finance.settlement.groupFundAdvancePaise === 300000, "member advance total must be ₹3,000");

const expectedNet = {
  vyas: 407075,
  tirth: -16400,
  nishit: -16400,
  milan: -357875,
  het: -16400,
  jugal: 0,
  pratham: 0,
};
for (const [memberId, amountPaise] of Object.entries(expectedNet))
  assert(
    finance.settlement.rows[memberId]?.netPaise === amountPaise,
    `unexpected ${memberId} settlement: ${finance.settlement.rows[memberId]?.netPaise}, expected ${amountPaise}`,
  );

const expectedTransfers = [
  ["milan", "vyas", 357875],
  ["het", "vyas", 16400],
  ["nishit", "vyas", 16400],
  ["tirth", "vyas", 16400],
];
const actualTransfers = finance.settlement.transfers.map((item) => [
  item.from,
  item.to,
  item.amountPaise,
]);
assert(
  JSON.stringify(actualTransfers) === JSON.stringify(expectedTransfers),
  `unexpected transfer plan ${JSON.stringify(actualTransfers)}`,
);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Group expense account valid: ₹14,500 collected − ₹8,000 hotel = ₹6,500 cash; ₹3,500 outstanding; Vyas funded Milan's full ₹3,000 contribution",
);
