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
const safeAmount = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

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

function fundingLabel(part) {
  if (part.kind === "new-group-cash") return "active group cash";
  if (part.kind === "old-group-advance") return "previous 6-person pool advance";
  if (part.kind === "member-advance")
    return `${firstName(part.memberId)} personal advance`;
  if (part.kind === "member-contribution-credit")
    return `${firstName(part.memberId)} contribution credit`;
  return String(part.kind || "funding").replaceAll("-", " ");
}

function LedgerRows({ rows, empty = "No records." }) {
  if (!rows.length)
    return (
      <div className="finance-empty-state">
        <b>{empty}</b>
      </div>
    );

  return (
    <div className="finance-audit-list">
      {rows.map((row) => (
        <div key={row.id}>
          <span>
            <b>{row.label}</b>
            <small>{row.meta}</small>
            {row.note && <small>{row.note}</small>}
            <small>ID · {row.id}</small>
          </span>
          <strong>{row.sign || ""}{formatINR(row.amountPaise)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function Finance({ expenses, setSheet }) {
  const snapshot = useMemo(() => buildFinanceSnapshot(data, expenses), [expenses]),
    [copied, setCopied] = useState(null),
    [accountView, setAccountView] = useState("active"),
    settlement = snapshot.settlement,
    activeFund = data.finance?.groupFund,
    legacyFund = data.finance?.legacyGroupFund,
    interAccountLinks = data.finance?.interAccountLinks || [],
    coveragePolicy = (data.finance?.memberCoveragePolicies || []).find(
      (item) => item.id === "vyas-covers-milan-trip",
    );

  const activeContributions = (activeFund?.contributions || []).filter(
      (item) => item.status === "received",
    ),
    activeCredits = (activeFund?.credits || []).filter(
      (item) => item.status === "applied",
    ),
    activeOutflows = (activeFund?.outflows || []).filter(
      (item) => item.status === "paid",
    ),
    activePoolPayables = (activeFund?.interPoolPayables || []).filter(
      (item) => item.status === "due",
    ),
    activeMemberPayables = (activeFund?.memberPayables || []).filter(
      (item) => item.status === "due",
    ),
    activeMembers = activeFund?.targetMemberIds || snapshot.budgetMembers,
    activeTargetPerMember = safeAmount(activeFund?.targetPerMemberPaise),
    activeTarget = activeTargetPerMember * activeMembers.length,
    activeCashCollected = activeContributions.reduce(
      (sum, item) => sum + safeAmount(item.amountPaise),
      0,
    ),
    activeCreditTotal = activeCredits.reduce(
      (sum, item) => sum + safeAmount(item.amountPaise),
      0,
    ),
    activeCashOut = activeOutflows.reduce(
      (sum, item) => sum + safeAmount(item.amountPaise),
      0,
    ),
    activePhysicalCash = Number.isSafeInteger(activeFund?.physicalCashBalancePaise)
      ? activeFund.physicalCashBalancePaise
      : activeCashCollected - activeCashOut,
    activeEndSettlement = Number.isSafeInteger(activeFund?.endSettlementPayablesPaise)
      ? activeFund.endSettlementPayablesPaise
      : [...activePoolPayables, ...activeMemberPayables].reduce(
          (sum, item) => sum + safeAmount(item.amountPaise),
          0,
        ),
    activeSpendable = Number.isSafeInteger(activeFund?.spendableBalancePaise)
      ? activeFund.spendableBalancePaise
      : Math.max(0, activePhysicalCash),
    activeContributionByMember = Object.fromEntries(
      activeMembers.map((id) => [id, 0]),
    ),
    activeCreditByMember = Object.fromEntries(
      activeMembers.map((id) => [id, 0]),
    );

  for (const item of activeContributions)
    activeContributionByMember[item.memberId] =
      (activeContributionByMember[item.memberId] || 0) + safeAmount(item.amountPaise);
  for (const item of activeCredits)
    activeCreditByMember[item.memberId] =
      (activeCreditByMember[item.memberId] || 0) + safeAmount(item.amountPaise);

  const activeOutstandingByMember = Object.fromEntries(
      activeMembers.map((id) => [
        id,
        Math.max(
          0,
          activeTargetPerMember -
            (activeContributionByMember[id] || 0) -
            (activeCreditByMember[id] || 0),
        ),
      ]),
    ),
    activeOutstanding = Object.values(activeOutstandingByMember).reduce(
      (sum, amount) => sum + amount,
      0,
    );

  const legacyContributions = (legacyFund?.contributions || []).filter(
      (item) => item.status === "received",
    ),
    legacyCredits = (legacyFund?.credits || []).filter(
      (item) => item.status === "applied",
    ),
    legacyOutflows = (legacyFund?.outflows || []).filter(
      (item) => item.status === "paid",
    ),
    legacyMerchantOutflows = legacyOutflows.filter(
      (item) => item.category !== "reconciliation",
    ),
    legacyAuditRows = legacyOutflows.filter(
      (item) => item.category === "reconciliation",
    ),
    legacyContributionTotal = legacyContributions.reduce(
      (sum, item) => sum + safeAmount(item.amountPaise),
      0,
    ),
    legacyCreditTotal = legacyCredits.reduce(
      (sum, item) => sum + safeAmount(item.amountPaise),
      0,
    ),
    legacyConfirmedSpend = legacyMerchantOutflows.reduce(
      (sum, item) => sum + safeAmount(item.amountPaise),
      0,
    ),
    legacyAuditControlTotal = legacyAuditRows.reduce(
      (sum, item) => sum + safeAmount(item.amountPaise),
      0,
    ),
    legacyTarget =
      safeAmount(legacyFund?.targetPerMemberPaise) *
      (legacyFund?.targetMemberIds || []).length,
    legacyPhysicalCash = Number.isSafeInteger(legacyFund?.currentPhysicalBalancePaise)
      ? legacyFund.currentPhysicalBalancePaise
      : 0,
    legacyReceivable = safeAmount(legacyFund?.interPoolReceivablePaise),
    legacyEconomicBalance = Number.isSafeInteger(legacyFund?.economicBalancePaise)
      ? legacyFund.economicBalancePaise
      : legacyPhysicalCash + legacyReceivable,
    legacyAuditVariance = Number.isSafeInteger(legacyFund?.auditVariancePaise)
      ? legacyFund.auditVariancePaise
      : 0;

  const activeContributionRows = activeContributions.map((item) => ({
      id: item.id,
      label: `${member(item.memberId)?.name || item.memberId} contribution`,
      amountPaise: item.amountPaise,
      meta:
        (item.paidByMemberId || item.memberId) === item.memberId
          ? `${item.date} · cash received from ${firstName(item.memberId)}`
          : `${item.date} · credited to ${firstName(item.memberId)} · physically paid by ${firstName(item.paidByMemberId)}`,
      note: item.note,
      sign: "+",
    })),
    activeCreditRows = activeCredits.map((item) => ({
      id: item.id,
      label: `${member(item.memberId)?.name || item.memberId} contribution credit`,
      amountPaise: item.amountPaise,
      meta: `${item.date} · counts toward contribution target · no cash entered account`,
      note: item.note,
    })),
    activeOutflowRows = activeOutflows.map((item) => ({
      id: item.id,
      label: item.label || "Active-group cash outflow",
      amountPaise: item.amountPaise,
      meta: `${item.date} · cash physically left active account`,
      note: item.note,
      sign: "−",
    })),
    activeLiabilityRows = [
      ...activePoolPayables.map((item) => ({
        id: item.id,
        label: item.label || "Inter-account payable",
        amountPaise: item.amountPaise,
        meta: `${item.date} · trip-end settlement · ${item.status} · payable to previous 6-person pool`,
        note: item.note,
      })),
      ...activeMemberPayables.map((item) => ({
        id: item.id,
        label: item.label || `Reimburse ${firstName(item.memberId)}`,
        amountPaise: item.amountPaise,
        meta: `${item.date} · trip-end settlement · ${item.status} · payable to ${firstName(item.memberId)}`,
        note: item.note,
      })),
    ],
    legacyContributionRows = legacyContributions.map((item) => ({
      id: item.id,
      label: `${member(item.memberId)?.name || item.memberId} contribution`,
      amountPaise: item.amountPaise,
      meta:
        (item.paidByMemberId || item.memberId) === item.memberId
          ? `${item.date} · ${item.phase || "old account"} · paid by ${firstName(item.memberId)}`
          : `${item.date} · ${item.phase || "old account"} · credited to ${firstName(item.memberId)} · physically paid by ${firstName(item.paidByMemberId)}`,
      note: item.note,
      sign: "+",
    })),
    legacyCreditRows = legacyCredits.map((item) => ({
      id: item.id,
      label: `${member(item.memberId)?.name || item.memberId} contribution credit`,
      amountPaise: item.amountPaise,
      meta: `${item.date} · direct expense credit · no cash entered old pool`,
      note: item.note,
    })),
    legacyOutflowRows = legacyMerchantOutflows.map((item) => ({
      id: item.id,
      label: item.label || "Historical group expense",
      amountPaise: item.amountPaise,
      meta: `${item.date} · confirmed merchant outflow${item.category ? ` · ${item.category}` : ""}`,
      note: item.note,
      sign: "−",
    })),
    legacyAuditControlRows = legacyAuditRows.map((item) => ({
      id: item.id,
      label: item.label || "Cash-control reconciliation",
      amountPaise: item.amountPaise,
      meta: `${item.date} · audit control only · not merchant spend`,
      note: item.note,
      sign: "−",
    })),
    legacyPostCloseRows = (legacyFund?.postCloseAdvances || []).map((item) => ({
      id: item.id,
      label: item.label || "Post-close advance",
      amountPaise: item.amountPaise,
      meta: `${item.date} · receivable from active 8-person account · ${item.status}`,
      note: item.note,
      sign: "−",
    }));

  const tripGroupCashExpensePaise = snapshot.paid
      .filter(
        (expense) =>
          expense.fundingSource === "groupFund" ||
          expense.fundingSource === "groupFundExternalAdvance",
      )
      .reduce((sum, expense) => sum + safeAmount(expense.amountPaise), 0),
    otherFundingExpensePaise =
      snapshot.recordedPaidPaise - tripGroupCashExpensePaise,
    activeDirectGroupCashExpensePaise = snapshot.paid
      .filter(
        (expense) =>
          expense.fundingSource === "groupFund" &&
          expense.groupFundId === activeFund?.id,
      )
      .reduce((sum, expense) => sum + safeAmount(expense.amountPaise), 0),
    activeCreditExpensePaise = snapshot.paid
      .filter(
        (expense) =>
          expense.fundingSource === "groupFundMemberCredit" &&
          expense.groupFundId === activeFund?.id,
      )
      .reduce((sum, expense) => sum + safeAmount(expense.amountPaise), 0),
    activeCashDifference = activeDirectGroupCashExpensePaise - activeCashOut,
    activeCreditDifference = activeCreditExpensePaise - activeCreditTotal,
    allocationDifference =
      settlement.merchantPaidPaise +
      settlement.unassignedPaidPaise -
      settlement.allocatedSharePaise,
    ledgerBalanced =
      allocationDifference === 0 &&
      settlement.netBalancePaise === 0 &&
      activeCashDifference === 0 &&
      activeCreditDifference === 0,
    budgetPercent = formatPercentFromBasisPoints(snapshot.forecastBudgetBasisPoints),
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
    receivedPayments = (data.reimbursements || []).filter(
      (item) => item.status === "received",
    ),
    milanDirectTransfer = (settlement.transfers || []).find(
      (item) =>
        item.from === "milan" &&
        item.to === "vyas" &&
        item.policyId === "vyas-covers-milan-trip",
    );

  const copySettlement = async (transfer) => {
    const text = `${member(transfer.from)?.name} pays ${member(transfer.to)?.name} ${formatINR(transfer.amountPaise)} for the Mumbai trip settlement.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${transfer.from}-${transfer.to}-${transfer.amountPaise}`);
      vibrate(28);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  };

  const switchAccount = (next) => {
    setAccountView(next);
    vibrate(18);
  };

  return (
    <section className="page finance-page">
      <div className="page-title finance-title">
        <span>MONEY</span>
        <h1>Finance</h1>
        <p>Two separate group accounts, one trip-wide expense ledger, and explicit personal settlement.</p>
      </div>

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>GROUP ACCOUNTS</span>
            <h2>Choose one ledger</h2>
          </div>
          <b>NEVER MERGED</b>
        </div>
        <div
          role="tablist"
          aria-label="Group finance accounts"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          <button
            className="finance-secondary-button"
            role="tab"
            aria-selected={accountView === "active"}
            onClick={() => switchAccount("active")}
            style={{
              minHeight: 48,
              background: accountView === "active" ? "var(--finance-blue-soft)" : undefined,
              borderColor: accountView === "active" ? "#9fb6cf" : undefined,
            }}
          >
            8-person · ACTIVE · {formatINR(activeSpendable)} spendable
          </button>
          <button
            className="finance-secondary-button"
            role="tab"
            aria-selected={accountView === "legacy"}
            onClick={() => switchAccount("legacy")}
            style={{
              minHeight: 48,
              background: accountView === "legacy" ? "var(--finance-blue-soft)" : undefined,
              borderColor: accountView === "legacy" ? "#9fb6cf" : undefined,
            }}
          >
            6-person · HISTORICAL · {formatINR(legacyPhysicalCash)} on hand
          </button>
        </div>
        <p className="finance-footnote">
          Switching changes only the dashboard being viewed. Balances and records remain independent. The only current cross-account transaction is the explicit ₹200 taxi advance.
        </p>
      </DockAwarePanel>

      {accountView === "active" && activeFund && (
        <DockAwarePanel className="panel finance-pool-panel finance-cash-first">
          <div className="finance-section-heading">
            <div>
              <span>ACTIVE · 8 PEOPLE</span>
              <h2>Current group account</h2>
            </div>
            <b>{formatINR(activeSpendable)} SPENDABLE</b>
          </div>

          <div className="finance-cash-hero">
            <span>SPENDABLE NOW</span>
            <strong>{formatINR(activeSpendable)}</strong>
            <small>
              All {formatINR(activePhysicalCash)} physical cash on hand is spendable during the trip. {formatINR(activeEndSettlement)} of reimbursements is tracked separately for trip-end settlement and is not held back as a reserve.
            </small>
          </div>

          <div className="finance-overview-grid">
            <article className="finance-overview-card cash">
              <span>CASH ON HAND</span>
              <strong>{formatINR(activePhysicalCash)}</strong>
              <small>physical active-group cash now</small>
            </article>
            <article className="finance-overview-card">
              <span>END SETTLEMENT</span>
              <strong>{formatINR(activeEndSettlement)}</strong>
              <small>tracked separately · not withheld</small>
            </article>
            <article className="finance-overview-card primary">
              <span>SPENDABLE</span>
              <strong>{formatINR(activeSpendable)}</strong>
              <small>equals cash on hand during the trip</small>
            </article>
          </div>

          <div className="finance-integrity-grid">
            <div><span>CASH CONTRIBUTIONS</span><b>{formatINR(activeCashCollected)}</b></div>
            <div><span>CONTRIBUTION CREDITS</span><b>{formatINR(activeCreditTotal)}</b></div>
            <div><span>TARGET COVERED</span><b>{formatINR(activeCashCollected + activeCreditTotal)} / {formatINR(activeTarget)}</b></div>
            <div><span>CONTRIBUTION DUE</span><b>{formatINR(activeOutstanding)}</b></div>
            <div><span>ACCOUNT CHARGES</span><b>{formatINR(activeFund.totalChargedPaise || 0)}</b></div>
            <div><span>PER-PERSON CHARGE SHARE</span><b>{formatINR(activeFund.perMemberExpenseSharePaise || 0)}</b></div>
          </div>

          <div className="finance-cash-subsection">
            <div className="finance-subhead">
              <b>Member contribution status</b>
              <span>{activeMembers.length - Object.values(activeOutstandingByMember).filter(Boolean).length}/{activeMembers.length} complete</span>
            </div>
            <div className="finance-contribution-list">
              {activeMembers.map((id) => {
                const cash = activeContributionByMember[id] || 0,
                  credit = activeCreditByMember[id] || 0,
                  outstanding = activeOutstandingByMember[id] || 0,
                  contribution = activeContributions.find((item) => item.memberId === id),
                  paidBy = contribution?.paidByMemberId || id;
                return (
                  <div className="finance-contribution-row" key={id}>
                    <span className="finance-member-avatar">{member(id)?.initials || "?"}</span>
                    <div>
                      <b>{member(id)?.name || id}</b>
                      <small>
                        {cash > 0 ? `${formatINR(cash)} cash` : "₹0 cash"}
                        {credit > 0 ? ` + ${formatINR(credit)} credit` : ""}
                      </small>
                      {paidBy !== id && cash > 0 && (
                        <small className="advance-note">
                          physically paid by {firstName(paidBy)} for {firstName(id)} · personal debt, not group due
                        </small>
                      )}
                    </div>
                    <div className="finance-contribution-amount">
                      <strong>{formatINR(cash + credit)}</strong>
                      <span className={outstanding ? "status-due" : "status-paid"}>
                        {outstanding ? `${formatINR(outstanding)} DUE` : "DONE"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Cash contribution ledger</b><span>{activeContributionRows.length} records</span></div>
            <LedgerRows rows={activeContributionRows} />
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Contribution-credit ledger</b><span>{formatINR(activeCreditTotal)}</span></div>
            <LedgerRows rows={activeCreditRows} empty="No contribution credits." />
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Cash-out ledger</b><span>{formatINR(activeCashOut)} physically paid</span></div>
            <LedgerRows rows={activeOutflowRows} empty="No cash has left this account." />
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Expense / charge ledger</b><span>{activeFund.charges?.length || 0} charges</span></div>
            <div className="finance-spend-list">
              {(activeFund.charges || []).map((charge) => (
                <div className="finance-spend-row" key={charge.id}>
                  <div>
                    <b>{charge.label}</b>
                    <small>{charge.date} · {charge.participantIds?.length || 0} participants · ID {charge.id}</small>
                    <small>
                      funding · {(charge.fundingBreakdown || []).map(fundingLabel).join(" + ")}
                    </small>
                    {charge.note && <small>{charge.note}</small>}
                  </div>
                  <strong>{formatINR(charge.amountPaise)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>End-of-trip settlements</b><span>{formatINR(activeEndSettlement)} tracked</span></div>
            <LedgerRows rows={activeLiabilityRows} empty="No trip-end settlements." />
          </div>

          {interAccountLinks.map((link) => (
            <div className="finance-callout" key={link.id}>
              <b>Linked to previous 6-person ledger · {formatINR(link.amountPaise)}</b>
              <span>{link.note}</span>
              <button className="finance-secondary-button" onClick={() => switchAccount("legacy")}>
                Open matching old-pool receivable
              </button>
            </div>
          ))}
        </DockAwarePanel>
      )}

      {accountView === "legacy" && legacyFund && (
        <DockAwarePanel className="panel finance-pool-panel finance-cash-first">
          <div className="finance-section-heading">
            <div>
              <span>HISTORICAL · 6 PEOPLE</span>
              <h2>Previous group account</h2>
            </div>
            <b>{formatINR(legacyPhysicalCash)} ON HAND</b>
          </div>

          <div className="finance-cash-hero">
            <span>CURRENT PHYSICAL CASH</span>
            <strong>{formatINR(legacyPhysicalCash)}</strong>
            <small>
              Historical account. {formatINR(legacyReceivable)} is still receivable from the active account, so economic balance remains {formatINR(legacyEconomicBalance)}. Do not use this pool for new expenses unless explicitly specified.
            </small>
          </div>

          <div className="finance-overview-grid">
            <article className="finance-overview-card cash">
              <span>CASH ON HAND</span>
              <strong>{formatINR(legacyPhysicalCash)}</strong>
              <small>after the post-close ₹200 taxi advance</small>
            </article>
            <article className="finance-overview-card">
              <span>RECEIVABLE</span>
              <strong>{formatINR(legacyReceivable)}</strong>
              <small>owed by active 8-person account</small>
            </article>
            <article className="finance-overview-card primary">
              <span>ECONOMIC BALANCE</span>
              <strong>{formatINR(legacyEconomicBalance)}</strong>
              <small>cash + receivable</small>
            </article>
          </div>

          <div className="finance-integrity-grid">
            <div><span>CASH CONTRIBUTED</span><b>{formatINR(legacyContributionTotal)}</b></div>
            <div><span>EXPENSE CREDITS</span><b>{formatINR(legacyCreditTotal)}</b></div>
            <div><span>TARGET COVERED</span><b>{formatINR(legacyContributionTotal + legacyCreditTotal)} / {formatINR(legacyTarget)}</b></div>
            <div><span>CONFIRMED MERCHANT SPEND</span><b>{formatINR(legacyConfirmedSpend)}</b></div>
            <div><span>AUDIT CONTROL</span><b>{formatINR(legacyAuditControlTotal)}</b></div>
            <div><span>UNRESOLVED VARIANCE</span><b>{legacyAuditVariance < 0 ? "−" : ""}{formatINR(Math.abs(legacyAuditVariance))}</b></div>
          </div>

          <div className="finance-callout">
            <b>Cash checkpoint · {formatINR(legacyFund.closedObservedBalancePaise || 0)}</b>
            <span>
              This was the last confirmed physical count before the ₹200 post-close taxi advance. The ₹462 variance is retained as an audit-control difference and is not presented as merchant spending.
            </span>
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Cash contribution ledger</b><span>{legacyContributionRows.length} records</span></div>
            <LedgerRows rows={legacyContributionRows} />
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Direct-expense credit ledger</b><span>{formatINR(legacyCreditTotal)}</span></div>
            <LedgerRows rows={legacyCreditRows} empty="No contribution credits." />
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Confirmed merchant outflows</b><span>{formatINR(legacyConfirmedSpend)}</span></div>
            <LedgerRows rows={legacyOutflowRows} />
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Audit-control records</b><span>not merchant spend</span></div>
            <LedgerRows rows={legacyAuditControlRows} empty="No audit-control records." />
          </div>

          <div className="finance-settlement-block">
            <div className="finance-subhead"><b>Post-close activity</b><span>{formatINR(legacyReceivable)} receivable</span></div>
            <LedgerRows rows={legacyPostCloseRows} empty="No post-close activity." />
          </div>

          {interAccountLinks.map((link) => (
            <div className="finance-callout" key={link.id}>
              <b>Linked to active 8-person ledger · {formatINR(link.amountPaise)}</b>
              <span>{link.note}</span>
              <button className="finance-secondary-button" onClick={() => switchAccount("active")}>
                Open matching active-pool payable
              </button>
            </div>
          ))}
        </DockAwarePanel>
      )}

      {coveragePolicy && (
        <DockAwarePanel className="panel finance-action-panel">
          <div className="finance-section-heading">
            <div>
              <span>MILAN → DEVGNA</span>
              <h2>Trip-end repayment</h2>
            </div>
            <b>{formatINR(coveragePolicy.currentKnownLiabilityPaise || 0)}</b>
          </div>
          <p className="finance-section-copy">
            Devgna pays Milan's trip costs. Milan stays the beneficiary in the source records, while the actual advances remain a personal Milan → Devgna liability. This debt never changes either group account's cash unless the source transaction itself belongs to that account.
          </p>
          <div className="finance-audit-list">
            {(coveragePolicy.currentKnownLiabilityBreakdown || []).map((item) => (
              <div key={item.id}>
                <span>
                  <b>{item.label}</b>
                  <small>
                    {item.sourceGroupFundId === "group-fund-six-sep14"
                      ? "source · previous 6-person ledger"
                      : item.sourceGroupFundId === "group-fund-eight-sep15"
                        ? "source · active 8-person ledger"
                        : "source · personal trip expense"}
                  </small>
                  <small>{(item.sourceRecordIds || []).join(" · ")}</small>
                </span>
                <strong>{formatINR(item.amountPaise)}</strong>
              </div>
            ))}
          </div>
          <div className="finance-callout">
            <b>Direct trip-end transfer · Milan pays Devgna {formatINR(milanDirectTransfer?.amountPaise || 0)}</b>
            <span>
              The settlement engine pins this debt directly to Devgna instead of netting Milan through another friend. Future Milan costs paid by Devgna must be added once to the source ledger and once to this liability breakdown.
            </span>
          </div>
        </DockAwarePanel>
      )}

      <DockAwarePanel className="panel finance-expenses-panel">
        <div className="finance-section-heading">
          <div>
            <span>TRIP-WIDE EXPENSE LEDGER</span>
            <h2>All confirmed paid expenses</h2>
          </div>
          <button className="finance-secondary-button" onClick={() => setSheet("expense")}>
            Add draft
          </button>
        </div>

        <div className="finance-overview-grid finance-expense-summary">
          <article className="finance-overview-card primary">
            <span>TOTAL CONFIRMED SPEND</span>
            <strong>{formatINR(snapshot.recordedPaidPaise)}</strong>
            <small>reconciliation-only rows excluded</small>
          </article>
          <article className="finance-overview-card cash">
            <span>FUNDED BY GROUP CASH</span>
            <strong>{formatINR(tripGroupCashExpensePaise)}</strong>
            <small>includes the old-pool ₹200 external advance</small>
          </article>
          <article className="finance-overview-card">
            <span>OTHER FUNDING</span>
            <strong>{formatINR(otherFundingExpensePaise)}</strong>
            <small>personal payments, credits and member advances</small>
          </article>
        </div>

        <div className="finance-spend-list">
          {displayExpenses.map((expense) => {
            const payer = member(expense.payerId),
              payerLabel =
                expense.fundingSource === "groupFund"
                  ? expense.groupFundId === activeFund?.id
                    ? "active 8-person group cash"
                    : "previous 6-person group cash"
                  : expense.fundingSource === "groupFundExternalAdvance"
                    ? "previous 6-person pool · advance for active account"
                    : expense.fundingSource === "groupFundMemberCredit"
                      ? `${payer?.name || "member"} · contribution-credit portion`
                      : expense.fundingSource === "groupFundMemberAdvance"
                        ? `${payer?.name || "member"} · advance for active account`
                        : payer?.name || "unknown payer",
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
                        .map(([key, value]) => `${componentLabels[key] || key} ${formatINR(value)}`)
                        .join(" · ")}
                    </small>
                  )}
                  {expense.note && <small>{expense.note}</small>}
                  <small>ID · {expense.id}</small>
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

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>PERSONAL SETTLEMENT</span>
            <h2>Who pays whom</h2>
          </div>
          <b>{settlement.transfers.length} TRANSFERS</b>
        </div>
        <p className="finance-section-copy">
          Group-account payables are not mixed into this list. Milan's full current liability is deliberately routed directly to Devgna.
        </p>
        {settlement.transfers.length ? (
          <div className="settlement-simple-list">
            {settlement.transfers.map((transfer, index) => {
              const key = `${transfer.from}-${transfer.to}-${transfer.amountPaise}`;
              return (
                <div className="settlement-simple-row" key={`${key}-${index}`}>
                  <div className="settlement-person-flow">
                    <span className="settlement-avatar">{member(transfer.from)?.initials || "?"}</span>
                    <div>
                      <small>
                        {transfer.policyId === "vyas-covers-milan-trip"
                          ? "trip-end direct repayment"
                          : `${firstName(transfer.from)} pays`}
                      </small>
                      <b>{firstName(transfer.from)} → {firstName(transfer.to)}</b>
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
            <b>No personal transfer is currently needed.</b>
          </div>
        )}
      </DockAwarePanel>

      <DockAwarePanel className="panel">
        <div className="finance-section-heading">
          <div>
            <span>MEMBER BALANCES</span>
            <h2>Personal balance by person</h2>
          </div>
          <b>GROUP PAYABLES EXCLUDED</b>
        </div>
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
                        ? `all current Milan trip debt is payable to Devgna · ${formatINR(coveragePolicy.currentKnownLiabilityPaise || 0)}`
                        : row.groupFundAdvanceCoveredPaise > 0
                          ? `${formatINR(row.groupFundAdvanceCoveredPaise)} of group contributions were fronted for them`
                          : row.groupFundAdvancePaidPaise > 0
                            ? `fronted ${formatINR(row.groupFundAdvancePaidPaise)} of group contributions for others`
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
          <div><span>SPENT</span><b>{formatINR(snapshot.corePaidPaise)}</b></div>
          <div><span>PLANNED</span><b>{formatINR(snapshot.corePlannedPaise)}</b></div>
          <div>
            <span>BUDGET LEFT</span>
            <b>{snapshot.overCorePaise ? `-${formatINR(snapshot.overCorePaise)}` : formatINR(snapshot.remainingCorePaise)}</b>
          </div>
        </div>
        <p className="finance-footnote">
          Budget = {formatINR(data.trip.budget.targetPerPersonPaise)} × {snapshot.budgetMembers.length} finance members. Funding records are not extra expenses.
        </p>
      </DockAwarePanel>

      {snapshot.personalPaidPaise > 0 && (
        <div className="finance-scope-note">
          <b>{formatINR(snapshot.personalPaidPaise)} outside the shared budget</b>
          <span>Still recorded as trip spending, but not charged to the shared budget unless participants explicitly place it there.</span>
        </div>
      )}

      <details className="finance-details">
        <summary>
          <span>
            <b>Audit & bookkeeping</b>
            <small>exact allocation, reimbursements and scoped ledger checks</small>
          </span>
          <strong>{ledgerBalanced ? "BALANCED" : "CHECK"}</strong>
        </summary>
        <div className="finance-details-body">
          {receivedPayments.length > 0 && (
            <section className="finance-audit-section">
              <div className="finance-subhead"><b>Received reimbursements</b><span>{formatINR(settlement.confirmedReimbursementPaise)}</span></div>
              <div className="finance-audit-list">
                {receivedPayments.map((payment) => (
                  <div key={payment.id}>
                    <span>
                      <b>{firstName(payment.fromMemberId)} → {firstName(payment.toMemberId)}</b>
                      <small>covers {(payment.coversMemberIds || []).map(firstName).join(" + ")}</small>
                      <small>ID · {payment.id}</small>
                    </span>
                    <strong>{formatINR(payment.amountPaise)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="finance-audit-section">
            <div className="finance-subhead"><b>Active-account integrity</b><span>{ledgerBalanced ? "balanced" : "review"}</span></div>
            <div className="finance-integrity-grid">
              <div><span>PERSONAL ALLOCATION DIFFERENCE</span><b>{formatINR(Math.abs(allocationDifference))}</b></div>
              <div><span>ACTIVE CASH DIFFERENCE</span><b>{formatINR(Math.abs(activeCashDifference))}</b></div>
              <div><span>ACTIVE CREDIT DIFFERENCE</span><b>{formatINR(Math.abs(activeCreditDifference))}</b></div>
              <div><span>NET PERSONAL BALANCE SUM</span><b>{formatINR(Math.abs(settlement.netBalancePaise))}</b></div>
              <div><span>GROUP CONTRIBUTION ADVANCES</span><b>{formatINR(settlement.groupFundAdvancePaise)}</b></div>
              <div><span>HISTORICAL VARIANCE</span><b>{legacyAuditVariance < 0 ? "−" : ""}{formatINR(Math.abs(legacyAuditVariance))}</b></div>
            </div>
            <p className="finance-footnote">
              Active cash on hand is fully spendable during the trip. End-of-trip reimbursements remain recorded as liabilities without reducing the live cash balance. Active and historical group cash are audited independently, and the historical ₹462 variance remains explicitly unresolved instead of being converted into fake merchant spending.
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}
