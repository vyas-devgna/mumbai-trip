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
      kicker: "OWES FRIENDS",
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
    groupFundOutstandingByMember = Object.fromEntries(
      groupFundMembers.map((id) => [
        id,
        Math.max(
          0,
          groupFundTargetPerMemberPaise -
            (groupFundCollectedByMember[id] || 0),
        ),
      ]),
    ),
    groupFundOutstandingPaise = Object.values(
      groupFundOutstandingByMember,
    ).reduce((sum, amount) => sum + amount, 0),
    groupFundFullyFundedCount = groupFundMembers.filter(
      (id) => (groupFundOutstandingByMember[id] || 0) === 0,
    ).length,
    fundAdvances = receivedFundContributions.filter(
      (item) =>
        (item.paidByMemberId || item.memberId) !== item.memberId,
    ),
    groupFundExpensePaise = snapshot.paid
      .filter((expense) => expense.fundingSource === "groupFund")
      .reduce((sum, expense) => sum + safeFundAmount(expense.amountPaise), 0),
    directlyFundedExpensePaise =
      snapshot.recordedPaidPaise - groupFundExpensePaise,
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
    ),
    displayExpenses = snapshot.paid
      .map((expense, index) => ({ ...expense, _displayIndex: index }))
      .sort(
        (a, b) =>
          String(b.date || "").localeCompare(String(a.date || "")) ||
          b._displayIndex - a._displayIndex,
      ),
    displayOutflows = [...paidFundOutflows].reverse(),
    poolDebtors = groupFundMembers.filter(
      (id) => (groupFundOutstandingByMember[id] || 0) > 0,
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
        <p>Cash first. Then expenses. Then who still owes what.</p>
      </div>

      {groupFund && (
        <DockAwarePanel className="panel finance-pool-panel finance-cash-first">
          <div className="finance-section-heading">
            <div>
              <span>01 · CASH</span>
              <h2>Shared cash available</h2>
            </div>
            <b>{formatINR(groupFundBalancePaise)}</b>
          </div>

          <div className="finance-cash-hero">
            <span>CURRENT GROUP CASH</span>
            <strong>{formatINR(groupFundBalancePaise)}</strong>
            <small>
              This is money still available to spend. It is not the same as total trip spending.
            </small>
          </div>

          <div className="finance-cash-equation" aria-label="Shared cash calculation">
            <div>
              <span>COLLECTED</span>
              <b>{formatINR(groupFundCollectedPaise)}</b>
            </div>
            <i>−</i>
            <div>
              <span>PAID OUT</span>
              <b>{formatINR(groupFundSpentPaise)}</b>
            </div>
            <i>=</i>
            <div className="result">
              <span>CASH LEFT</span>
              <b>{formatINR(groupFundBalancePaise)}</b>
            </div>
          </div>

          <div className="finance-pool-status">
            <span>
              Pool target {formatINR(groupFundTargetPerMemberPaise)} × {groupFundMembers.length} = {formatINR(groupFundTargetPaise)}
            </span>
            <b>{formatINR(groupFundOutstandingPaise)} still to collect</b>
          </div>

          {displayOutflows.length > 0 && (
            <div className="finance-cash-subsection">
              <div className="finance-subhead">
                <b>Cash paid from the pool</b>
                <span>{formatINR(groupFundSpentPaise)} total</span>
              </div>
              <div className="finance-spend-list finance-cash-outflows">
                {displayOutflows.map((outflow) => (
                  <div className="finance-spend-row" key={outflow.id}>
                    <div>
                      <b>{outflow.label || "Group expense"}</b>
                      <small>{outflow.date} · paid from shared cash</small>
                    </div>
                    <strong>-{formatINR(outflow.amountPaise)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="finance-cash-subsection">
            <div className="finance-subhead">
              <b>Who has put money into the pool</b>
              <span>{groupFundFullyFundedCount}/{groupFundMembers.length} targets complete</span>
            </div>
            <div className="finance-contribution-list">
              {groupFundMembers.map((memberId) => {
                const collected = groupFundCollectedByMember[memberId] || 0,
                  outstanding = groupFundOutstandingByMember[memberId] || 0,
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
                          ? `${formatINR(outstanding)} still needs to be added to pool`
                          : "pool target complete"}
                      </small>
                      {advances.map((advance, index) => (
                        <small className="advance-note" key={`${memberId}-advance-${index}`}>
                          {firstName(advance.paidByMemberId)} actually paid {formatINR(advance.amountPaise)} for {firstName(memberId)}
                        </small>
                      ))}
                    </div>
                    <div className="finance-contribution-amount">
                      <strong>{formatINR(collected)}</strong>
                      <span className={outstanding > 0 ? "status-due" : "status-paid"}>
                        {outstanding > 0 ? "DUE" : "DONE"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {fundAdvances.length > 0 && (
            <div className="finance-callout">
              <b>Important: credited money and actual payer can differ.</b>
              <span>
                {fundAdvances
                  .map(
                    (advance) =>
                      `${firstName(advance.paidByMemberId)} paid ${formatINR(advance.amountPaise)} for ${firstName(advance.memberId)}`,
                  )
                  .join(" · ")}. Those advances are handled later under settlements and do not change the cash balance above.
              </span>
            </div>
          )}
        </DockAwarePanel>
      )}

      <DockAwarePanel className="panel finance-expenses-panel">
        <div className="finance-section-heading">
          <div>
            <span>02 · EXPENSES</span>
            <h2>What the trip has actually cost</h2>
          </div>
          <button className="finance-secondary-button" onClick={() => setSheet("expense")}>
            Add draft
          </button>
        </div>

        <div className="finance-overview-grid finance-expense-summary">
          <article className="finance-overview-card primary">
            <span>TOTAL SPENT</span>
            <strong>{formatINR(snapshot.recordedPaidPaise)}</strong>
            <small>all confirmed merchant payments</small>
          </article>
          <article className="finance-overview-card cash">
            <span>FROM GROUP CASH</span>
            <strong>{formatINR(groupFundExpensePaise)}</strong>
            <small>hotel, Uber and other pool-funded costs</small>
          </article>
          <article className="finance-overview-card">
            <span>PAID DIRECTLY</span>
            <strong>{formatINR(directlyFundedExpensePaise)}</strong>
            <small>paid personally by members</small>
          </article>
        </div>

        <div className="finance-spend-list">
          {displayExpenses.map((expense) => {
            const payer = member(expense.payerId),
              payerLabel =
                expense.fundingSource === "groupFund"
                  ? "Group cash"
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
                    {expense.date} · {payerLabel} paid · {participantLabel(expense)} involved
                    {scope !== "core" ? " · outside shared budget" : ""}
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
            <b>Device-only drafts · not counted above</b>
            {snapshot.localDrafts.map((expense) => (
              <div key={expense.id}>
                <span>{expense.label}</span>
                <strong>{formatINR(expense.amountPaise)}</strong>
              </div>
            ))}
          </div>
        )}
      </DockAwarePanel>

      <DockAwarePanel className="panel finance-action-panel">
        <div className="finance-section-heading">
          <div>
            <span>03 · SETTLEMENTS</span>
            <h2>Money still owed</h2>
          </div>
          <b>
            {formatINR(groupFundOutstandingPaise)} TO POOL
          </b>
        </div>

        <div className="finance-settlement-explainer">
          <b>Two different kinds of money can still be due.</b>
          <span>
            “To group cash” means someone has not finished their ₹3,000 pool contribution. “Between friends” covers personal expenses, reimbursements and money one friend fronted for another.
          </span>
        </div>

        <div className="finance-settlement-block">
          <div className="finance-subhead">
            <b>A · Still owed to group cash</b>
            <span>{formatINR(groupFundOutstandingPaise)} total</span>
          </div>
          {poolDebtors.length ? (
            <div className="finance-pool-due-list">
              {poolDebtors.map((memberId) => (
                <div key={memberId}>
                  <span>
                    <b>{member(memberId)?.name || memberId}</b>
                    <small>remaining pool contribution</small>
                  </span>
                  <strong>{formatINR(groupFundOutstandingByMember[memberId])}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="finance-empty-state">
              <b>Pool is fully funded.</b>
              <span>No contribution is currently outstanding.</span>
            </div>
          )}
        </div>

        <div className="finance-settlement-block">
          <div className="finance-subhead">
            <b>B · Between friends</b>
            <span>
              {settlement.transfers.length
                ? `${settlement.transfers.length} transfer${settlement.transfers.length === 1 ? "" : "s"}`
                : "settled"}
            </span>
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
              <b>No friend-to-friend payment needed.</b>
              <span>Personal settlement is currently balanced.</span>
            </div>
          )}
        </div>

        <p className="finance-footnote">
          A person may appear in both A and B. That is not double-counting: one amount belongs to the shared pool, while the other belongs to a specific friend.
        </p>
      </DockAwarePanel>

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>MEMBER BALANCES</span>
            <h2>Friend-to-friend balance by person</h2>
          </div>
          <b>EXCLUDES POOL DUES</b>
        </div>
        <p className="finance-section-copy">
          This table is only the personal settlement side. Pool contributions are shown separately above.
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
                            : `personal allocated share ${formatINR(row.sharePaise)}`}
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
            <span>SPENT</span>
            <b>{formatINR(snapshot.corePaidPaise)}</b>
          </div>
          <div>
            <span>PLANNED</span>
            <b>{formatINR(snapshot.corePlannedPaise)}</b>
          </div>
          <div>
            <span>BUDGET LEFT</span>
            <b>
              {snapshot.overCorePaise
                ? `-${formatINR(snapshot.overCorePaise)}`
                : formatINR(snapshot.remainingCorePaise)}
            </b>
          </div>
        </div>
        <p className="finance-footnote">
          Budget = {formatINR(data.trip.budget.targetPerPersonPaise)} × {snapshot.budgetMembers.length} finance members. Pool contributions are not counted as expenses; only actual merchant payments use this budget.
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
              All calculations use integer paise. Shared-pool purchases and person-to-person balances are reconciled separately so contributions are never mistaken for spending.
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}
