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
  // Only confirmed paid expenses belong in the per-person account. Planned
  // estimates and device-local drafts stay outside settlement until payment is
  // actually reported.
  for (const e of expenses) {
    if (e.status !== "paid") continue;
    const amountPaise = e.amountPaise,
      participants = [
        ...new Set((e.participantIds || []).filter((id) => valid.has(id))),
      ].sort();
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0)
      continue;
    if (!participants.length) continue;
    const groupId = e.settlementGroupId || e.id,
      signature = `${e.payerId || ""}|${participants.join(",")}`,
      current = settlementGroups.get(groupId);
    if (current && current.signature !== signature) continue;
    settlementGroups.set(groupId, {
      signature,
      payerId: e.payerId,
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

export default function Group({ expenses }) {
  const settlement = useMemo(() => buildSettlement(expenses), [expenses]),
    [copied, setCopied] = useState(null);
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
  return (
    <section className="page">
      <div className="page-title">
        <span>PARTICIPATION BOARD</span>
        <h1>Group</h1>
        <p>
          Only confirmed paid expenses affect balances. Planning estimates and
          device drafts stay outside the per-person account until payment is made.
        </p>
      </div>
      <div className="group-grid">
        {data.members.map((m, i) => {
          const row = settlement.ledger[m.id];
          return (
            <DockAwarePanel className="panel member" key={m.id}>
              <div className="member-id">
                <b>{m.initials}</b>
                <small>0{i + 1}</small>
              </div>
              <div>
                <h3>{m.name}</h3>
                <p>
                  {m.id === "pratham"
                    ? "Sea Lounge reservation holder"
                    : "Rail group"}
                </p>
                <strong>{formatINR(row.sharePaise)}</strong>
                <small>
                  allocated · settled {formatINR(row.paidPaise)} ·{" "}
                  <b
                    className={
                      row.netPaise >= 0 ? "net-positive" : "net-negative"
                    }
                  >
                    {row.netPaise >= 0 ? "+" : ""}
                    {formatINR(row.netPaise)} net
                  </b>
                </small>
              </div>
            </DockAwarePanel>
          );
        })}
      </div>
      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>SETTLEMENT · PAID ONLY</span>
          <b>
            {settlement.transfers.length
              ? `${settlement.transfers.length} TRANSFER${settlement.transfers.length === 1 ? "" : "S"}`
              : "BALANCED"}
          </b>
        </div>
        <div className="settlement-grid">
          {data.members.map((m) => {
            const row = settlement.ledger[m.id];
            return (
              <div className="settlement-row" key={m.id}>
                <b>{m.name}</b>
                <span
                  className={
                    row.netPaise >= 0 ? "net-positive" : "net-negative"
                  }
                >
                  {row.netPaise >= 0 ? "+" : ""}
                  {formatINR(row.netPaise)}
                </span>
                <small>
                  {formatINR(row.paidPaise)} settled ·{" "}
                  {formatINR(row.sharePaise)} allocated
                </small>
              </div>
            );
          })}
        </div>
        {(data.reimbursements || []).filter((payment) => payment.status === "received").length > 0 && (
          <div className="payment-log">
            {data.reimbursements
              .filter((payment) => payment.status === "received")
              .map((payment) => (
                <div key={payment.id}>
                  <b>
                    {
                      data.members.find((m) => m.id === payment.fromMemberId)
                        ?.name
                    }{" "}
                    →{" "}
                    {data.members.find((m) => m.id === payment.toMemberId)?.name}
                  </b>
                  <span>
                    {formatINR(payment.amountPaise)} · covers{" "}
                    {payment.coversMemberIds
                      .map(
                        (id) =>
                          data.members
                            .find((m) => m.id === id)
                            ?.name.split(" ")[0],
                      )
                      .join(" + ")}
                  </span>
                </div>
              ))}
          </div>
        )}
        {settlement.transfers.length ? (
          <div className="settlement-transfers">
            {settlement.transfers.map((t, i) => {
              const key = `${t.from}-${t.to}`;
              return (
                <div className="settlement-transfer" key={`${key}-${i}`}>
                  <div>
                    <b>
                      {data.members.find((m) => m.id === t.from)?.name} pays{" "}
                      {data.members.find((m) => m.id === t.to)?.name}
                    </b>
                    <strong>{formatINR(t.amountPaise)}</strong>
                  </div>
                  <button onClick={() => copySettlement(t)}>
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
            {formatINR(settlement.unassignedPaise)} has no payer assigned, so
            that amount is excluded from who-owes-whom settlement.
          </p>
        )}
      </DockAwarePanel>
      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>GROUP RULE</span>
          <b>PAYMENT CREATES ACCOUNTING</b>
        </div>
        <p className="system-copy">
          Estimates can be planned freely. A member balance changes only after
          an actual payment is confirmed and recorded in the canonical ledger.
        </p>
      </DockAwarePanel>
    </section>
  );
}
