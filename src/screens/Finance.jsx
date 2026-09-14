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

const safeFundAmount = (value) =>
  Number.isSafeInteger(value) && value > 0 ? value : 0;

function participantLabel(expense) {
  const ids = expense.participantIds || [];
  if (ids.length === 1) return firstName(ids[0]);
  if (ids.length <= 3) return ids.map(firstName).join(" + ");
  return `${ids.length} people`;
}

function balanceLabel(netPaise) {
  if (netPaise > 0)
    return {
      kicker: "GETS BACK",
      amount: formatINR(netPaise),
      className: "net-positive",
    };
  if (netPaise < 0)
    return {
      kicker: "OWES",
      amount: formatINR(-netPaise),
      className: "net-negative",
    };
  return { kicker: "SETTLED", amount: "₹0", className: "net-zero" };
}

export default function Finance({ expenses, setSheet }) {
  const snapshot = useMemo(() => buildFinanceSnapshot(data, expenses), [expenses]),
    [copied, setCopied] = useState(null),
    settlement = snapshot.settlement,
    groupFund = data.finance?.groupFund,
    receivedFundContributions = (groupFund?.contributions || []).filter(
      (item) => item.status === "received",
    ),
    paidFundOutflows = (groupFund?.outflows || []).filter(
      (item) => item.status === "paid",
    ),
    groupFundMembers = groupFund?.targetMemberIds || snapshot.budgetMembers,
    groupFundTargetPerMemberPaise = safeFundAmount(
      groupFund?.targetPerMemberPaise,
    ),
    groupFundCollectedByMember = Object.fromEntries(
      groupFundMembers.map((id) => [id, 0]),
    ),
    groupFundAdvancedByMember = Object.fromEntries(
      groupFundMembers.map((id) => [id, []]),
    );

  for (const contribution of receivedFundContributions) {
    if (
      Object.prototype.hasOwnProperty.call(
        groupFundCollectedByMember,
        contribution.memberId,
      )
    )
      groupFundCollectedByMember[contribution.memberId] += safeFundAmount(
        contribution.amountPaise,
      );

    const paidBy = contribution.paidByMemberId || contribution.memberId;
    if (
      paidBy !== contribution.memberId &&
      Object.prototype.hasOwnProperty.call(
        groupFundAdvancedByMember,
        contribution.memberId,
      )
    )
      groupFundAdvancedByMember[contribution.memberId].push({
        paidByMemberId: paidBy,
        amountPaise: safeFundAmount(contribution.amountPaise),
      });
  }

  const groupFundCollectedPaise = receivedFundContributions.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    groupFundSpentPaise = paidFundOutflows.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    groupFundBalancePaise = groupFundCollectedPaise - groupFundSpentPaise,
    groupFundTargetPaise =
      groupFundTargetPerMemberPaise * groupFundMembers.length,
    groupFundOutstandingPaise = groupFundMembers.reduce(
      (sum, id) =>
        sum +
        Math.max(
          0,
          groupFundTargetPerMemberPaise -
            (groupFundCollectedByMember[id] || 0),
        ),
      0,
    ),
    groupFundFullyFundedCount = groupFundMembers.filter(
      (id) =>
        groupFundTargetPerMemberPaise > 0 &&
        (groupFundCollectedByMember[id] || 0) >=
          groupFundTargetPerMemberPaise,
    ).length,
    fundAdvances = receivedFundContributions.filter(
      (item) =>
        (item.paidByMemberId || item.memberId) !== item.memberId,
    ),
    groupFundExpensePaise = snapshot.paid
      .filter((expense) => expense.fundingSource === "groupFund")
      .reduce((sum, expense) => sum + safeFundAmount(expense.amountPaise), 0),
    groupFundReconciliationPaise = groupFundExpensePaise - groupFundSpentPaise,
    receivedPayments = (data.reimbursements || []).filter(
      (payment) => payment.status === "received",
    ),
    allocationDifferencePaise =
      settlement.merchantPaidPaise +
      settlement.unassignedPaidPaise -
      settlement.allocatedSharePaise,
    ledgerBalanced =
      allocationDifferencePaise === 0 &&
      settlement.netBalancePaise === 0 &&
      groupFundReconciliationPaise === 0,
    budgetPercent = formatPercentFromBasisPoints(
      snapshot.forecastBudgetBasisPoints,
    ),
    budgetProgress = Math.min(
      100,
      Math.max(0, snapshot.forecastBudgetBasisPoints / 100),
    );

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

  return (
    <section className="page finance-page">
      <div className="page-title finance-title">
        <span>MONEY</span>
        <h1>Finance</h1>
        <p>One screen for what was spent, what cash is left, and who pays whom.</p>
      </div>

      <div className="finance-overview-grid">
        <article className="finance-overview-card primary">
          <span>TRIP SPENT</span>
          <strong>{formatINR(snapshot.recordedPaidPaise)}</strong>
          <small>all confirmed purchases</small>
        </article>
        <article className="finance-overview-card cash">
          <span>SHARED CASH NOW</span>
          <strong>{formatINR(groupFundBalancePaise)}</strong>
          <small>still available in the group pool</small>
        </article>
        <article className="finance-overview-card">
          <span>BUDGET LEFT</span>
          <strong>
            {snapshot.overCorePaise
              ? `-${formatINR(snapshot.overCorePaise)}`
              : formatINR(snapshot.remainingCorePaise)}
          </strong>
          <small>{budgetPercent} of {formatINR(snapshot.ceilingPaise)} used</small>
        </article>
      </div>

      <div className="finance-legend-strip" role="note">
        <div>
          <b>Trip spent</b>
          <span>money already paid to hotels, food, trains, etc.</span>
        </div>
        <div>
          <b>Shared cash</b>
          <span>money still sitting in the common expense pool.</span>
        </div>
        <div>
          <b>Pay now</b>
          <span>friend-to-friend settlement after every confirmed entry.</span>
        </div>
      </div>

      <DockAwarePanel className="panel finance-action-panel">
        <div className="finance-section-heading">
          <div>
            <span>PAY NOW</span>
            <h2>Who needs to pay whom</h2>
          </div>
          <b>
            {settlement.transfers.length
              ? `${settlement.transfers.length} TRANSFER${settlement.transfers.length === 1 ? "" : "S"}`
              : "ALL SETTLED"}
          </b>
        </div>

        {settlement.transfers.length ? (
          <div className="settlement-simple-list">
            {settlement.transfers.map((transfer, index) => {
              const key = `${transfer.from}-${transfer.to}`;
              return (
                <div className="settlement-simple-row" key={`${key}-${index}`}>
                  <div className="settlement-person-flow">
                    <span className="settlement-avatar">
                      {member(transfer.from)?.initials || "?"}
                    </span>
                    <div>
                      <small>{firstName(transfer.from)} pays</small>
                      <b>{firstName(transfer.to)}</b>
                    </div>
                  </div>
                  <strong>{formatINR(transfer.amountPaise)}</strong>
                  <button onClick={() => copySettlement(transfer)}>
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="finance-empty-state">
            <b>Everyone is settled.</b>
            <span>No member-to-member transfer is required right now.</span>
          </div>
        )}
        <p className="finance-footnote">
          These transfers already include confirmed reimbursements and any money one member fronted for another.
        </p>
      </DockAwarePanel>

      {groupFund && (
        <DockAwarePanel className="panel finance-pool-panel">
          <div className="finance-section-heading">
            <div>
              <span>SHARED EXPENSE POOL</span>
              <h2>{formatINR(groupFundBalancePaise)} available</h2>
            </div>
            <b>{groupFundFullyFundedCount}/{groupFundMembers.length} FULL</b>
          </div>

          <div className="finance-cash-equation" aria-label="Shared cash calculation">
            <div>
              <span>COLLECTED</span>
              <b>{formatINR(groupFundCollectedPaise)}</b>
            </div>
            <i>−</i>
            <div>
              <span>SPENT</span>
              <b>{formatINR(groupFundSpentPaise)}</b>
            </div>
            <i>=</i>
            <div className="result">
              <span>AVAILABLE</span>
              <b>{formatINR(groupFundBalancePaise)}</b>
            </div>
          </div>

          <div className="finance-pool-status">
            <span>
              Target {formatINR(groupFundTargetPerMemberPaise)} each · {formatINR(groupFundTargetPaise)} total
            </span>
            <b>{formatINR(groupFundOutstandingPaise)} still to collect</b>
          </div>

          <div className="finance-contribution-list">
            {groupFundMembers.map((memberId) => {
              const collected = groupFundCollectedByMember[memberId] || 0,
                outstanding = Math.max(
                  0,
                  groupFundTargetPerMemberPaise - collected,
                ),
                advances = groupFundAdvancedByMember[memberId] || [];

              return (
                <div className="finance-contribution-row" key={memberId}>
                  <span className="finance-member-avatar">
                    {member(memberId)?.initials || "?"}
                  </span>
                  <div>
                    <b>{member(memberId)?.name || memberId}</b>
                    <small>
                      {outstanding > 0
                        ? `${formatINR(outstanding)} still due to pool`
                        : "pool target complete"}
                    </small>
                    {advances.map((advance, index) => (
                      <small className="advance-note" key={`${memberId}-advance-${index}`}>
                        {firstName(advance.paidByMemberId)} fronted {formatINR(advance.amountPaise)} for this member
                      </small>
                    ))}
                  </div>
                  <div className="finance-contribution-amount">
                    <strong>{formatINR(collected)}</strong>
                    <span className={outstanding > 0 ? "status-due" : "status-paid"}>
                      {outstanding > 0 ? "PARTIAL" : "FUNDED"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {fundAdvances.length > 0 && (
            <div className="finance-callout">
              <b>Fronted money is not lost.</b>
              <span>
                {fundAdvances
                  .map(
                    (advance) =>
                      `${firstName(advance.paidByMemberId)} fronted ${formatINR(advance.amountPaise)} for ${firstName(advance.memberId)}`,
                  )
                  .join(" · ")}. It is automatically included in the Pay Now settlement above.
              </span>
            </div>
          )}
        </DockAwarePanel>
      )}

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>SPENDING</span>
            <h2>Where the money went</h2>
          </div>
          <button className="finance-secondary-button" onClick={() => setSheet("expense")}>
            Add draft
          </button>
        </div>

        <div className="finance-spend-list">
          {snapshot.paid.map((expense) => {
            const payer = member(expense.payerId),
              payerLabel =
                expense.fundingSource === "groupFund"
                  ? "Shared pool"
                  : payer?.name || "Unknown payer",
              scope = expenseBudgetScope(data, expense),
              components = Object.entries(expense.componentsPaise || {}).filter(
                ([, value]) => Number.isSafeInteger(value) && value > 0,
              );

            return (
              <div className="finance-spend-row" key={expense.id}>
                <div>
                  <b>{expense.label}</b>
                  <small>
                    {payerLabel} paid · shared by {participantLabel(expense)}
                    {scope !== "core" ? " · personal" : ""}
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
                </div>
                <strong>{formatINR(expense.amountPaise)}</strong>
              </div>
            );
          })}
        </div>

        {snapshot.localDrafts.length > 0 && (
          <div className="finance-draft-block">
            <b>Device-only drafts</b>
            {snapshot.localDrafts.map((expense) => (
              <div key={expense.id}>
                <span>{expense.label}</span>
                <strong>{formatINR(expense.amountPaise)}</strong>
              </div>
            ))}
          </div>
        )}
      </DockAwarePanel>

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>MEMBER BALANCES</span>
            <h2>What each person currently owes</h2>
          </div>
          <b>CONFIRMED ONLY</b>
        </div>
        <p className="finance-section-copy">
          Positive means that person should receive money. Negative means they still need to pay.
        </p>

        <div className="finance-balance-list">
          {data.members
            .filter((person) => snapshot.budgetMembers.includes(person.id))
            .map((person) => {
              const row = settlement.rows[person.id],
                status = balanceLabel(row.netPaise);

              return (
                <div className="finance-balance-row" key={person.id}>
                  <span className="finance-member-avatar">{person.initials}</span>
                  <div className="finance-balance-person">
                    <b>{person.name}</b>
                    <small>
                      {row.groupFundAdvanceCoveredPaise > 0
                        ? `${formatINR(row.groupFundAdvanceCoveredPaise)} was fronted for them`
                        : row.groupFundAdvancePaidPaise > 0
                          ? `fronted ${formatINR(row.groupFundAdvancePaidPaise)} for others`
                          : row.coverageCreditPaise > 0
                            ? `${formatINR(row.coverageCreditPaise)} already covered`
                            : `allocated trip share ${formatINR(row.sharePaise)}`}
                    </small>
                  </div>
                  <div className={`finance-balance-value ${status.className}`}>
                    <span>{status.kicker}</span>
                    <strong>{status.amount}</strong>
                  </div>
                </div>
              );
            })}
        </div>
      </DockAwarePanel>

      <DockAwarePanel className="panel finance-budget-panel">
        <div className="finance-section-heading">
          <div>
            <span>TRIP BUDGET</span>
            <h2>{formatINR(snapshot.ceilingPaise)} total ceiling</h2>
          </div>
          <b>{budgetPercent} USED</b>
        </div>

        <div className="finance-budget-bar" aria-label={`${budgetPercent} of trip budget used`}>
          <span style={{ width: `${budgetProgress}%` }} />
        </div>

        <div className="finance-budget-stats">
          <div>
            <span>PAID</span>
            <b>{formatINR(snapshot.corePaidPaise)}</b>
          </div>
          <div>
            <span>PLANNED</span>
            <b>{formatINR(snapshot.corePlannedPaise)}</b>
          </div>
          <div>
            <span>LEFT</span>
            <b>
              {snapshot.overCorePaise
                ? `-${formatINR(snapshot.overCorePaise)}`
                : formatINR(snapshot.remainingCorePaise)}
            </b>
          </div>
        </div>
        <p className="finance-footnote">
          Budget is {formatINR(data.trip.budget.targetPerPersonPaise)} × {snapshot.budgetMembers.length} finance members. Only people named on an expense share that expense.
        </p>
      </DockAwarePanel>

      {snapshot.personalPaidPaise > 0 && (
        <div className="finance-scope-note">
          <b>{formatINR(snapshot.personalPaidPaise)} outside the shared budget</b>
          <span>
            This is still recorded as trip spending, but it is not charged to the group unless the expense explicitly names group participants.
          </span>
        </div>
      )}

      <details className="finance-details">
        <summary>
          <span>
            <b>Audit & bookkeeping</b>
            <small>Reimbursements, exact allocation and ledger checks</small>
          </span>
          <strong>{ledgerBalanced ? "BALANCED" : "CHECK"}</strong>
        </summary>

        <div className="finance-details-body">
          {receivedPayments.length > 0 && (
            <section className="finance-audit-section">
              <div className="finance-section-heading compact">
                <div>
                  <span>REIMBURSEMENTS</span>
                  <h3>{formatINR(settlement.confirmedReimbursementPaise)} received</h3>
                </div>
              </div>
              <div className="finance-audit-list">
                {receivedPayments.map((payment) => (
                  <div key={payment.id}>
                    <span>
                      <b>{firstName(payment.fromMemberId)} → {firstName(payment.toMemberId)}</b>
                      <small>covers {payment.coversMemberIds.map(firstName).join(" + ")}</small>
                    </span>
                    <strong>{formatINR(payment.amountPaise)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="finance-audit-section">
            <div className="finance-section-heading compact">
              <div>
                <span>LEDGER CHECK</span>
                <h3>{ledgerBalanced ? "Balanced to the paisa" : "Review required"}</h3>
              </div>
            </div>
            <div className="finance-integrity-grid">
              <div>
                <span>PERSONALLY FUNDED COSTS</span>
                <b>{formatINR(settlement.merchantPaidPaise)}</b>
              </div>
              <div>
                <span>GROUP-FUNDED COSTS</span>
                <b>{formatINR(groupFundExpensePaise)}</b>
              </div>
              <div>
                <span>PERSONAL ALLOCATION DIFFERENCE</span>
                <b>{formatINR(Math.abs(allocationDifferencePaise))}</b>
              </div>
              <div>
                <span>GROUP-FUND DIFFERENCE</span>
                <b>{formatINR(Math.abs(groupFundReconciliationPaise))}</b>
              </div>
              <div>
                <span>NET BALANCE SUM</span>
                <b>{formatINR(Math.abs(settlement.netBalancePaise))}</b>
              </div>
              <div>
                <span>MEMBER ADVANCES</span>
                <b>{formatINR(settlement.groupFundAdvancePaise)}</b>
              </div>
            </div>
            <p className="finance-footnote">
              All calculations use integer paise. Shared-pool purchases and person-to-person balances are reconciled separately so deposits are never mistaken for spending.
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}
