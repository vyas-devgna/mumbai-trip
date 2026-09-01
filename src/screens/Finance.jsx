import React, { useMemo, useState } from "react";
import { data, formatINR, splitPaise, vibrate } from "../lib.js";
import { DockAwarePanel } from "../ui.jsx";

function buildSettlement(expenses) {
  const valid = new Set(data.members.map((m) => m.id)),
    ledger = Object.fromEntries(
      data.members.map((m) => [m.id, { paidPaise: 0, sharePaise: 0 }]),
    ),
    settlementGroups = new Map();
  let unassignedPaise = 0;

  for (const expense of expenses) {
    if (expense.status !== "paid") continue;
    const amountPaise = expense.amountPaise,
      participants = [
        ...new Set(
          (expense.participantIds || []).filter((id) => valid.has(id)),
        ),
      ].sort();
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) continue;
    if (!participants.length) continue;
    const groupId = expense.settlementGroupId || expense.id,
      signature = `${expense.payerId || ""}|${participants.join(",")}`,
      current = settlementGroups.get(groupId);
    if (current && current.signature !== signature) continue;
    settlementGroups.set(groupId, {
      signature,
      payerId: expense.payerId,
      participants,
      amountPaise: (current?.amountPaise || 0) + amountPaise,
    });
  }

  for (const group of settlementGroups.values()) {
    if (group.payerId && valid.has(group.payerId))
      ledger[group.payerId].paidPaise += group.amountPaise;
    else unassignedPaise += group.amountPaise;
    const shares = splitPaise(group.amountPaise, group.participants.length);
    group.participants.forEach((id, index) => {
      ledger[id].sharePaise += shares[index];
    });
  }

  for (const payment of data.reimbursements || []) {
    if (payment.status !== "received") continue;
    const amountPaise = payment.amountPaise,
      covered = [
        ...new Set(
          (payment.coversMemberIds || []).filter((id) => valid.has(id)),
        ),
      ].sort();
    if (
      !Number.isSafeInteger(amountPaise) ||
      amountPaise <= 0 ||
      !covered.length ||
      !valid.has(payment.toMemberId)
    )
      continue;
    ledger[payment.toMemberId].paidPaise -= amountPaise;
    const shares = splitPaise(amountPaise, covered.length);
    covered.forEach((id, index) => {
      ledger[id].paidPaise += shares[index];
    });
  }

  const creditors = [],
    debtors = [];
  for (const [id, row] of Object.entries(ledger)) {
    row.netPaise = row.paidPaise - row.sharePaise;
    if (row.netPaise > 0) creditors.push({ id, amountPaise: row.netPaise });
    if (row.netPaise < 0) debtors.push({ id, amountPaise: -row.netPaise });
  }
  const byAmountThenId = (a, b) =>
    b.amountPaise - a.amountPaise || a.id.localeCompare(b.id);
  creditors.sort(byAmountThenId);
  debtors.sort(byAmountThenId);

  const transfers = [];
  let ci = 0,
    di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amountPaise = Math.min(
      creditors[ci].amountPaise,
      debtors[di].amountPaise,
    );
    if (amountPaise > 0)
      transfers.push({
        from: debtors[di].id,
        to: creditors[ci].id,
        amountPaise,
      });
    creditors[ci].amountPaise -= amountPaise;
    debtors[di].amountPaise -= amountPaise;
    if (creditors[ci].amountPaise === 0) ci++;
    if (debtors[di].amountPaise === 0) di++;
  }

  return { ledger, transfers, unassignedPaise };
}

export default function Finance({ expenses, setSheet }) {
  const paidExpenses = expenses.filter((expense) => expense.status === "paid"),
    plannedExpenses = data.expenses.filter(
      (expense) => expense.status === "planned",
    ),
    localDrafts = expenses.filter((expense) => expense.status === "local-only"),
    settlement = useMemo(() => buildSettlement(expenses), [expenses]),
    [copied, setCopied] = useState(null);

  const actualPaise = paidExpenses.reduce(
      (sum, expense) =>
        Number.isSafeInteger(expense.amountPaise)
          ? sum + expense.amountPaise
          : sum,
      0,
    ),
    plannedPaise = plannedExpenses.reduce(
      (sum, expense) =>
        Number.isSafeInteger(expense.amountPaise)
          ? sum + expense.amountPaise
          : sum,
      0,
    ),
    ceilingPaise =
      data.trip.budget.targetPerPersonPaise * data.trip.budget.groupSizeBudgeted;

  const copySettlement = async (transfer) => {
    const from = data.members.find((m) => m.id === transfer.from)?.name,
      to = data.members.find((m) => m.id === transfer.to)?.name,
      text = `${from} pays ${to} ${formatINR(transfer.amountPaise)} for the Mumbai trip settlement.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${transfer.from}-${transfer.to}`);
      vibrate(28);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  };

  const receivedPayments = (data.reimbursements || []).filter(
    (payment) => payment.status === "received",
  );

  return (
    <section className="page">
      <div className="page-title">
        <span>MONEY CONTROL</span>
        <h1>Finance</h1>
        <p>
          Planning estimates stay provisional. Per-person accounts change only
          when an actual payment is confirmed.
        </p>
      </div>

      <div className="finance-grid">
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>FINANCE PLAN</span>
            <b>ESTIMATE ONLY</b>
          </div>
          <strong className="metric-number small">{formatINR(plannedPaise)}</strong>
          <p className="muted">
            These costs help plan the trip but are not assigned to anyone and do
            not affect settlement.
          </p>
          <div className="system-rows">
            <div>
              <b>Planning ceiling</b>
              <span>{formatINR(ceilingPaise)} group</span>
            </div>
            <div>
              <b>Target</b>
              <span>{formatINR(data.trip.budget.targetPerPersonPaise)} / person</span>
            </div>
            <div>
              <b>Estimates</b>
              <span>{plannedExpenses.length}</span>
            </div>
          </div>
          {plannedExpenses.length ? (
            <div className="ledger finance-ledger">
              {plannedExpenses.map((expense) => (
                <div key={expense.id}>
                  <span>
                    {expense.label}
                    <small>planned · not split</small>
                  </span>
                  <b>{formatINR(expense.amountPaise)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No planned costs yet.</p>
          )}
        </DockAwarePanel>

        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>ACTUAL LEDGER</span>
            <button onClick={() => setSheet("expense")}>Draft</button>
          </div>
          <strong className="metric-number small">{formatINR(actualPaise)}</strong>
          <p className="muted">
            Only confirmed paid entries feed the accounts below. For now this is
            the train ledger.
          </p>
          <div className="ledger finance-ledger">
            {paidExpenses.map((expense) => (
              <div key={expense.id}>
                <span>{expense.label}</span>
                <b>{formatINR(expense.amountPaise)}</b>
              </div>
            ))}
          </div>
          {receivedPayments.length > 0 && (
            <div className="ledger reimbursements finance-ledger">
              {receivedPayments.map((payment) => (
                <div key={payment.id}>
                  <span>
                    {data.members.find((m) => m.id === payment.fromMemberId)?.name}
                    {" paid · "}
                    {payment.coversMemberIds
                      .map(
                        (id) =>
                          data.members.find((m) => m.id === id)?.name.split(" ")[0],
                      )
                      .join(" + ")}
                  </span>
                  <b>{formatINR(payment.amountPaise)}</b>
                </div>
              ))}
            </div>
          )}
          {localDrafts.length > 0 && (
            <div className="ledger finance-ledger finance-drafts">
              {localDrafts.map((expense) => (
                <div key={expense.id}>
                  <span>
                    {expense.label}
                    <small>device draft · excluded from accounts</small>
                  </span>
                  <b>{formatINR(expense.amountPaise)}</b>
                </div>
              ))}
            </div>
          )}
        </DockAwarePanel>
      </div>

      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>PER-PERSON ACCOUNTS</span>
          <b>PAID ONLY</b>
        </div>
        <div className="finance-accounts">
          {data.members.map((member) => {
            const row = settlement.ledger[member.id];
            return (
              <div className="finance-account" key={member.id}>
                <div className="finance-account-id">{member.initials}</div>
                <div>
                  <b>{member.name}</b>
                  <small>
                    paid {formatINR(row.paidPaise)} · share {formatINR(row.sharePaise)}
                  </small>
                </div>
                <strong
                  className={row.netPaise >= 0 ? "net-positive" : "net-negative"}
                >
                  {row.netPaise >= 0 ? "+" : ""}
                  {formatINR(row.netPaise)}
                </strong>
              </div>
            );
          })}
        </div>
      </DockAwarePanel>

      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>SETTLEMENT</span>
          <b>
            {settlement.transfers.length
              ? `${settlement.transfers.length} TRANSFER${settlement.transfers.length === 1 ? "" : "S"}`
              : "BALANCED"}
          </b>
        </div>
        {settlement.transfers.length ? (
          <div className="settlement-transfers">
            {settlement.transfers.map((transfer, index) => {
              const key = `${transfer.from}-${transfer.to}`;
              return (
                <div className="settlement-transfer" key={`${key}-${index}`}>
                  <div>
                    <b>
                      {data.members.find((m) => m.id === transfer.from)?.name} pays{" "}
                      {data.members.find((m) => m.id === transfer.to)?.name}
                    </b>
                    <strong>{formatINR(transfer.amountPaise)}</strong>
                  </div>
                  <button onClick={() => copySettlement(transfer)}>
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No transfer is currently required.</p>
        )}
        {settlement.unassignedPaise > 0 && (
          <p className="muted">
            {formatINR(settlement.unassignedPaise)} has no payer assigned and is
            excluded from settlement.
          </p>
        )}
      </DockAwarePanel>

      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>ACCOUNTING RULE</span>
          <b>PAYMENT CREATES BALANCE</b>
        </div>
        <p className="system-copy">
          Estimates can change freely. When you send an actual bill or payment,
          the canonical ledger records who paid, who participated and the exact
          amount; only then does the per-person account move.
        </p>
      </DockAwarePanel>
    </section>
  );
}
