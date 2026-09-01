import React,{useState} from 'react'
import {BASE,data} from './lib.js'

export function Topbar({now,update}){
  const start=new Date(`${data.trip.startDate}T05:00:00+05:30`),days=Math.max(0,Math.ceil((start-now)/86400000)),live=now>=new Date(`${data.trip.startDate}T00:00:00+05:30`)&&now<=new Date(`${data.trip.endDate}T23:59:59+05:30`)
  return <header className="topbar"><div className="brand"><img src={`${BASE}icon.svg`} alt=""/><div><span>MUMBAI / 14—17 SEP</span><b>TRIP CONTROL</b></div></div><div className="sync"><i className={update.label.toLowerCase()}/><div><b>{live?'LIVE':`${days}D`}</b><small>{update.label}</small></div></div></header>
}

export function BottomNav({active,onChange}){
  const tabs=[['Now','◉'],['Plan','≡'],['Map','⌖'],['Group','◎'],['More','••']]
  return <nav className="bottom-nav">{tabs.map(([tab,icon])=><button key={tab} className={active===tab?'active':''} onClick={()=>onChange(tab)}><span>{icon}</span><b>{tab}</b></button>)}</nav>
}

export function CommandSheet({mode,onClose,notes,setNotes,localExpenses,setLocalExpenses}){
  const [view,setView]=useState(mode==='command'?'menu':mode),[text,setText]=useState(''),[amount,setAmount]=useState(''),[label,setLabel]=useState(''),[participants,setParticipants]=useState(data.members.map(m=>m.id))
  const saveNote=()=>{if(!text.trim())return;setNotes([...notes,{id:`note-${Date.now()}`,text:text.trim(),createdAt:new Date().toISOString()}]);onClose()}
  const saveExpense=()=>{const value=Number(amount);if(!(value>0)||!label.trim()||!participants.length)return;setLocalExpenses([...localExpenses,{id:`local-${Date.now()}`,amount:value,label:label.trim(),participantIds:participants,payerId:null,category:'local-draft',date:new Date().toISOString().slice(0,10),status:'local-only'}]);onClose()}
  const copy=async value=>{try{await navigator.clipboard.writeText(value)}catch{}onClose()}
  return <div className="sheet-bg" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="sheet"><div className="handle"/><header><div><span>CONTEXTUAL ACTION</span><h2>{view==='menu'?'Add / change':view==='note'?'Local note':view==='expense'?'Local expense':'Shared change'}</h2></div><button onClick={onClose}>×</button></header>{view==='menu'&&<div className="sheet-menu"><button onClick={()=>setView('note')}><b>Note on this phone</b><span>Offline, private to this browser</span></button><button onClick={()=>setView('expense')}><b>Draft an expense</b><span>Local ledger until committed</span></button><button onClick={()=>setView('shared')}><b>Change the shared trip</b><span>Copy a precise ChatGPT command</span></button></div>}{view==='note'&&<div className="form"><textarea autoFocus placeholder="Bag is at reception, call before leaving…" value={text} onChange={e=>setText(e.target.value)}/><button className="save" onClick={saveNote}>Save offline note</button></div>}{view==='expense'&&<div className="form"><input autoFocus inputMode="decimal" placeholder="Amount ₹" value={amount} onChange={e=>setAmount(e.target.value)}/><input placeholder="What was it?" value={label} onChange={e=>setLabel(e.target.value)}/><div className="participant-select">{data.members.map(m=><button key={m.id} className={participants.includes(m.id)?'active':''} onClick={()=>setParticipants(participants.includes(m.id)?participants.filter(id=>id!==m.id):[...participants,m.id])}>{m.initials}</button>)}</div><small>Local-only. Shared expenses must be committed through ChatGPT.</small><button className="save" onClick={saveExpense}>Add local draft</button></div>}{view==='shared'&&<div className="sheet-menu"><button onClick={()=>copy('Add this to the Mumbai TripOS inbox, research it, choose the best slot, validate, commit and deploy: ')}><b>Add a place</b><span>Candidate ingestion</span></button><button onClick={()=>copy('Replan Mumbai TripOS around this change, preserve fixed bookings, update travel legs, validate, commit and deploy: ')}><b>Replan</b><span>Safe downstream change</span></button><button onClick={()=>copy('Add this expense to the Mumbai TripOS shared ledger, split it correctly, validate, commit and deploy: ')}><b>Share an expense</b><span>Canonical ledger change</span></button></div>}</section></div>
}

async function shareResource(resource){
  try{const r=await fetch(resource.path),blob=await r.blob(),extension=resource.type==='pdf'?'pdf':'svg',file=new File([blob],`${resource.id}.${extension}`,{type:blob.type||(resource.type==='pdf'?'application/pdf':'image/svg+xml')});if(navigator.canShare?.({files:[file]}))return navigator.share({title:resource.label,files:[file]});if(navigator.share)return navigator.share({title:resource.label,url:new URL(resource.path,location.origin).href})}catch{}
}

export function ResourceViewer({resource,onClose}){
  return <div className="viewer"><header><div><span>OFFLINE VAULT</span><b>{resource.label}</b><small>{resource.meta}</small></div><div><button onClick={()=>shareResource(resource)}>Share</button><button onClick={onClose}>Close ×</button></div></header><div className="viewer-body">{resource.type==='pdf'?<iframe src={resource.path} title={resource.label}/>:<img src={resource.path} alt={resource.label}/>}</div><footer>Cached after a successful online load. This Pages site is public; these copies contain booking information.</footer></div>
}
