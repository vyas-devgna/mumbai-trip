import React from 'react'
import {createRoot} from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import './enhancements.css'
import './topbar.css'
import './video-glass.css'
import './performance.css'
import './typography-safety.css'
import {data} from './lib.js'
import App from './App.jsx'

function mountGradientBackdrop(){
  if(document.getElementById('trip-gradient-backdrop'))return
  const layer=document.createElement('div')
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  layer.id='trip-gradient-backdrop'
  layer.className='gradient-backdrop'
  layer.setAttribute('aria-hidden','true')
  layer.innerHTML='<i class="gradient-blob gradient-a"></i><i class="gradient-blob gradient-b"></i><i class="gradient-blob gradient-c"></i>'
  document.body.prepend(layer)
  const syncMotion=()=>layer.classList.toggle('motion-paused',document.hidden||reduced.matches)
  document.addEventListener('visibilitychange',syncMotion)
  reduced.addEventListener?.('change',syncMotion)
  syncMotion()
}

function mountTripProgress(){
  const start=new Date(`${data.trip.startDate}T05:00:00+05:30`)
  const end=new Date(`${data.trip.endDate}T23:59:59+05:30`)
  const tripDayStart=new Date(`${data.trip.startDate}T00:00:00+05:30`)
  const approachWindow=30*86400000
  let timer=0,rail=null,bindFrame=0

  const formatCountdown=remaining=>{
    const totalMinutes=Math.max(0,Math.floor(remaining/60000))
    const days=Math.floor(totalMinutes/1440)
    const hours=Math.floor((totalMinutes%1440)/60)
    const minutes=totalMinutes%60
    if(days>0)return `${days}D ${hours}H TO DEPARTURE`
    if(hours>0)return `${hours}H ${minutes}M TO DEPARTURE`
    return `${minutes}M TO DEPARTURE`
  }

  const update=()=>{
    if(!rail||document.hidden)return
    const now=new Date()
    let progress=0,label='',phase='planning'
    if(now<start){
      const remaining=start-now
      progress=Math.max(0,Math.min(1,1-remaining/approachWindow))
      label=formatCountdown(remaining)
    }else if(now<=end){
      phase='live'
      progress=Math.max(0,Math.min(1,(now-start)/(end-start)))
      const day=Math.min(4,Math.max(1,Math.floor((now-tripDayStart)/86400000)+1))
      label=`LIVE · DAY ${String(day).padStart(2,'0')} · ${Math.round(progress*100)}%`
    }else{
      phase='complete'
      progress=1
      label='TRIP COMPLETE'
    }
    rail.style.setProperty('--trip-progress',`${(progress*100).toFixed(2)}%`)
    rail.dataset.countdown=label
    rail.dataset.phase=phase
    rail.setAttribute('aria-label',`Trip day horizon, ${label}`)
  }

  const stop=()=>{if(timer){clearInterval(timer);timer=0}}
  const startTimer=()=>{stop();update();if(!document.hidden)timer=window.setInterval(update,30000)}
  const bind=()=>{
    rail=document.querySelector('.trip-horizon')
    if(!rail){bindFrame=requestAnimationFrame(bind);return}
    startTimer()
  }
  const visibility=()=>document.hidden?stop():startTimer()
  bind()
  document.addEventListener('visibilitychange',visibility)
  addEventListener('pagehide',()=>{stop();if(bindFrame)cancelAnimationFrame(bindFrame);document.removeEventListener('visibilitychange',visibility)},{once:true})
}

mountGradientBackdrop()
createRoot(document.getElementById('root')).render(<App/>)
mountTripProgress()
