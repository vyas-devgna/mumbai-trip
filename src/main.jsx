import React from 'react'
import {createRoot} from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import './enhancements.css'
import './topbar.css'
import './video-glass.css'
import {BACKGROUND_VIDEO} from './backgroundVideo.js'
import App from './App.jsx'

function mountVideoBackdrop(){
  if(document.getElementById('trip-video-backdrop'))return
  const layer=document.createElement('div'),video=document.createElement('video'),reduced=matchMedia('(prefers-reduced-motion: reduce)')
  layer.id='trip-video-backdrop';layer.className='video-backdrop';layer.setAttribute('aria-hidden','true')
  video.src=BACKGROUND_VIDEO;video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='auto';video.disablePictureInPicture=true
  layer.appendChild(video);document.body.prepend(layer)
  const sync=()=>{if(reduced.matches||document.hidden){video.pause();return}video.play().catch(()=>{})}
  document.addEventListener('visibilitychange',sync);reduced.addEventListener?.('change',sync);video.addEventListener('canplay',sync,{once:true});sync()
}

mountVideoBackdrop()
createRoot(document.getElementById('root')).render(<App/>)
