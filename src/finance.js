const safePaise = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function splitPaiseExact(totalPaise, count) {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0)
    throw new RangeError("totalPaise must be a non-negative safe integer");
  if (!Number.isSafeInteger(count) || count <= 0)
    throw new RangeError("count must be a positive integer");
  const divisor = BigInt(count),
    total = BigInt(totalPaise),
    base = Number(total / divisor),
    remainder = Number(total % divisor);
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

const uniqueKnownIds = (ids, valid) =>
  [...new Set(ids || [])].filter((id) => valid.has(id)).sort();

export function budgetMemberIds(data) {
  const valid = new Set((data.members || []).map((member) => member.id)),
    explicit = (data.finance?.budgetMemberIds || data.trip?.budget?.memberIds || []).filter((id) => valid.has(id));
  if (explicit.length) return [...new Set(explicit)];
  const count = Number.isSafeInteger(data.trip?.budget?.groupSizeBudgeted)
    ? data.trip.budget.groupSizeBudgeted
    : data.members.length;
  return (data.members || []).slice(0, Math.max(0, count)).map((member) => member.id);
}

const financeMemberSet = (data) => new Set(budgetMemberIds(data));
const financeParticipants = (data, ids) =>
  uniqueKnownIds(ids, financeMemberSet(data));

export function expenseBudgetScope(data, expense) {
  if (expense.budgetScope === "personal") return "personal";
  const participants = financeParticipants(data, expense.participantIds);
  if (expense.budgetScope === "core") return participants.length ? "core" : "personal";
  return participants.length ? "core" : "personal";
}

export function ratioBasisPoints(numeratorPaise, denominatorPaise) {
  if (!Number.isSafeInteger(numeratorPaise) || numeratorPaise <= 0) return 0;
  if (!Number.isSafeInteger(denominatorPaise) || denominatorPaise <= 0) return 0;
  return Number(
    (BigInt(numeratorPaise) * 10000n + BigInt(denominatorPaise) / 2n) /
      BigInt(denominatorPaise),
  );
}

export function formatPercentFromBasisPoints(basisPoints) {
  const value = Math.max(0, Number(basisPoints) || 0) / 100;
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function groupPaidExpenses(data, expenses, diagnostics) {
  const financeMembers = financeMemberSet(data),
    knownMembers = new Set((data.members || []).map((member) => member.id)),
    groups = new Map(),
    signatures = new Map();

  for (const expense of expenses) {
    if (expense.status !== "paid") continue;
    const amountPaise = safePaise(expense.amountPaise),
      participants = uniqueKnownIds(expense.participantIds, financeMembers),
      declared = [...new Set(expense.participantIds || [])];
    if (!amountPaise) {
      diagnostics.push(`${expense.id}: invalid paid amount`);
      continue;
    }
    if (declared.some((id) => !knownMembers.has(id))) {
      diagnostics.push(`${expense.id}: unknown participant`);
      continue;
    }
    // Transactions with no finance-cohort participant are deliberately omitted
    // from settlement. They may still exist in the wider itinerary data.
    if (!participants.length) continue;

    const baseGroupId = expense.settlementGroupId || expense.id,
      signature = `${expense.payerId || ""}|${participants.join(",")}`,
      seen = signatures.get(baseGroupId);
    if (seen && seen !== signature)
      diagnostics.push(`${baseGroupId}: mixed payer/participant signatures`);
    else if (!seen) signatures.set(baseGroupId, signature);

    const key = `${baseGroupId}::${signature}`,
      current = groups.get(key);
    groups.set(key, {
      id: baseGroupId,
      signature,
      payerId: expense.payerId,
      participants,
      amountPaise: (current?.amountPaise || 0) + amountPaise,
      expenseIds: [...(current?.expenseIds || []), expense.id],
    });
  }
  return [...groups.values()];
}

export function buildSettlement(data, expenses) {
  const financeMembers = financeMemberSet(data),
    rows = Object.fromEntries(
      (data.members || []).map((member) => [
        member.id,
        {
          merchantPaidPaise: 0,
          sharePaise: 0,
          coverageCreditPaise: 0,
          reimbursementSentPaise: 0,
          reimbursementReceivedPaise: 0,
          cashPositionPaise: 0,
          netPaise: 0,
        },
      ]),
    ),
    diagnostics = [];
  let unassignedPaidPaise = 0,
    unallocatedSharePaise = 0,
    confirmedReimbursementPaise = 0;

  for (const group of groupPaidExpenses(data, expenses, diagnostics)) {
    if (financeMembers.has(group.payerId))
      rows[group.payerId].merchantPaidPaise += group.amountPaise;
    else {
      unassignedPaidPaise += group.amountPaise;
      diagnostics.push(`${group.id}: payer is outside finance cohort`);
    }
    const shares = splitPaiseExact(group.amountPaise, group.participants.length);
    group.participants.forEach((id, index) => {
      rows[id].sharePaise += shares[index];
    });
  }

  for (const payment of data.reimbursements || []) {
    if (payment.status !== "received") continue;
    const amountPaise = safePaise(payment.amountPaise),
      covered = uniqueKnownIds(payment.coversMemberIds, financeMembers);
    if (
      !amountPaise ||
      !covered.length ||
      !financeMembers.has(payment.toMemberId) ||
      !financeMembers.has(payment.fromMemberId)
    )
      continue;

    confirmedReimbursementPaise += amountPaise;
    rows[payment.toMemberId].reimbursementReceivedPaise += amountPaise;
    rows[payment.fromMemberId].reimbursementSentPaise += amountPaise;

    const credits = splitPaiseExact(amountPaise, covered.length);
    covered.forEach((id, index) => {
      rows[id].coverageCreditPaise += credits[index];
    });
  }

  for (const [id, row] of Object.entries(rows)) {
    if (!financeMembers.has(id)) continue;
    row.cashPositionPaise =
      row.merchantPaidPaise +
      row.reimbursementSentPaise -
      row.reimbursementReceivedPaise;
    row.netPaise =
      row.merchantPaidPaise -
      row.sharePaise +
      row.coverageCreditPaise -
      row.reimbursementReceivedPaise;
  }

  const creditors = [],
    debtors = [];
  for (const [id, row] of Object.entries(rows)) {
    if (!financeMembers.has(id)) continue;
    if (row.netPaise > 0) creditors.push({ id, amountPaise: row.netPaise });
    if (row.netPaise < 0) debtors.push({ id, amountPaise: -row.netPaise });
  }
  const byAmountThenId = (a, b) =>
    b.amountPaise - a.amountPaise || a.id.localeCompare(b.id);
  creditors.sort(byAmountThenId);
  debtors.sort(byAmountThenId);

  const transfers = [];
  let creditorIndex = 0,
    debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const amountPaise = Math.min(
      creditors[creditorIndex].amountPaise,
      debtors[debtorIndex].amountPaise,
    );
    if (amountPaise > 0)
      transfers.push({
        from: debtors[debtorIndex].id,
        to: creditors[creditorIndex].id,
        amountPaise,
      });
    creditors[creditorIndex].amountPaise -= amountPaise;
    debtors[debtorIndex].amountPaise -= amountPaise;
    if (creditors[creditorIndex].amountPaise === 0) creditorIndex++;
    if (debtors[debtorIndex].amountPaise === 0) debtorIndex++;
  }

  const financeRows = [...financeMembers].map((id) => rows[id]),
    merchantPaidPaise = financeRows.reduce(
      (sum, row) => sum + row.merchantPaidPaise,
      0,
    ),
    allocatedSharePaise = financeRows.reduce(
      (sum, row) => sum + row.sharePaise,
      0,
    ),
    netBalancePaise = financeRows.reduce(
      (sum, row) => sum + row.netPaise,
      0,
    );
  unallocatedSharePaise =
    merchantPaidPaise + unassignedPaidPaise - allocatedSharePaise;

  return {
    rows,
    transfers,
    diagnostics,
    merchantPaidPaise,
    allocatedSharePaise,
    confirmedReimbursementPaise,
    unassignedPaidPaise,
    unallocatedSharePaise,
    netBalancePaise,
  };
}

function addPlannedShares(data, expenses) {
  const valid = financeMemberSet(data),
    plannedByMember = Object.fromEntries(
      (data.members || []).map((member) => [member.id, 0]),
    );
  for (const expense of expenses) {
    if (expense.status !== "planned") continue;
    const amountPaise = safePaise(expense.amountPaise),
      participants = uniqueKnownIds(expense.participantIds, valid);
    if (!amountPaise || !participants.length) continue;
    const shares = splitPaiseExact(amountPaise, participants.length);
    participants.forEach((id, index) => {
      plannedByMember[id] += shares[index];
    });
  }
  return plannedByMember;
}

export function buildFinanceSnapshot(data, expenses) {
  const paid = expenses.filter((expense) => expense.status === "paid"),
    planned = expenses.filter((expense) => expense.status === "planned"),
    localDrafts = expenses.filter((expense) => expense.status === "local-only"),
    corePaid = paid.filter((expense) => expenseBudgetScope(data, expense) === "core"),
    personalPaid = paid.filter(
      (expense) => expenseBudgetScope(data, expense) !== "core",
    ),
    corePlanned = planned.filter(
      (expense) => expenseBudgetScope(data, expense) === "core",
    ),
    budgetMembers = budgetMemberIds(data),
    ceilingPaise =
      safePaise(data.trip?.budget?.targetPerPersonPaise) * budgetMembers.length,
    recordedPaidPaise = paid.reduce(
      (sum, expense) => sum + safePaise(expense.amountPaise),
      0,
    ),
    corePaidPaise = corePaid.reduce(
      (sum, expense) => sum + safePaise(expense.amountPaise),
      0,
    ),
    personalPaidPaise = personalPaid.reduce(
      (sum, expense) => sum + safePaise(expense.amountPaise),
      0,
    ),
    corePlannedPaise = corePlanned.reduce(
      (sum, expense) => sum + safePaise(expense.amountPaise),
      0,
    ),
    forecastCorePaise = corePaidPaise + corePlannedPaise,
    remainingCorePaise = Math.max(0, ceilingPaise - forecastCorePaise),
    overCorePaise = Math.max(0, forecastCorePaise - ceilingPaise),
    settlement = buildSettlement(data, expenses),
    plannedShareByMember = addPlannedShares(data, expenses);

  return {
    paid,
    planned,
    localDrafts,
    corePaid,
    personalPaid,
    corePlanned,
    budgetMembers,
    ceilingPaise,
    recordedPaidPaise,
    corePaidPaise,
    personalPaidPaise,
    corePlannedPaise,
    forecastCorePaise,
    remainingCorePaise,
    overCorePaise,
    actualBudgetBasisPoints: ratioBasisPoints(corePaidPaise, ceilingPaise),
    forecastBudgetBasisPoints: ratioBasisPoints(
      forecastCorePaise,
      ceilingPaise,
    ),
    settlement,
    plannedShareByMember,
  };
}
