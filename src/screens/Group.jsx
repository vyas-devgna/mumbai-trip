import React, { useMemo, useState } from "react";
import { data, money, vibrate } from "../lib.js";
import { DockAwarePanel } from "../ui.jsx";

function buildSettlement(expenses) {
  const valid = new Set(data.members.map((m) => m.id)),
    ledger = Object.fromEntries(
      data.members.map((m) => [m.id, { paid: 0, share: 0 }]),
    );
  let unassigned = 0;
  for (const e of expenses) {
    const amount = Math.round(Number(e.amount || 0) * 100),
      participants = (e.participantIds || []).filter((id) => valid.has(id));
    if (!amount || !participants.length) continue;
    if (e.payerId && valid.has(e.payerId)) ledger[e.payerId].paid += amount;
    else unassigned += amount;
    const base = Math.floor(amount / participants.length),
      remainder = amount % participants.length;
    participants.forEach((id, index) => {
      ledger[id].share += base + (index < remainder ? 1 : 0);
    });
  }
  for (const payment of data.reimbursements || []) {
    const amount = Math.round(Number(payment.amount || 0) * 100),
      covered = (payment.coversMemberIds || []).filter((id) => valid.has(id));
    if (!amount || !covered.length || !valid.has(payment.toMemberId)) continue;
    ledger[payment.toMemberId].paid -= amount;
    const base = Math.floor(amount / covered.length),
      remainder = amount % covered.length;
    covered.forEach((id, index) => {
      ledger[id].paid += base + (index < remainder ? 1 : 0);
    });
  }
  const creditors = [],
    debtors = [];
  for (const [id, row] of Object.entries(ledger)) {
    row.net = row.paid - row.share;
    if (row.net > 0) creditors.push({ id, amount: row.net });
    if (row.net < 0) debtors.push({ id, amount: -row.net });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  const transfers = [];
  let ci = 0,
    di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0)
      transfers.push({ from: debtors[di].id, to: creditors[ci].id, amount });
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }
  return { ledger, transfers, unassigned };
}

export default function Group({ expenses }) {
  const settlement = useMemo(() => buildSettlement(expenses), [expenses]),
    [copied, setCopied] = useState(null);
  const copySettlement = async (transfer) => {
    const from = data.members.find((m) => m.id === transfer.from)?.name,
      to = data.members.find((m) => m.id === transfer.to)?.name,
      text = `${from} pays ${to} ${money(transfer.amount / 100)} for the Mumbai trip settlement.`;
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
          Shared plan state is GitHub-backed. Personal drafts and notes stay on
          each phone.
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
                <strong>{money(row.share / 100)}</strong>
                <small>
                  allocated · settled {money(row.paid / 100)} ·{" "}
                  <b className={row.net >= 0 ? "net-positive" : "net-negative"}>
                    {row.net >= 0 ? "+" : ""}
                    {money(row.net / 100)} net
                  </b>
                </small>
              </div>
            </DockAwarePanel>
          );
        })}
      </div>
      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>SETTLEMENT</span>
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
                  className={row.net >= 0 ? "net-positive" : "net-negative"}
                >
                  {row.net >= 0 ? "+" : ""}
                  {money(row.net / 100)}
                </span>
                <small>
                  {money(row.paid / 100)} settled · {money(row.share / 100)}{" "}
                  allocated
                </small>
              </div>
            );
          })}
        </div>
        {(data.reimbursements || []).length > 0 && (
          <div className="payment-log">
            {data.reimbursements.map((payment) => (
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
                  {money(payment.amount)} · covers{" "}
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
                    <strong>{money(t.amount / 100)}</strong>
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
        {settlement.unassigned > 0 && (
          <p className="muted">
            {money(settlement.unassigned / 100)} has no payer assigned, so that
            amount is excluded from who-owes-whom settlement.
          </p>
        )}
      </DockAwarePanel>
      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>GROUP RULE</span>
          <b>STATIC SHARED STATE</b>
        </div>
        <p className="system-copy">
          No fake realtime editing. A shared change goes ChatGPT → GitHub →
          Pages; installed clients detect the new deployment and refresh.
        </p>
      </DockAwarePanel>
    </section>
  );
}
