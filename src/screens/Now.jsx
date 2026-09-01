import React,{useMemo,useState} from 'react'
import {activityStart,byId,data,fmtDate,fmtShortDate,money,timingLabel} from '../lib.js'

export default function Now({now,expenses,notes,setResource,setSheet,setTab}){
  const [copiedSignal,setCopiedSignal]=useState(null)
  const upcoming=useMemo(()=>data.activities.filter(a=>activityStart(a)>now).sort((a,b)=>activityStart(a)-activityStart(b)),[now])
  const next=upcoming[0]||data.activities.at(-1), place=next?.placeId&&byId(data.places,next.placeId)
  const tripStart=new Date(`${data.trip.startDate}T05:00:00+05:30`), hours=Math.max(0,Math.round((tripStart-now)/3600000))
  const spend=expenses.reduce((s,e)=>s+Number(e.amount||0),0), ceiling=data.trip.budget.targetPerPerson*data.trip.budget.groupSizeBudgeted
  const progress=Math.min(100,spend/ceiling*100)
  const fixed=data.activities.filter(a=>a.timing.type==='fixed')
  const copySignal=async signal=>{const prompt=`Re-verify the Mumbai TripOS signal "${signal.label}" (${signal.id}) using current authoritative sources. Update the relevant trip data, set signals.${signal.id}.lastVerifiedAt to the actual verification timestamp, update any materially changed related assumptions, validate the complete trip data, commit to main and deploy GitHub Pages.`;try{await navigator.clipboard.writeText(prompt);setCopiedSignal(signal.id);setTimeout(()=>setCopiedSignal(null),1600)}catch{}}
  const verifiedLabel=signal=>signal.lastVerifiedAt?`checked ${new Date(signal.lastVerifiedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:signal.status.replaceAll('-',' ')
  return <section className="dash">
    <article className="panel mission span2" style={{gridColumn:'1 / -1',width:'100%'}}>
      <div className="panel-head"><span>01 / NEXT ANCHOR</span><b>{next?.timing.type}</b></div>
      <div className="mission-grid"><div><p className="stamp">{fmtDate(next.date)} · {timingLabel(next)}</p><h1 style={{fontSize:'clamp(24px,5vw,32px)'}}>{next.title}</h1><p>{next.notes?.[0]}</p></div><div className="count"><strong>{hours>48?Math.ceil(hours/24):hours}</strong><span>{hours>48?'days':'hours'} to outbound</span></div></div>
      <div className="actions">{place?.googleMapsUrl&&<a className="primary" href={place.googleMapsUrl} target="_blank" rel="noreferrer">Navigate</a>}<button onClick={()=>setTab('Plan')}>Open plan</button>{next.sourceIds?.[0]&&<button onClick={()=>{const r=byId(data.resources,next.sourceIds[0]);if(r)setResource({...r,boarding:true})}}>Open file</button>}</div>
    </article>

    <article className="panel metric"><div className="panel-head"><span>02 / BUDGET</span><button onClick={()=>setSheet('expense')}>+ expense</button></div><strong className="metric-number">{money(spend)}</strong><p>known trip spend · {Math.round(progress)}% of planning ceiling</p><div className="progress"><i style={{width:`${progress}%`}}/></div><div className="metric-pair"><span><b>{money(data.trip.budget.targetPerPerson)}</b> / person</span><span><b>{data.expenses.length}</b> booked costs</span></div></article>

    <article className="panel alerts"><div className="panel-head"><span>03 / SIGNALS</span><b>{data.signals.length} OPEN</b></div>{data.signals.map(s=><div className="alert" key={s.id}><i>!</i><div><b>{s.label}</b><div className="signal-meta"><small>{verifiedLabel(s)}</small><button className="signal-action" onClick={()=>copySignal(s)}>{copiedSignal===s.id?'Copied':'Verify ↗'}</button></div></div></div>)}</article>

    <article className="panel span2"><div className="panel-head"><span>04 / FIXED SPINE</span><b>DON'T BREAK THESE</b></div><div className="anchor-track">{fixed.map((a,i)=>{const r=a.sourceIds?.[0]&&byId(data.resources,a.sourceIds[0]);return <button className="anchor" key={a.id} onClick={()=>r&&setResource({...r,boarding:true})}><em>0{i+1}</em><b>{fmtShortDate(a.date)} · {a.timing.start}</b><strong>{a.title}</strong><small>{a.placeId?byId(data.places,a.placeId)?.name:'—'}</small></button>})}</div></article>

    <article className="panel"><div className="panel-head"><span>05 / OFFLINE VAULT</span><b>{data.resources.length} FILES</b></div><div className="resource-list">{data.resources.map(r=><button key={r.id} onClick={()=>setResource(r)}><i className={r.type}>{r.type==='pdf'?'PDF':'IMG'}</i><div><b>{r.label}</b><small>{r.meta}</small></div><span>↗</span></button>)}</div></article>

    <article className="panel"><div className="panel-head"><span>06 / NOTES</span><button onClick={()=>setSheet('note')}>+ note</button></div>{notes.length?<div className="notes">{notes.slice(-3).reverse().map(n=><div key={n.id}><b>{n.text}</b><small>{new Date(n.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · this phone</small></div>)}</div>:<p className="empty">No local notes. Add quick context without pretending it is shared.</p>}</article>
  </section>
}
