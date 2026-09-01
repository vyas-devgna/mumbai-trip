import React,{useEffect,useMemo,useState} from 'react'
import {AnimatePresence,motion} from 'framer-motion'
import {data,useAutoUpdate,useStored,useTripClock} from './lib.js'
import Now from './screens/Now.jsx'
import Plan from './screens/Plan.jsx'
import MapScreen from './screens/Map.jsx'
import Group from './screens/Group.jsx'
import More from './screens/More.jsx'
import {CommandSheet,ResourceViewer,SideNav,Topbar} from './ui.jsx'

const MAP_PREFETCH_ZOOMS=[11,13,14]
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true
const hasInstalledHint=()=>{try{return localStorage.getItem('tripos-installed')==='1'}catch{return false}}

function fallbackHash(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16).padStart(8,'0')}
async function placesHash(){
  const serialized=JSON.stringify(data.places)
  try{
    if(globalThis.crypto?.subtle&&globalThis.TextEncoder){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,20)}
  }catch{}
  return fallbackHash(serialized)
}

function AmbientBackdrop(){
  return <div className="ambient-bg" aria-hidden="true">
    <motion.i className="ambient-node ambient-a" animate={{x:[0,40,-15,0],y:[0,28,8,0],scale:[1,1.08,.97,1]}} transition={{duration:22,repeat:Infinity,ease:'easeInOut'}}/>
    <motion.i className="ambient-node ambient-b" animate={{x:[0,-35,10,0],y:[0,-24,18,0],scale:[1,.94,1.06,1]}} transition={{duration:26,repeat:Infinity,ease:'easeInOut'}}/>
    <motion.i className="ambient-node ambient-c" animate={{x:[0,20,-25,0],y:[0,-16,14,0]}} transition={{duration:30,repeat:Infinity,ease:'easeInOut'}}/>
  </div>
}

export default function App(){
  const now=useTripClock(React),update=useAutoUpdate(React)
  const [tab,setTab]=useState('Now'),[day,setDay]=useStored(React,'tripos-last-day','2026-09-14'),[notes,setNotes]=useStored(React,'tripos-local-notes',[]),[localExpenses,setLocalExpenses]=useStored(React,'tripos-local-expenses',[])
  const [resource,setResource]=useState(null),[sheet,setSheet]=useState(null),[installPrompt,setInstallPrompt]=useState(null),[installed,setInstalled]=useState(()=>isStandalone()||hasInstalledHint())

  useEffect(()=>{
    if(isStandalone()){setInstalled(true);try{localStorage.setItem('tripos-installed','1')}catch{}}
    const before=e=>{e.preventDefault();setInstallPrompt(e);setInstalled(false);try{localStorage.removeItem('tripos-installed')}catch{}}
    const didInstall=()=>{setInstallPrompt(null);setInstalled(true);try{localStorage.setItem('tripos-installed','1')}catch{}}
    addEventListener('beforeinstallprompt',before);addEventListener('appinstalled',didInstall)
    return()=>{removeEventListener('beforeinstallprompt',before);removeEventListener('appinstalled',didInstall)}
  },[])

  useEffect(()=>{
    if(!('serviceWorker'in navigator))return
    let cancelled=false
    const coordinates=data.places.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)).map(p=>[p.longitude,p.latitude])
    const prefetch=async()=>{
      if(cancelled||!navigator.onLine||!coordinates.length)return
      try{
        const hash=await placesHash(),key=`tripos-map-anchors-z${MAP_PREFETCH_ZOOMS.join('-')}-${hash}`
        if(cancelled||localStorage.getItem(key))return
        const reg=await navigator.serviceWorker.ready,target=reg.active||navigator.serviceWorker.controller
        if(!target)return
        const channel=new MessageChannel()
        const result=await new Promise(resolve=>{
          const timer=setTimeout(()=>resolve(null),30000)
          channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)}
          target.postMessage({type:'PREFETCH_MAP_ANCHORS',zooms:MAP_PREFETCH_ZOOMS,coordinates},[channel.port2])
        })
        if(result?.ok&&!cancelled){
          localStorage.setItem(key,new Date().toISOString())
          for(let i=localStorage.length-1;i>=0;i--){const oldKey=localStorage.key(i);if(oldKey?.startsWith('tripos-map-anchors-')&&oldKey!==key)localStorage.removeItem(oldKey)}
        }
      }catch{}
    }
    prefetch();addEventListener('online',prefetch)
    return()=>{cancelled=true;removeEventListener('online',prefetch)}
  },[])

  useEffect(()=>{if(!('Notification'in window)||Notification.permission!=='granted')return;for(const a of data.activities.filter(x=>x.timing.type==='fixed')){const start=new Date(`${a.date}T${a.timing.start}:00+05:30`),mins=(start-now)/60000,key=`tripos-alert-${a.id}`;if(mins>0&&mins<=90&&!localStorage.getItem(key)){new Notification(`Mumbai Trip · ${a.title}`,{body:`${a.timing.start} · ${a.notes?.[0]||'Upcoming fixed item'}`,icon:`${import.meta.env.BASE_URL}icon.svg`});localStorage.setItem(key,'1')}}},[now])

  const expenses=useMemo(()=>[...data.expenses,...localExpenses],[localExpenses])
  const installApp=async()=>{
    if(installed)return
    if(installPrompt){installPrompt.prompt();const choice=await installPrompt.userChoice;setInstallPrompt(null);if(choice?.outcome==='accepted'){setInstalled(true);try{localStorage.setItem('tripos-installed','1')}catch{}}return}
    setSheet('install')
  }
  const ctx={now,day,setDay,notes,setNotes,expenses,localExpenses,setLocalExpenses,setResource,setSheet,installPrompt,setInstallPrompt,installed,update,setTab,onInstall:installApp}
  const screen=tab==='Now'?<Now {...ctx}/>:tab==='Plan'?<Plan {...ctx}/>:tab==='Map'?<MapScreen {...ctx}/>:tab==='Group'?<Group {...ctx}/>:<More {...ctx}/>

  return <div className="app-shell"><AmbientBackdrop/><Topbar now={now} update={update}/><AnimatePresence mode="wait" initial={false}><motion.main className="page-motion" key={tab} initial={{opacity:0,y:8,scale:.995}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-5}} transition={{duration:.2,ease:[.22,1,.36,1]}}>{screen}</motion.main></AnimatePresence><SideNav active={tab} onChange={setTab} onCommand={()=>setSheet('command')} onInstall={installApp} installed={installed}/>{sheet&&<CommandSheet mode={sheet} onClose={()=>setSheet(null)} {...ctx}/>} {resource&&<ResourceViewer key={`${resource.id}-${resource.boarding?'boarding':'normal'}`} resource={resource} onClose={()=>setResource(null)}/>}</div>
}
