import fs from 'node:fs'
const path=new URL('../src/data/trip.json',import.meta.url)
const d=JSON.parse(fs.readFileSync(path,'utf8'))
const errors=[]
const uniq=(arr,label)=>{const s=new Set();for(const x of arr){if(!x.id)errors.push(`${label}: missing id`);else if(s.has(x.id))errors.push(`${label}: duplicate id ${x.id}`);s.add(x.id)}return s}
const members=uniq(d.members,'member'), places=uniq(d.places,'place'), resources=uniq(d.resources,'resource')
uniq(d.activities,'activity')
for(const a of d.activities){if(a.placeId&&!places.has(a.placeId))errors.push(`activity ${a.id}: unknown place ${a.placeId}`);for(const p of a.participants||[])if(!members.has(p))errors.push(`activity ${a.id}: unknown participant ${p}`);for(const r of a.sourceIds||[])if(!resources.has(r))errors.push(`activity ${a.id}: unknown source ${r}`);if(a.date<d.trip.startDate||a.date>d.trip.endDate)errors.push(`activity ${a.id}: outside trip dates`);if(!['fixed','target','window','floating'].includes(a.timing?.type))errors.push(`activity ${a.id}: invalid timing type`);for(const k of ['minMinutes','targetMinutes','maxMinutes'])if(a.duration?.[k]<=0)errors.push(`activity ${a.id}: invalid duration ${k}`)}
for(const p of d.places){if((p.latitude!=null&&(p.latitude<-90||p.latitude>90))||(p.longitude!=null&&(p.longitude<-180||p.longitude>180)))errors.push(`place ${p.id}: malformed coordinates`)}
for(const l of d.travelLegs||[]){if(!places.has(l.fromPlaceId)||!places.has(l.toPlaceId))errors.push(`travel leg ${l.id}: broken place reference`)}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`Trip data valid: ${d.activities.length} activities, ${d.places.length} places, ${d.members.length} members`)
