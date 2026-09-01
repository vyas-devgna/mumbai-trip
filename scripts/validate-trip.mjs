import fs from 'node:fs'

const path = new URL('../src/data/trip.json', import.meta.url)
const d = JSON.parse(fs.readFileSync(path, 'utf8'))
const errors = []

const uniq = (arr = [], label) => {
  const set = new Set()
  for (const item of arr) {
    if (!item?.id) errors.push(`${label}: missing id`)
    else if (set.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`)
    else set.add(item.id)
  }
  return set
}

const members = uniq(d.members, 'member')
const places = uniq(d.places, 'place')
const resources = uniq(d.resources, 'resource')
const activities = uniq(d.activities, 'activity')
const fallbacks = uniq(d.fallbacks, 'fallback')
uniq(d.travelLegs, 'travel leg')
uniq(d.branches, 'branch')
uniq(d.checkpoints, 'checkpoint')
uniq(d.candidates, 'candidate')
uniq(d.expenses, 'expense')
uniq(d.signals, 'signal')

for (const a of d.activities ?? []) {
  if (a.placeId && !places.has(a.placeId)) errors.push(`activity ${a.id}: unknown place ${a.placeId}`)
  for (const p of a.participants ?? []) if (!members.has(p)) errors.push(`activity ${a.id}: unknown participant ${p}`)
  for (const r of a.sourceIds ?? []) if (!resources.has(r)) errors.push(`activity ${a.id}: unknown source ${r}`)
  for (const f of a.fallbackIds ?? []) if (!fallbacks.has(f)) errors.push(`activity ${a.id}: unknown fallback ${f}`)
  if (a.date < d.trip.startDate || a.date > d.trip.endDate) errors.push(`activity ${a.id}: outside trip dates`)
  if (!['fixed', 'target', 'window', 'floating'].includes(a.timing?.type)) errors.push(`activity ${a.id}: invalid timing type`)
  if (a.timing?.type === 'fixed' && !a.timing.start) errors.push(`activity ${a.id}: fixed timing missing start`)
  if (a.timing?.type === 'window' && (!a.timing.earliest || !a.timing.latest)) errors.push(`activity ${a.id}: window timing incomplete`)
  for (const key of ['minMinutes', 'targetMinutes', 'maxMinutes']) if (!(a.duration?.[key] > 0)) errors.push(`activity ${a.id}: invalid duration ${key}`)
  if (a.duration && !(a.duration.minMinutes <= a.duration.targetMinutes && a.duration.targetMinutes <= a.duration.maxMinutes)) errors.push(`activity ${a.id}: duration range is not monotonic`)
}

for (const p of d.places ?? []) {
  if ((p.latitude != null && (p.latitude < -90 || p.latitude > 90)) || (p.longitude != null && (p.longitude < -180 || p.longitude > 180))) errors.push(`place ${p.id}: malformed coordinates`)
}

for (const l of d.travelLegs ?? []) {
  if (!places.has(l.fromPlaceId) || !places.has(l.toPlaceId)) errors.push(`travel leg ${l.id}: broken place reference`)
}

for (const e of d.expenses ?? []) {
  if (!(Number(e.amount) >= 0)) errors.push(`expense ${e.id}: invalid amount`)
  if (e.payerId && !members.has(e.payerId)) errors.push(`expense ${e.id}: unknown payer ${e.payerId}`)
  for (const p of e.participantIds ?? []) if (!members.has(p)) errors.push(`expense ${e.id}: unknown participant ${p}`)
  if (e.sourceId && !resources.has(e.sourceId)) errors.push(`expense ${e.id}: unknown source ${e.sourceId}`)
}

for (const r of d.resources ?? []) {
  if (!['pdf', 'image', 'link', 'note'].includes(r.type)) errors.push(`resource ${r.id}: unsupported type ${r.type}`)
  if ((r.type === 'pdf' || r.type === 'image') && !r.path) errors.push(`resource ${r.id}: local file missing path`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`Trip data valid: ${activities.size} activities, ${places.size} places, ${members.size} members, ${resources.size} resources`)
