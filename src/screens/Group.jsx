import React,{useMemo} from 'react'
import {data,money} from '../lib.js'

export default function Group({expenses}){
  const shares=useMemo(()=>Object.fromEntries(data.members.map(m=>[m.id,expenses.reduce((sum,e)=>e.participantIds?.includes(m.id)?sum+Number(e.amount||0)/e.participantIds.length:sum,0)])),[expenses])
  return <section className="page"><div className="page-title"><span>PARTICIPATION BOARD</span><h1>Group</h1><p>Shared plan state is GitHub-backed. Personal drafts and notes stay on each phone.</p></div><div className="group-grid">{data.members.map((m,i)=><article className="panel member" key={m.id}><div className="member-id"><b>{m.initials}</b><small>0{i+1}</small></div><div><h3>{m.name}</h3><p>{m.id==='pratham'?'Sea Lounge reservation holder':'Rail group'}</p><strong>{money(shares[m.id])}</strong><small>known allocated cost</small></div></article>)}</div><article className="panel"><div className="panel-head"><span>GROUP RULE</span><b>STATIC SHARED STATE</b></div><p className="system-copy">No fake realtime editing. A shared change goes ChatGPT → GitHub → Pages; installed clients detect the new deployment and refresh.</p></article></section>
}
