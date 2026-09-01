import fs from "node:fs";

const path = new URL("../src/data/trip.json", import.meta.url);
const d = JSON.parse(fs.readFileSync(path, "utf8"));
const errors = [];

const splitPaise = (totalPaise, n) => {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) return [];
  if (!Number.isSafeInteger(n) || n <= 0) return [];
  const divisor = BigInt(n),
    exactTotal = BigInt(totalPaise),
    base = Number(exactTotal / divisor),
    remainder = Number(exactTotal % divisor);
  return Array.from({ length: n }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
};

const isPositivePaise = (value) =>
  Number.isSafeInteger(value) && value > 0;

const uniq = (arr = [], label) => {
  const set = new Set();
  for (const item of arr) {
    if (!item?.id) errors.push(`${label}: missing id`);
    else if (set.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    else set.add(item.id);
  }
  return set;
};

const members = uniq(d.members, "member");
const places = uniq(d.places, "place");
const resources = uniq(d.resources, "resource");
const activities = uniq(d.activities, "activity");
const fallbacks = uniq(d.fallbacks, "fallback");
uniq(d.travelLegs, "travel leg");
uniq(d.branches, "branch");
uniq(d.checkpoints, "checkpoint");
uniq(d.candidates, "candidate");
uniq(d.expenses, "expense");
uniq(d.reimbursements, "reimbursement");
uniq(d.signals, "signal");

if (d.trip?.moneyModel?.unit !== "paise")
  errors.push("trip money model: unit must be paise");
if (!Number.isSafeInteger(d.trip?.budget?.targetPerPersonPaise))
  errors.push("trip budget: targetPerPersonPaise must be integer paise");
if (Object.prototype.hasOwnProperty.call(d.trip?.budget || {}, "targetPerPerson"))
  errors.push("trip budget: legacy targetPerPerson field is not allowed");

for (const a of d.activities ?? []) {
  if (a.placeId && !places.has(a.placeId))
    errors.push(`activity ${a.id}: unknown place ${a.placeId}`);
  for (const p of a.participants ?? [])
    if (!members.has(p))
      errors.push(`activity ${a.id}: unknown participant ${p}`);
  for (const r of a.sourceIds ?? [])
    if (!resources.has(r)) errors.push(`activity ${a.id}: unknown source ${r}`);
  for (const f of a.fallbackIds ?? [])
    if (!fallbacks.has(f))
      errors.push(`activity ${a.id}: unknown fallback ${f}`);
  if (a.date < d.trip.startDate || a.date > d.trip.endDate)
    errors.push(`activity ${a.id}: outside trip dates`);
  if (!["fixed", "target", "window", "floating"].includes(a.timing?.type))
    errors.push(`activity ${a.id}: invalid timing type`);
  if (a.timing?.type === "fixed" && !a.timing.start)
    errors.push(`activity ${a.id}: fixed timing missing start`);
  if (a.timing?.type === "window" && (!a.timing.earliest || !a.timing.latest))
    errors.push(`activity ${a.id}: window timing incomplete`);
  for (const key of ["minMinutes", "targetMinutes", "maxMinutes"])
    if (!(a.duration?.[key] > 0))
      errors.push(`activity ${a.id}: invalid duration ${key}`);
  if (
    a.duration &&
    !(
      a.duration.minMinutes <= a.duration.targetMinutes &&
      a.duration.targetMinutes <= a.duration.maxMinutes
    )
  )
    errors.push(`activity ${a.id}: duration range is not monotonic`);
}

for (const p of d.places ?? []) {
  if (
    (p.latitude != null && (p.latitude < -90 || p.latitude > 90)) ||
    (p.longitude != null && (p.longitude < -180 || p.longitude > 180))
  )
    errors.push(`place ${p.id}: malformed coordinates`);
}

for (const l of d.travelLegs ?? []) {
  if (!places.has(l.fromPlaceId) || !places.has(l.toPlaceId))
    errors.push(`travel leg ${l.id}: broken place reference`);
}

const ledger = Object.fromEntries(
    [...members].map((memberId) => [
      memberId,
      { paidPaise: 0, sharePaise: 0 },
    ]),
  ),
  settlementGroups = new Map();

for (const e of d.expenses ?? []) {
  if (!isPositivePaise(e.amountPaise))
    errors.push(`expense ${e.id}: amountPaise must be positive integer paise`);
  if (Object.prototype.hasOwnProperty.call(e, "amount"))
    errors.push(`expense ${e.id}: legacy amount field is not allowed`);
  if (!e.payerId) errors.push(`expense ${e.id}: missing payerId`);
  else if (!members.has(e.payerId))
    errors.push(`expense ${e.id}: unknown payer ${e.payerId}`);
  if (!(e.participantIds?.length > 0))
    errors.push(`expense ${e.id}: missing participants`);
  for (const p of e.participantIds ?? [])
    if (!members.has(p))
      errors.push(`expense ${e.id}: unknown participant ${p}`);
  if (new Set(e.participantIds || []).size !== (e.participantIds || []).length)
    errors.push(`expense ${e.id}: duplicate participant`);
  if (e.sourceId && !resources.has(e.sourceId))
    errors.push(`expense ${e.id}: unknown source ${e.sourceId}`);

  const participantIds = [...new Set(e.participantIds || [])]
    .filter((memberId) => members.has(memberId))
    .sort();
  if (isPositivePaise(e.amountPaise) && participantIds.length) {
    const shares = splitPaise(e.amountPaise, participantIds.length),
      shareTotal = shares.reduce((sum, sharePaise) => sum + sharePaise, 0);
    if (shareTotal !== e.amountPaise)
      errors.push(
        `expense ${e.id}: member shares ${shareTotal} do not equal ${e.amountPaise} paise`,
      );

    const groupId = e.settlementGroupId || e.id,
      signature = `${e.payerId || ""}|${participantIds.join(",")}`,
      current = settlementGroups.get(groupId);
    if (current && current.signature !== signature) {
      errors.push(
        `settlement group ${groupId}: payer and participants must match`,
      );
    } else {
      settlementGroups.set(groupId, {
        signature,
        payerId: e.payerId,
        participantIds,
        amountPaise: (current?.amountPaise || 0) + e.amountPaise,
      });
    }
  }
}

for (const [groupId, group] of settlementGroups) {
  if (!members.has(group.payerId) || !group.participantIds.length) continue;
  ledger[group.payerId].paidPaise += group.amountPaise;
  const shares = splitPaise(group.amountPaise, group.participantIds.length);
  if (shares.reduce((sum, share) => sum + share, 0) !== group.amountPaise)
    errors.push(`settlement group ${groupId}: shares do not balance`);
  group.participantIds.forEach((memberId, index) => {
    ledger[memberId].sharePaise += shares[index];
  });
}

for (const payment of d.reimbursements ?? []) {
  if (!isPositivePaise(payment.amountPaise))
    errors.push(
      `reimbursement ${payment.id}: amountPaise must be positive integer paise`,
    );
  if (Object.prototype.hasOwnProperty.call(payment, "amount"))
    errors.push(`reimbursement ${payment.id}: legacy amount field is not allowed`);
  if (!members.has(payment.fromMemberId))
    errors.push(
      `reimbursement ${payment.id}: unknown payer ${payment.fromMemberId}`,
    );
  if (!members.has(payment.toMemberId))
    errors.push(
      `reimbursement ${payment.id}: unknown recipient ${payment.toMemberId}`,
    );
  if (!(payment.coversMemberIds?.length > 0))
    errors.push(`reimbursement ${payment.id}: missing covered members`);
  for (const memberId of payment.coversMemberIds ?? [])
    if (!members.has(memberId))
      errors.push(
        `reimbursement ${payment.id}: unknown covered member ${memberId}`,
      );
  if (
    new Set(payment.coversMemberIds || []).size !==
    (payment.coversMemberIds || []).length
  )
    errors.push(`reimbursement ${payment.id}: duplicate covered member`);

  const coveredMemberIds = [...new Set(payment.coversMemberIds || [])]
    .filter((memberId) => members.has(memberId))
    .sort();
  if (
    isPositivePaise(payment.amountPaise) &&
    members.has(payment.toMemberId) &&
    coveredMemberIds.length
  ) {
    ledger[payment.toMemberId].paidPaise -= payment.amountPaise;
    const shares = splitPaise(
      payment.amountPaise,
      coveredMemberIds.length,
    );
    coveredMemberIds.forEach((memberId, index) => {
      ledger[memberId].paidPaise += shares[index];
    });
  }
}

const netByMember = Object.fromEntries(
    Object.entries(ledger).map(([memberId, row]) => [
      memberId,
      row.paidPaise - row.sharePaise,
    ]),
  ),
  netTotalPaise = Object.values(netByMember).reduce(
    (sum, netPaise) => sum + netPaise,
    0,
  );
if (netTotalPaise !== 0)
  errors.push(`settlement: net balances total ${netTotalPaise} paise, expected 0`);

const knownRailState = {
    vyas: 41475,
    tirth: 0,
    nishit: 0,
    milan: -41475,
  },
  railGroup = settlementGroups.get("rail-tickets"),
  railPayment = (d.reimbursements || []).find(
    (payment) => payment.id === "reimbursement-tirth-trains",
  );
if (!railGroup || !railPayment) {
  errors.push("known rail settlement: group or reimbursement is missing");
} else {
  const railLedger = Object.fromEntries(
    [...members].map((memberId) => [
      memberId,
      { paidPaise: 0, sharePaise: 0 },
    ]),
  );
  railLedger[railGroup.payerId].paidPaise += railGroup.amountPaise;
  splitPaise(railGroup.amountPaise, railGroup.participantIds.length).forEach(
    (sharePaise, index) => {
      railLedger[railGroup.participantIds[index]].sharePaise += sharePaise;
    },
  );
  railLedger[railPayment.toMemberId].paidPaise -= railPayment.amountPaise;
  const coveredMemberIds = [...railPayment.coversMemberIds].sort();
  splitPaise(railPayment.amountPaise, coveredMemberIds.length).forEach(
    (sharePaise, index) => {
      railLedger[coveredMemberIds[index]].paidPaise += sharePaise;
    },
  );
  for (const [memberId, expectedPaise] of Object.entries(knownRailState)) {
    const actualPaise =
      railLedger[memberId].paidPaise - railLedger[memberId].sharePaise;
    if (actualPaise !== expectedPaise)
      errors.push(
        `known rail settlement: ${memberId} is ${actualPaise} paise, expected ${expectedPaise}`,
      );
  }
}

for (const r of d.resources ?? []) {
  if (!["pdf", "image", "link", "note"].includes(r.type))
    errors.push(`resource ${r.id}: unsupported type ${r.type}`);
  if ((r.type === "pdf" || r.type === "image") && !r.path)
    errors.push(`resource ${r.id}: local file missing path`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Trip data valid: ${activities.size} activities, ${places.size} places, ${members.size} members, ${resources.size} resources`,
);
