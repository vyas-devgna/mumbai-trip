import React,{useEffect,useMemo,useState} from 'react'
import {data,useAutoUpdate,useStored,useTripClock} from './lib.js'
import Now from './screens/Now.jsx'
import Plan from './screens/Plan.jsx'
import MapScreen from './screens/Map.jsx'
import Group from './screens/Group.jsx'
import More from './screens/More.jsx'
import {BottomNav,CommandSheet,ResourceViewer,Topbar} from './ui.jsx'

export default function App(){
  const now=useTripClock(React),update=useAutoUpdate(React)
  const [tab,setTab]=useState('Now'),[day,setDay]=useStored(React,'tripos-last-day','2026-09-14'),[notes,setNotes]=useStored(React,'tripos-local-notes',[]),[localExpenses,setLocalExpenses]=useStored(React,'tripos-local-expenses',[])
  const [resource,setResource]=useState(null),[sheet,setSheet]=useState(null),[installPrompt,setInstallPrompt]=useState(null)
  useEffect(()=>{const h=e=>{e.preventDefault();setInstallPrompt(e)};addEventListener('beforeinstallprompt',h);return()=>removeEventListener('beforeinstallprompt',h)},[])
  useEffect(()=>{if(!('Notification'in window)||Notification.permission!=='granted')return;for(const a of data.activities.filter(x=>x.timing.type==='fixed')){const start=new Date(`${a.date}T${a.timing.start}:00+05:30`),mins=(start-now)/60000,key=`tripos-alert-${a.id}`;if(mins>0&&mins<=90&&!localStorage.getItem(key)){new Notification(`Mumbai Trip · ${a.title}`,{body:`${a.timing.start} · ${a.notes?.[0]||'Upcoming fixed item'}`,icon:`${import.meta.env.BASE_URL}icon.svg`});localStorage.setItem(key,'1')}}},[now])
  const expenses=useMemo(()=>[...data.expenses,...localExpenses],[localExpenses])
  const ctx={now,day,setDay,notes,setNotes,expenses,localExpenses,setLocalExpenses,setResource,setSheet,installPrompt,setInstallPrompt,update,setTab}
  return <div className="app-shell"><Topbar now={now} update={update}/><main>{tab==='Now'&&<Now {...ctx}/>} {tab==='Plan'&&<Plan {...ctx}/>} {tab==='Map'&&<MapScreen {...ctx}/>} {tab==='Group'&&<Group {...ctx}/>} {tab==='More'&&<More {...ctx}/>}</main><button className="command" aria-label="Add or change trip" onClick={()=>setSheet('command')}>＋</button><BottomNav active={tab} onChange={setTab}/>{sheet&&<CommandSheet mode={sheet} onClose={()=>setSheet(null)} {...ctx}/>} {resource&&<ResourceViewer resource={resource} onClose={()=>setResource(null)}/>}</div>
}
