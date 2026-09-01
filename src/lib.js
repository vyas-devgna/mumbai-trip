import data from './data/trip.json'

export { data }
export const BASE = import.meta.env.BASE_URL
export const DAYS = ['2026-09-14','2026-09-15','2026-09-16','2026-09-17']
export const byId = (arr,id) => arr.find(x => x.id === id)
export const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:Number(value)%1?2:0}).format(Number(value)||0)
export const fmtDate = date => new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00+05:30`))
export const fmtShortDate = date => new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00+05:30`))
export const timingLabel = a => a.timing.start || (a.timing.earliest ? `${a.timing.earliest}–${a.timing.latest}` : 'Flexible')
export const activityStart = a => new Date(`${a.date}T${a.timing.start || a.timing.earliest || '23:59'}:00+05:30`)
export const dayItems = day => data.activities.filter(a=>a.date===day).sort((a,b)=>activityStart(a)-activityStart(b))

export function useStored(React,key,initial){
  const {useEffect,useState}=React
  const [value,setValue]=useState(()=>{try{const v=localStorage.getItem(key);return v?JSON.parse(v):initial}catch{return initial}})
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}},[key,value])
  return [value,setValue]
}

export function useTripClock(React){
  const {useEffect,useState}=React
  const [now,setNow]=useState(()=>new Date())
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(t)},[])
  return now
}

export function useAutoUpdate(React){
  const {useEffect,useState}=React
  const [state,setState]=useState({label:navigator.onLine?'Checking':'Offline'})
  useEffect(()=>{
    let reg,stopped=false
    const check=async()=>{
      if(stopped||!navigator.onLine){setState({label:'Offline'});return}
      try{
        if('serviceWorker'in navigator){reg=reg||await navigator.serviceWorker.register(`${BASE}sw.js`,{updateViaCache:'none'});await reg.update().catch(()=>{})}
        const r=await fetch(`${BASE}version.json?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error('version')
        const latest=await r.json(), previous=localStorage.getItem('tripos-build')
        if(previous&&previous!==latest.version&&latest.version!=='local-dev'){
          localStorage.setItem('tripos-build',latest.version);setState({label:'Updating'});setTimeout(()=>location.reload(),300);return
        }
        if(latest.version)localStorage.setItem('tripos-build',latest.version)
        setState({label:'Current',version:latest.version})
      }catch{setState({label:navigator.onLine?'Retrying':'Offline'})}
    }
    const visible=()=>document.visibilityState==='visible'&&check(), online=()=>check(), offline=()=>setState({label:'Offline'})
    addEventListener('online',online);addEventListener('offline',offline);document.addEventListener('visibilitychange',visible);check()
    const timer=setInterval(check,60000)
    return()=>{stopped=true;clearInterval(timer);removeEventListener('online',online);removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visible)}
  },[])
  return state
}
