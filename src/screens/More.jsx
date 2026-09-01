import React from 'react'
import {data,money} from '../lib.js'

export default function More({expenses,notes,setResource,setSheet,installPrompt,setInstallPrompt,update}){
  const total=expenses.reduce((s,e)=>s+Number(e.amount||0),0)
  const install=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null)}
  const enableAlerts=async()=>{if('Notification'in window)await Notification.requestPermission()}
  return <section className="page"><div className="page-title"><span>SYSTEM + VAULT</span><h1>More</h1><p>Offline resources, budget ledger, personal notes and deployment state.</p></div>{installPrompt&&<button className="install" onClick={install}><span>INSTALL DASHBOARD</span><b>Add TripOS to this phone ↘</b></button>}<div className="more-grid">
    <article className="panel"><div className="panel-head"><span>BUDGET LEDGER</span><button onClick={()=>setSheet('expense')}>Add</button></div><strong className="metric-number small">{money(total)}</strong><p className="muted">Canonical booked costs plus local-only drafts on this phone.</p><div className="ledger">{expenses.map(e=><div key={e.id}><span>{e.label}</span><b>{money(e.amount)}</b></div>)}</div></article>
    <article className="panel"><div className="panel-head"><span>OFFLINE FILES</span><b>{data.resources.length}</b></div><div className="resource-list">{data.resources.map(r=><button key={r.id} onClick={()=>setResource(r)}><i className={r.type}>{r.type==='pdf'?'PDF':'IMG'}</i><div><b>{r.label}</b><small>{r.meta}</small></div><span>↗</span></button>)}</div></article>
    <article className="panel"><div className="panel-head"><span>PERSONAL NOTES</span><button onClick={()=>setSheet('note')}>Add</button></div><p className="muted">{notes.length?`${notes.length} note${notes.length===1?'':'s'} stored offline on this device.`:'No notes on this device.'}</p></article>
    <article className="panel"><div className="panel-head"><span>LOCAL ALERTS</span><button onClick={enableAlerts}>Enable</button></div><p className="muted">When notification permission is granted, TripOS warns about fixed anchors within 90 minutes while the installed app is active or resumed. Background delivery is platform-dependent.</p></article>
    <article className="panel"><div className="panel-head"><span>DEPLOYMENT</span><b className="live">● {update.label}</b></div><div className="system-rows"><div><b>Source</b><span>GitHub main</span></div><div><b>Distribution</b><span>GitHub Pages</span></div><div><b>Offline</b><span>app + vault cached</span></div><div><b>Refresh</b><span>60s + resume + reconnect</span></div><div><b>Map</b><span>satellite / street</span></div></div></article>
  </div></section>
}
