import React, { useMemo, useState } from "react";
import { data, formatINR, vibrate } from "../lib.js";
import {
  buildFinanceSnapshot,
  expenseBudgetScope,
  formatPercentFromBasisPoints,
} from "../finance.js";
import { DockAwarePanel } from "../ui.jsx";

const member = (id) => data.members.find((item) => item.id === id);
const firstName = (id) => member(id)?.name?.split(" ")[0] || id;

const componentLabels = {
  baseFare: "base fare",
  irctcConvenienceFee: "IRCTC fee",
  agentServiceCharge: "agent fee",
  travelInsurancePremium: "insurance",
  pgCharges: "PG charge",
};

function participantLabel(expense) {
  const ids = expense.participantIds || [];
  if (ids.length === 1) return firstName(ids[0]);
  if (ids.length <= 3) return ids.map(firstName).join(" + ");
  return `${ids.length} people`;
}

function obligationLabel(netPaise) {
  if (netPaise > 0)
    return { text: `GET ${formatINR(netPaise)}`, className: "net-positive" };
  if (netPaise < 0)
    return { text: `PAY ${formatINR(-netPaise)}`, className: "net-negative" };
  return { text: "SETTLED", className: "net-zero" };
}

export default function Finance({ expenses, setSheet }) {
  const snapshot = useMemo(() => buildFinanceSnapshot(data, expenses), [expenses]),
    [copied, setCopied] = useState(null),
    settlement = snapshot.settlement;

  const copySettlement = async (transfer) => {
    const from = member(transfer.from)?.name,
      to = member(transfer.to)?.name,
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
    ),
    allocationDifferencePaise =
      settlement.merchantPaidPaise +
      settlement.unassignedPaidPaise -
      settlement.allocatedSharePaise;

  return (
    <section className="page">
      <div className="page-title">
        <span>MONEY CONTROL</span>
        <h1>Finance</h1>
        <p>
          Real spend, planning estimates and member settlement are separate on
          purpose. Transfers never count as new trip spend.
        </p>
      </div>

      <div className="finance-summary-grid">
        <article className="finance-summary-card primary">
          <span>RECORDED PAID</span>
          <strong>{formatINR(snapshot.recordedPaidPaise)}</strong>
          <small>{snapshot.paid.length} confirmed cost entries</small>
        </article>
        <article className="finance-summary-card">
          <span>CORE PAID</span>
          <strong>{formatINR(snapshot.corePaidPaise)}</strong>
          <small>
            {formatPercentFromBasisPoints(snapshot.actualBudgetBasisPoints)} of {formatINR(snapshot.ceilingPaise)}
          </small>
        </article>
        <article className="finance-summary-card">
          <span>KNOWN FORECAST</span>
          <strong>{formatINR(snapshot.forecastCorePaise)}</strong>
          <small>
            paid + {formatINR(snapshot.corePlannedPaise)} planned · {formatPercentFromBasisPoints(snapshot.forecastBudgetBasisPoints)}
          </small>
        </article>
        <article className="finance-summary-card">
          <span>CORE BUFFER</span>
          <strong>
            {snapshot.overCorePaise
              ? `-${formatINR(snapshot.overCorePaise)}`
              : formatINR(snapshot.remainingCorePaise)}
          </strong>
          <small>
            {snapshot.overCorePaise ? "over planning ceiling" : "remaining after known costs"}
          </small>
        </article>
      </div>

      {snapshot.personalPaidPaise > 0 && (
        <div className="finance-scope-note">
          <b>{formatINR(snapshot.personalPaidPaise)} personal / outside group</b>
          <span>
            Included in recorded trip spend, excluded from the shared group
            budget and settlement unless that expense explicitly names group participants.
          </span>
        </div>
      )}

      <div className="finance-grid">
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>CORE PLAN</span>
            <b>{snapshot.budgetMembers.length} PEOPLE</b>
          </div>
          <strong className="metric-number small">{formatINR(snapshot.ceilingPaise)}</strong>
          <p className="muted">
            {formatINR(data.trip.budget.targetPerPersonPaise)} × {snapshot.budgetMembers.length} group members.
            Expense participation is still transaction-specific, so absent members are never charged automatically.
          </p>
          <div className="system-rows">
            <div>
              <b>Paid core costs</b>
              <span>{formatINR(snapshot.corePaidPaise)}</span>
            </div>
            <div>
              <b>Planned core costs</b>
              <span>{formatINR(snapshot.corePlannedPaise)}</span>
            </div>
            <div>
              <b>Known forecast</b>
              <span>{formatINR(snapshot.forecastCorePaise)}</span>
            </div>
            <div>
              <b>Budget used</b>
              <span>{formatPercentFromBasisPoints(snapshot.forecastBudgetBasisPoints)}</span>
            </div>
          </div>
          {snapshot.corePlanned.length ? (
            <div className="ledger finance-ledger">
              {snapshot.corePlanned.map((expense) => (
                <div key={expense.id}>
                  <span>
                    {expense.label}
                    <small>planned · excluded from settlement until paid</small>
                  </span>
                  <b>{formatINR(expense.amountPaise)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No planned core costs yet.</p>
          )}
        </DockAwarePanel>

        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>ACTUAL COST LEDGER</span>
            <button onClick={() => setSheet("expense")}>Draft</button>
          </div>
          <strong className="metric-number small">{formatINR(snapshot.recordedPaidPaise)}</strong>
          <p className="muted">
            Confirmed merchant costs only. Reimbursements move money between
            members and therefore never increase this total.
          </p>
          <div className="ledger finance-ledger detailed-ledger">
            {snapshot.paid.map((expense) => {
              const payer = member(expense.payerId),
                scope = expenseBudgetScope(data, expense),
                components = Object.entries(expense.componentsPaise || {}).filter(
                  ([, value]) => Number.isSafeInteger(value) && value > 0,
                );
              return (
                <div key={expense.id}>
                  <span>
                    {expense.label}
                    <small>
                      {payer?.name || "Unknown payer"} paid · allocated to {participantLabel(expense)} · {scope === "core" ? "core" : "personal"}
                    </small>
                    {components.length > 0 && (
                      <small className="expense-components">
                        {components
                          .map(
                            ([key, value]) =>
                              `${componentLabels[key] || key} ${formatINR(value)}`,
                          )
                          .join(" · ")}
                      </small>
                    )}
                  </span>
                  <b>{formatINR(expense.amountPaise)}</b>
                </div>
              );
            })}
          </div>
          {snapshot.localDrafts.length > 0 && (
            <div className="ledger finance-ledger finance-drafts">
              {snapshot.localDrafts.map((expense) => (
                <div key={expense.id}>
                  <span>
                    {expense.label}
                    <small>device draft · excluded from all shared totals</small>
                  </span>
                  <b>{formatINR(expense.amountPaise)}</b>
                </div>
              ))}
            </div>
          )}
        </DockAwarePanel>
      </div>

      {receivedPayments.length > 0 && (
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>CONFIRMED REIMBURSEMENTS</span>
            <b>{formatINR(settlement.confirmedReimbursementPaise)}</b>
          </div>
          <p className="muted">
            These are settlement transfers, not expenses. "Covers" determines
            whose obligation was cleared.
          </p>
          <div className="ledger finance-ledger">
            {receivedPayments.map((payment) => (
              <div key={payment.id}>
                <span>
                  {firstName(payment.fromMemberId)} → {firstName(payment.toMemberId)}
                  <small>
                    covers {payment.coversMemberIds.map(firstName).join(" + ")}
                  </small>
                </span>
                <b>{formatINR(payment.amountPaise)}</b>
              </div>
            ))}
          </div>
        </DockAwarePanel>
      )}

      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>PER-PERSON ACCOUNTS</span>
          <b>CONFIRMED COSTS ONLY</b>
        </div>
        <p className="muted">
          "Share" is the allocated trip cost. "Credit" is a confirmed
          reimbursement covering that share. Planned costs are shown separately
          and do not create debt.
        </p>
        <div className="finance-accounts">
          {data.members
            .filter((person) => snapshot.budgetMembers.includes(person.id))
            .map((person) => {
              const row = settlement.rows[person.id],
                obligation = obligationLabel(row.netPaise),
                plannedShare = snapshot.plannedShareByMember[person.id] || 0;
              return (
                <div className="finance-account" key={person.id}>
                  <div className="finance-account-id">{person.initials}</div>
                  <div>
                    <b>{person.name}</b>
                    <small>
                      share {formatINR(row.sharePaise)} · merchant paid {formatINR(row.merchantPaidPaise)}
                      {row.coverageCreditPaise > 0
                        ? ` · credit ${formatINR(row.coverageCreditPaise)}`
                        : ""}
                    </small>
                    <small>
                      recorded cash position {formatINR(row.cashPositionPaise)}
                      {plannedShare > 0 ? ` · planned share +${formatINR(plannedShare)}` : ""}
                    </small>
                  </div>
                  <strong className={obligation.className}>{obligation.text}</strong>
                </div>
              );
            })}
        </div>
      </DockAwarePanel>

      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>SETTLEMENT NOW</span>
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
                      {member(transfer.from)?.name} pays {member(transfer.to)?.name}
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
      </DockAwarePanel>

      <DockAwarePanel className="panel finance-integrity-panel">
        <div className="panel-head">
          <span>LEDGER INTEGRITY</span>
          <b>
            {allocationDifferencePaise === 0 && settlement.netBalancePaise === 0
              ? "BALANCED TO THE PAISA"
              : "CHECK REQUIRED"}
          </b>
        </div>
        <div className="finance-integrity-grid">
          <div>
            <span>PAID TO MERCHANTS</span>
            <b>{formatINR(settlement.merchantPaidPaise)}</b>
          </div>
          <div>
            <span>ALLOCATED SHARES</span>
            <b>{formatINR(settlement.allocatedSharePaise)}</b>
          </div>
          <div>
            <span>ALLOCATION DIFFERENCE</span>
            <b>{formatINR(Math.abs(allocationDifferencePaise))}</b>
          </div>
          <div>
            <span>NET BALANCE SUM</span>
            <b>{formatINR(Math.abs(settlement.netBalancePaise))}</b>
          </div>
        </div>
        <p className="system-copy">
          Exact integer paise are used end-to-end. Equal splits distribute any
          remainder deterministically; no floating-point rupee arithmetic is used
          for settlement.
        </p>
      </DockAwarePanel>
    </section>
  );
}
