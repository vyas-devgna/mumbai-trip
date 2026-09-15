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
    legacyGroupFund = data.finance?.legacyGroupFund,
    interAccountLinks = data.finance?.interAccountLinks || [],
    coveragePolicy = (data.finance?.memberCoveragePolicies || []).find(
      (item) => item.id === "vyas-covers-milan-trip",
    ),
    receivedFundContributions = (groupFund?.contributions || []).filter(
      (item) => item.status === "received",
    ),
    appliedFundCredits = (groupFund?.credits || []).filter(
      (item) => item.status === "applied",
    ),
    paidFundOutflows = (groupFund?.outflows || []).filter(
      (item) => item.status === "paid",
    ),
    interPoolPayables = (groupFund?.interPoolPayables || []).filter(
      (item) => item.status === "due",
    ),
    memberPayables = (groupFund?.memberPayables || []).filter(
      (item) => item.status === "due",
    ),
    groupFundMembers = groupFund?.targetMemberIds || snapshot.budgetMembers,
    groupFundTargetPerMemberPaise = safeFundAmount(
      groupFund?.targetPerMemberPaise,
    ),
    groupFundCollectedByMember = Object.fromEntries(
      groupFundMembers.map((id) => [id, 0]),
    ),
    groupFundCreditByMember = Object.fromEntries(
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

  for (const credit of appliedFundCredits) {
    if (
      Object.prototype.hasOwnProperty.call(
        groupFundCreditByMember,
        credit.memberId,
      )
    )
      groupFundCreditByMember[credit.memberId] += safeFundAmount(
        credit.amountPaise,
      );
  }

  const groupFundCollectedPaise = receivedFundContributions.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    groupFundCreditPaise = appliedFundCredits.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    groupFundSpentPaise = paidFundOutflows.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    groupFundBalancePaise = groupFundCollectedPaise - groupFundSpentPaise,
    groupFundPhysicalCashPaise = Number.isSafeInteger(
      groupFund?.physicalCashBalancePaise,
    )
      ? groupFund.physicalCashBalancePaise
      : groupFundBalancePaise,
    groupFundReservedPaise = Number.isSafeInteger(groupFund?.reservedPayablesPaise)
      ? groupFund.reservedPayablesPaise
      : [...interPoolPayables, ...memberPayables].reduce(
          (sum, item) => sum + safeFundAmount(item.amountPaise),
          0,
        ),
    groupFundSpendablePaise = Number.isSafeInteger(groupFund?.spendableBalancePaise)
      ? groupFund.spendableBalancePaise
      : Math.max(0, groupFundPhysicalCashPaise - groupFundReservedPaise),
    groupFundTargetPaise =
      groupFundTargetPerMemberPaise * groupFundMembers.length,
    groupFundOutstandingByMember = Object.fromEntries(
      groupFundMembers.map((id) => [
        id,
        Math.max(
          0,
          groupFundTargetPerMemberPaise -
            (groupFundCollectedByMember[id] || 0) -
            (groupFundCreditByMember[id] || 0),
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
    activeGroupFundExpensePaise = snapshot.paid
      .filter(
        (expense) =>
          expense.fundingSource === "groupFund" &&
          expense.groupFundId === groupFund?.id,
      )
      .reduce((sum, expense) => sum + safeFundAmount(expense.amountPaise), 0),
    allGroupFundExpensePaise = snapshot.paid
      .filter((expense) => expense.fundingSource === "groupFund")
      .reduce((sum, expense) => sum + safeFundAmount(expense.amountPaise), 0),
    activeMemberCreditExpensePaise = snapshot.paid
      .filter(
        (expense) =>
          expense.fundingSource === "groupFundMemberCredit" &&
          expense.groupFundId === groupFund?.id,
      )
      .reduce((sum, expense) => sum + safeFundAmount(expense.amountPaise), 0),
    directlyFundedExpensePaise =
      snapshot.recordedPaidPaise - allGroupFundExpensePaise,
    groupFundReconciliationPaise =
      activeGroupFundExpensePaise - groupFundSpentPaise,
    memberCreditReconciliationPaise =
      activeMemberCreditExpensePaise - groupFundCreditPaise,
    legacyContributions = (legacyGroupFund?.contributions || []).filter(
      (item) => item.status === "received",
    ),
    legacyCredits = (legacyGroupFund?.credits || []).filter(
      (item) => item.status === "applied",
    ),
    legacyOutflows = (legacyGroupFund?.outflows || []).filter(
      (item) => item.status === "paid",
    ),
    legacyConfirmedOutflows = legacyOutflows.filter(
      (item) => item.category !== "reconciliation",
    ),
    legacyCollectedPaise = legacyContributions.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    legacyCreditPaise = legacyCredits.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    legacyConfirmedSpentPaise = legacyConfirmedOutflows.reduce(
      (sum, item) => sum + safeFundAmount(item.amountPaise),
      0,
    ),
    legacyTargetPaise =
      safeFundAmount(legacyGroupFund?.targetPerMemberPaise) *
      (legacyGroupFund?.targetMemberIds || []).length,
    legacyCurrentPhysicalPaise = Number.isSafeInteger(
      legacyGroupFund?.currentPhysicalBalancePaise,
    )
      ? legacyGroupFund.currentPhysicalBalancePaise
      : 0,
    legacyReceivablePaise = safeFundAmount(
      legacyGroupFund?.interPoolReceivablePaise,
    ),
    legacyEconomicBalancePaise = Number.isSafeInteger(
      legacyGroupFund?.economicBalancePaise,
    )
      ? legacyGroupFund.economicBalancePaise
      : legacyCurrentPhysicalPaise + legacyReceivablePaise,
    legacyAuditVariancePaise = Number.isSafeInteger(
      legacyGroupFund?.auditVariancePaise,
    )
      ? legacyGroupFund.auditVariancePaise
      : 0,
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
      groupFundReconciliationPaise === 0 &&
      memberCreditReconciliationPaise === 0,
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
    ),
    payableSummary = [
      ...interPoolPayables.map(
        (item) => `${item.label || "Old group"} ${formatINR(item.amountPaise)}`,
      ),
      ...memberPayables.map(
        (item) => `${firstName(item.memberId)} ${formatINR(item.amountPaise)}`,
      ),
    ].join(" · ");

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
              <span>01 · ACTIVE CASH</span>
              <h2>8-person group cash</h2>
            </div>
            <b>{formatINR(groupFundSpendablePaise)}</b>
          </div>

          <div className="finance-cash-hero">
            <span>SPENDABLE NOW</span>
            <strong>{formatINR(groupFundSpendablePaise)}</strong>
            <small>
              {formatINR(groupFundPhysicalCashPaise)} is physically held. {formatINR(groupFundReservedPaise)} is reserved for known reimbursements and is not free to spend.
            </small>
          </div>

          <div className="finance-cash-equation" aria-label="Active shared cash calculation">
            <div>
              <span>CASH COLLECTED</span>
              <b>{formatINR(groupFundCollectedPaise)}</b>
            </div>
            <i>−</i>
            <div>
              <span>CASH PAID OUT</span>
              <b>{formatINR(groupFundSpentPaise)}</b>
            </div>
            <i>=</i>
            <div className="result">
              <span>PHYSICAL CASH</span>
              <b>{formatINR(groupFundPhysicalCashPaise)}</b>
            </div>
          </div>

          <div className="finance-pool-status">
            <span>
              Pool target {formatINR(groupFundTargetPerMemberPaise)} × {groupFundMembers.length} = {formatINR(groupFundTargetPaise)} · {formatINR(groupFundCreditPaise)} expense credit already counted
            </span>
            <b>{formatINR(groupFundOutstandingPaise)} still to collect</b>
          </div>

          {groupFundReservedPaise > 0 && (
            <div className="finance-callout">
              <b>{formatINR(groupFundReservedPaise)} of current cash is reserved.</b>
              <span>{payableSummary}. These liabilities belong only to the active eight-person account, leaving {formatINR(groupFundSpendablePaise)} free to spend.</span>
            </div>
          )}

          {displayOutflows.length > 0 && (
            <div className="finance-cash-subsection">
              <div className="finance-subhead">
                <b>Cash paid from active pool</b>
                <span>{formatINR(groupFundSpentPaise)} total</span>
              </div>
              <div className="finance-spend-list finance-cash-outflows">
                {displayOutflows.map((outflow) => (
                  <div className="finance-spend-row" key={outflow.id}>
                    <div>
                      <b>{outflow.label || "Group expense"}</b>
                      <small>{outflow.date} · paid from active shared cash</small>
                    </div>
                    <strong>-{formatINR(outflow.amountPaise)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="finance-cash-subsection">
            <div className="finance-subhead">
              <b>Who has covered the ₹200 target</b>
              <span>{groupFundFullyFundedCount}/{groupFundMembers.length} complete</span>
            </div>
            <div className="finance-contribution-list">
              {groupFundMembers.map((memberId) => {
                const collected = groupFundCollectedByMember[memberId] || 0,
                  credit = groupFundCreditByMember[memberId] || 0,
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
                          ? `${formatINR(outstanding)} still needs to be covered`
                          : "group target complete"}
                      </small>
                      {credit > 0 && (
                        <small className="advance-note">
                          {formatINR(collected)} cash + {formatINR(credit)} expense credit
                        </small>
                      )}
                      {advances.map((advance, index) => (
                        <small className="advance-note" key={`${memberId}-advance-${index}`}>
                          {firstName(advance.paidByMemberId)} actually paid {formatINR(advance.amountPaise)} for {firstName(memberId)}
                        </small>
                      ))}
                    </div>
                    <div className="finance-contribution-amount">
                      <strong>{formatINR(collected + credit)}</strong>
                      <span className={outstanding > 0 ? "status-due" : "status-paid"}>
                        {outstanding > 0 ? "DUE" : "DONE"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {appliedFundCredits.length > 0 && (
            <div className="finance-callout">
              <b>Expense credits reduce contribution dues without adding cash.</b>
              <span>
                {appliedFundCredits
                  .map(
                    (credit) =>
                      `${firstName(credit.memberId)} paid ${formatINR(credit.amountPaise)} directly`,
                  )
                  .join(" · ")}. These credits satisfy the named member's target but never enter the cash balance.
              </span>
            </div>
          )}
        </DockAwarePanel>
      )}

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>02 · GROUP ACCOUNTS</span>
            <h2>Two separate ledgers</h2>
          </div>
          <b>{interAccountLinks.length} LINKED RECORD</b>
        </div>
        <p className="finance-section-copy">
          The previous six-person pool and active eight-person pool never share a balance. A transfer between them appears as a receivable in one ledger and the matching payable in the other.
        </p>

        <div className="finance-settlement-block">
          <div className="finance-subhead">
            <b>A · Active 8-person account</b>
            <span>{groupFund?.status || "active"}</span>
          </div>
          <div className="finance-integrity-grid">
            <div><span>PHYSICAL CASH</span><b>{formatINR(groupFundPhysicalCashPaise)}</b></div>
            <div><span>RESERVED</span><b>{formatINR(groupFundReservedPaise)}</b></div>
            <div><span>FREE TO SPEND</span><b>{formatINR(groupFundSpendablePaise)}</b></div>
            <div><span>TARGET COVERED</span><b>{formatINR(groupFundCollectedPaise + groupFundCreditPaise)} / {formatINR(groupFundTargetPaise)}</b></div>
            <div><span>CHARGES</span><b>{formatINR(groupFund?.totalChargedPaise || 0)}</b></div>
            <div><span>PER PERSON COST</span><b>{formatINR(groupFund?.perMemberExpenseSharePaise || 0)}</b></div>
          </div>
          <details className="finance-details">
            <summary>
              <span><b>Active-account records</b><small>contributions, charges and payables</small></span>
              <strong>OPEN</strong>
            </summary>
            <div className="finance-details-body">
              <section className="finance-audit-section">
                <div className="finance-subhead"><b>Current charges</b><span>{groupFund?.charges?.length || 0} records</span></div>
                <div className="finance-audit-list">
                  {(groupFund?.charges || []).map((charge) => (
                    <div key={charge.id}>
                      <span><b>{charge.label}</b><small>{charge.date} · {charge.participantIds?.length || 0} people</small></span>
                      <strong>{formatINR(charge.amountPaise)}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="finance-audit-section">
                <div className="finance-subhead"><b>Reserved reimbursements</b><span>{formatINR(groupFundReservedPaise)}</span></div>
                <div className="finance-audit-list">
                  {interPoolPayables.map((item) => (
                    <div key={item.id}><span><b>{item.label}</b><small>inter-account payable · {item.status}</small></span><strong>{formatINR(item.amountPaise)}</strong></div>
                  ))}
                  {memberPayables.map((item) => (
                    <div key={item.id}><span><b>{item.label}</b><small>member payable · {item.status}</small></span><strong>{formatINR(item.amountPaise)}</strong></div>
                  ))}
                </div>
              </section>
            </div>
          </details>
        </div>

        <div className="finance-settlement-block">
          <div className="finance-subhead">
            <b>B · Previous 6-person account</b>
            <span>historical</span>
          </div>
          <div className="finance-integrity-grid">
            <div><span>CASH CONTRIBUTED</span><b>{formatINR(legacyCollectedPaise)}</b></div>
            <div><span>EXPENSE CREDITS</span><b>{formatINR(legacyCreditPaise)}</b></div>
            <div><span>EFFECTIVE TARGET</span><b>{formatINR(legacyCollectedPaise + legacyCreditPaise)} / {formatINR(legacyTargetPaise)}</b></div>
            <div><span>CONFIRMED SPEND</span><b>{formatINR(legacyConfirmedSpentPaise)}</b></div>
            <div><span>CURRENT PHYSICAL CASH</span><b>{formatINR(legacyCurrentPhysicalPaise)}</b></div>
            <div><span>RECEIVABLE</span><b>{formatINR(legacyReceivablePaise)}</b></div>
            <div><span>ECONOMIC BALANCE</span><b>{formatINR(legacyEconomicBalancePaise)}</b></div>
            <div><span>AUDIT VARIANCE</span><b>{legacyAuditVariancePaise < 0 ? "−" : ""}{formatINR(Math.abs(legacyAuditVariancePaise))}</b></div>
          </div>
          <details className="finance-details">
            <summary>
              <span><b>Historical-account records</b><small>confirmed outflows and post-close advance</small></span>
              <strong>OPEN</strong>
            </summary>
            <div className="finance-details-body">
              <section className="finance-audit-section">
                <div className="finance-subhead"><b>Confirmed merchant outflows</b><span>{formatINR(legacyConfirmedSpentPaise)}</span></div>
                <div className="finance-audit-list">
                  {legacyConfirmedOutflows.map((item) => (
                    <div key={item.id}><span><b>{item.label}</b><small>{item.date} · historical pool</small></span><strong>{formatINR(item.amountPaise)}</strong></div>
                  ))}
                </div>
              </section>
              {(legacyGroupFund?.postCloseAdvances || []).length > 0 && (
                <section className="finance-audit-section">
                  <div className="finance-subhead"><b>Post-close advances</b><span>{formatINR(legacyReceivablePaise)} receivable</span></div>
                  <div className="finance-audit-list">
                    {(legacyGroupFund.postCloseAdvances || []).map((item) => (
                      <div key={item.id}><span><b>{item.label}</b><small>{item.date} · {item.status}</small></span><strong>{formatINR(item.amountPaise)}</strong></div>
                    ))}
                  </div>
                </section>
              )}
              <p className="finance-footnote">
                The ₹462 variance is an audit-control difference, not a merchant expense. The old pool's last observed boundary was {formatINR(legacyGroupFund?.closedObservedBalancePaise || 0)} before the post-close taxi advance.
              </p>
            </div>
          </details>
        </div>

        {interAccountLinks.map((link) => (
          <div className="finance-callout" key={link.id}>
            <b>Inter-account link · {formatINR(link.amountPaise)} · {link.status}</b>
            <span>Previous 6-person pool → active 8-person account for Taxi 1. The old ledger records a receivable and the active ledger records the matching payable. This amount is not counted twice.</span>
          </div>
        ))}
      </DockAwarePanel>

      <DockAwarePanel className="panel finance-expenses-panel">
        <div className="finance-section-heading">
          <div>
            <span>03 · EXPENSES</span>
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
            <strong>{formatINR(allGroupFundExpensePaise)}</strong>
            <small>confirmed merchant payments from either group cash ledger</small>
          </article>
          <article className="finance-overview-card">
            <span>OTHER FUNDING</span>
            <strong>{formatINR(directlyFundedExpensePaise)}</strong>
            <small>personal payments, credits and advances</small>
          </article>
        </div>

        <div className="finance-spend-list">
          {displayExpenses.map((expense) => {
            const payer = member(expense.payerId),
              payerLabel =
                expense.fundingSource === "groupFund"
                  ? expense.groupFundId === groupFund?.id
                    ? "Active 8-person group cash"
                    : "Previous group cash"
                  : expense.fundingSource === "groupFundMemberCredit"
                    ? `${payer?.name || "Member"} · credited to active pool target`
                    : expense.fundingSource === "groupFundMemberAdvance"
                      ? `${payer?.name || "Member"} · paid for active group`
                      : expense.fundingSource === "groupFundExternalAdvance"
                        ? "Previous 6-person pool · reimbursable by active group"
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
                    {expense.date} · {payerLabel} · {participantLabel(expense)} involved
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
            <span>04 · SETTLEMENTS</span>
            <h2>Money still owed</h2>
          </div>
          <b>{formatINR(groupFundReservedPaise)} GROUP PAYABLES</b>
        </div>

        <div className="finance-settlement-explainer">
          <b>Contribution dues, group-account reimbursements and friend balances are separate.</b>
          <span>
            “To group cash” is a member's contribution target. Group-account reimbursements are liabilities reserved from the active pool. “Between friends” is the personal settlement ledger, including money Vyas fronted for Milan.
          </span>
        </div>

        {groupFundReservedPaise > 0 && (
          <div className="finance-callout">
            <b>Active group must reimburse {formatINR(groupFundReservedPaise)}.</b>
            <span>{payableSummary}. These amounts are already excluded from the {formatINR(groupFundSpendablePaise)} spendable balance.</span>
          </div>
        )}

        <div className="finance-settlement-block">
          <div className="finance-subhead">
            <b>A · Still owed to active group cash</b>
            <span>{formatINR(groupFundOutstandingPaise)} total</span>
          </div>
          {poolDebtors.length ? (
            <div className="finance-pool-due-list">
              {poolDebtors.map((memberId) => (
                <div key={memberId}>
                  <span>
                    <b>{member(memberId)?.name || memberId}</b>
                    <small>
                      remaining after {formatINR(groupFundCollectedByMember[memberId] || 0)} cash
                      {(groupFundCreditByMember[memberId] || 0) > 0
                        ? ` + ${formatINR(groupFundCreditByMember[memberId])} expense credit`
                        : ""}
                    </small>
                  </span>
                  <strong>{formatINR(groupFundOutstandingByMember[memberId])}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="finance-empty-state">
              <b>Active pool is fully funded.</b>
              <span>No contribution is currently outstanding to the eight-person account.</span>
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
          Group-account payables are never merged into personal settlement. This prevents the ₹200 old-pool taxi advance, Pratham's ₹200 taxi payment and Tirth's ₹40 extra pass payment from being double-counted.
        </p>
      </DockAwarePanel>

      {coveragePolicy && (
        <DockAwarePanel className="panel">
          <div className="finance-section-heading">
            <div>
              <span>MILAN → DEVGNA</span>
              <h2>Trip-end repayment</h2>
            </div>
            <b>{formatINR(coveragePolicy.currentKnownLiabilityPaise || 0)}</b>
          </div>
          <p className="finance-section-copy">
            Vyas Devgna is the actual payer for Milan's trip costs. Milan remains the beneficiary in each original transaction, and repays Vyas after the trip. This personal liability is separate from both group-account cash balances.
          </p>
          <div className="finance-audit-list">
            {(coveragePolicy.currentKnownLiabilityBreakdown || []).map((item) => (
              <div key={item.id}>
                <span>
                  <b>{item.label}</b>
                  <small>
                    {item.sourceGroupFundId === "group-fund-six-sep14"
                      ? "previous 6-person account"
                      : item.sourceGroupFundId === "group-fund-eight-sep15"
                        ? "active 8-person account"
                        : "personal expense"}
                  </small>
                </span>
                <strong>{formatINR(item.amountPaise)}</strong>
              </div>
            ))}
          </div>
          <p className="finance-footnote">
            Current known total: {formatINR(coveragePolicy.currentKnownLiabilityPaise || 0)}. Any later Milan cost paid by Devgna should be added here once and only once.
          </p>
        </DockAwarePanel>
      )}

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>MEMBER BALANCES</span>
            <h2>Friend-to-friend balance by person</h2>
          </div>
          <b>EXCLUDES GROUP PAYABLES</b>
        </div>
        <p className="finance-section-copy">
          This is the personal settlement ledger only. Group-account contributions, expense credits and active group reimbursements are shown separately above.
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
                      {person.id === "milan" && coveragePolicy
                        ? `Devgna covers Milan; current known trip-end liability ${formatINR(coveragePolicy.currentKnownLiabilityPaise || 0)}`
                        : row.groupFundAdvanceCoveredPaise > 0
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
          Budget = {formatINR(data.trip.budget.targetPerPersonPaise)} × {snapshot.budgetMembers.length} finance members. Contributions and expense credits are funding records, not extra expenses.
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
            <small>exact allocation and ledger checks</small>
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
                <span>ACTIVE LEDGER CHECK</span>
                <h3>{ledgerBalanced ? "Balanced to the paisa" : "Review required"}</h3>
              </div>
            </div>
            <div className="finance-integrity-grid">
              <div><span>PERSONALLY SETTLED COSTS</span><b>{formatINR(settlement.merchantPaidPaise)}</b></div>
              <div><span>ACTIVE GROUP-CASH COSTS</span><b>{formatINR(activeGroupFundExpensePaise)}</b></div>
              <div><span>ACTIVE POOL CREDITS</span><b>{formatINR(groupFundCreditPaise)}</b></div>
              <div><span>PERSONAL ALLOCATION DIFFERENCE</span><b>{formatINR(Math.abs(allocationDifferencePaise))}</b></div>
              <div><span>ACTIVE CASH DIFFERENCE</span><b>{formatINR(Math.abs(groupFundReconciliationPaise))}</b></div>
              <div><span>ACTIVE CREDIT DIFFERENCE</span><b>{formatINR(Math.abs(memberCreditReconciliationPaise))}</b></div>
              <div><span>NET BALANCE SUM</span><b>{formatINR(Math.abs(settlement.netBalancePaise))}</b></div>
              <div><span>MEMBER CONTRIBUTION ADVANCES</span><b>{formatINR(settlement.groupFundAdvancePaise)}</b></div>
            </div>
            <p className="finance-footnote">
              The active-account audit is scoped only to the eight-person ledger. The historical six-person pool is audited separately above, so its spending cannot pollute the active cash check.
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}
