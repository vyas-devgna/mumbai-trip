import React,{useEffect,useMemo,useRef,useState} from 'react'
import * as maplibregl from 'maplibre-gl'
import {byId,data,DAYS,dayItems} from '../lib.js'

const street={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'street',type:'raster',source:'osm'}]}
const satellite={version:8,sources:{sat:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Tiles © Esri'}},layers:[{id:'satellite',type:'raster',source:'sat'}]}

export default function MapScreen({setDay}){
  const el=useRef(null), mapRef=useRef(null), markers=useRef([])
  const [mode,setMode]=useState('satellite'),[scope,setScope]=useState('mumbai')
  const coords=useMemo(()=>{
    if(scope==='mumbai')return data.places.filter(p=>p.latitude>18.75&&p.latitude<19.35&&p.longitude>72.7&&p.longitude<73.1).map(p=>[p.longitude,p.latitude])
    const out=[];for(const a of dayItems(scope)){const p=a.placeId&&byId(data.places,a.placeId);if(p&&!out.some(c=>c[0]===p.longitude&&c[1]===p.latitude))out.push([p.longitude,p.latitude])}
    for(const leg of data.travelLegs.filter(l=>l.date===scope))for(const id of [leg.fromPlaceId,leg.toPlaceId]){const p=byId(data.places,id);if(p&&!out.some(c=>c[0]===p.longitude&&c[1]===p.latitude))out.push([p.longitude,p.latitude])}
    return out
  },[scope])

  useEffect(()=>{if(mapRef.current||!el.current)return;const map=new maplibregl.Map({container:el.current,style:satellite,center:[72.846,19.015],zoom:11.2});map.addControl(new maplibregl.NavigationControl(),'bottom-right');mapRef.current=map;markers.current=data.places.filter(p=>p.latitude&&p.longitude).map(p=>{const node=document.createElement('button');node.className='map-marker';node.innerHTML='<i></i>';node.title=p.name;const pop=new maplibregl.Popup({offset:18,closeButton:false}).setHTML(`<div class="map-popup"><b>${p.name}</b><span>${p.category}</span>${p.address?`<small>${p.address}</small>`:''}</div>`);return new maplibregl.Marker({element:node}).setLngLat([p.longitude,p.latitude]).setPopup(pop).addTo(map)});return()=>{markers.current.forEach(m=>m.remove());map.remove();mapRef.current=null}},[])

  useEffect(()=>{const map=mapRef.current;if(!map)return;map.setStyle(mode==='satellite'?satellite:street)},[mode])
  useEffect(()=>{const map=mapRef.current;if(!map)return;const draw=()=>{if(map.getLayer('route'))map.removeLayer('route');if(map.getSource('route'))map.removeSource('route');if(coords.length>1){map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}});map.addLayer({id:'route',type:'line',source:'route',paint:{'line-color':'#f0a627','line-width':4,'line-opacity':.95,'line-dasharray':[1.5,1.2]}})}if(coords.length){const b=coords.reduce((x,c)=>x.extend(c),new maplibregl.LngLatBounds(coords[0],coords[0]));map.fitBounds(b,{padding:60,maxZoom:14,duration:500})}};if(map.isStyleLoaded())draw();else map.once('style.load',draw)},[coords,mode])

  return <section className="map-page"><div className="map-title"><div className="page-title"><span>GEOGRAPHIC BOARD</span><h1>Map</h1></div><div className="segment"><button className={mode==='satellite'?'active':''} onClick={()=>setMode('satellite')}>Satellite</button><button className={mode==='street'?'active':''} onClick={()=>setMode('street')}>Street</button></div></div><div className="map-days"><button className={scope==='mumbai'?'active':''} onClick={()=>setScope('mumbai')}>Mumbai</button>{DAYS.map(d=><button key={d} className={scope===d?'active':''} onClick={()=>{setScope(d);setDay(d)}}>{new Date(`${d}T12:00:00+05:30`).getDate()}</button>)}</div><div className="map-frame"><div ref={el} className="map-canvas"/><div className="map-legend"><span><i/> planned sequence</span><span>live basemap when online · not turn-by-turn</span></div></div></section>
}
