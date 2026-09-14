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

const merged = {
  ...base,
  finance: { ...(base.finance || {}), ...(extra.finance || {}) },
  members: [...(base.members || []), ...(extra.members || [])],
  expenses: [...(base.expenses || []), ...(extra.expenses || [])],
  reimbursements: [
    ...(base.reimbursements || []),
    ...(extra.reimbursements || []),
  ],
};

const expectedMembers = ["het", "milan", "nishit", "tirth", "vyas"];
const fund = merged.finance?.groupFund;
assert(Boolean(fund), "group fund is missing");
assert(fund?.currency === "INR", "group fund currency must be INR");
assert(Array.isArray(fund?.contributions), "group fund contributions must be an array");
assert(Array.isArray(fund?.outflows), "group fund outflows must be an array");

const contributions = (fund?.contributions || []).filter(
  (item) => item.status === "received",
);
const contributionIds = new Set();
const contributedByMember = Object.fromEntries(expectedMembers.map((id) => [id, 0]));
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
    `unexpected group fund member ${contribution.memberId}`,
  );
  assert(
    Number.isSafeInteger(contribution.amountPaise) && contribution.amountPaise > 0,
    `invalid group fund amount for ${contribution.memberId}`,
  );
  assert(
    contribution.date === "2026-09-14",
    `unexpected group fund date for ${contribution.memberId}`,
  );
  if (Object.hasOwn(contributedByMember, contribution.memberId))
    contributedByMember[contribution.memberId] += contribution.amountPaise;
  collectedPaise += contribution.amountPaise;
}

assert(contributions.length === 5, `expected 5 received contributions, got ${contributions.length}`);
for (const memberId of expectedMembers)
  assert(
    contributedByMember[memberId] === 100000,
    `${memberId} contribution is ${contributedByMember[memberId]}, expected 100000`,
  );
assert(
  !(fund?.contributions || []).some((item) => item.memberId === "pratham"),
  "Pratham must not be included in the shared group fund",
);
assert(collectedPaise === 500000, `group fund collected ${collectedPaise}, expected 500000`);

const spentPaise = (fund?.outflows || [])
  .filter((item) => item.status === "paid")
  .reduce((sum, item) => {
    assert(
      Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0,
      `invalid group fund outflow ${item.id || "unknown"}`,
    );
    return sum + (Number.isSafeInteger(item.amountPaise) ? item.amountPaise : 0);
  }, 0);
assert(spentPaise === 0, `group fund spent ${spentPaise}, expected 0 at initialization`);
assert(collectedPaise - spentPaise === 500000, "group fund opening balance must be ₹5,000");

// Contributions are internal cash pooling, not merchant spend and not settlement.
const finance = buildFinanceSnapshot(merged, merged.expenses);
assert(finance.recordedPaidPaise === 271215, "group fund incorrectly changed recorded trip spend");
assert(finance.corePaidPaise === 271215, "group fund incorrectly changed core trip spend");
assert(finance.settlement.netBalancePaise === 0, "group fund broke settlement conservation");
const expectedNet = {
  vyas: 107075,
  tirth: -16400,
  nishit: -16400,
  milan: -57875,
  het: -16400,
  pratham: 0,
};
for (const [memberId, amountPaise] of Object.entries(expectedNet))
  assert(
    finance.settlement.rows[memberId]?.netPaise === amountPaise,
    `group fund changed ${memberId} settlement`,
  );

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Group fund valid: ₹1,000 × 5 = ₹5,000 pooled, settlement unchanged");
