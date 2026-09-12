import fs from "node:fs";

const read = (relative) =>
  JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));

const base = read("../src/data/trip.json");
const extra = read("../src/data/return-branch.json");
const errors = [];

const all = (key) => [...(base[key] || []), ...(extra[key] || [])];
const ids = (key) => new Set(all(key).map((item) => item.id));
const duplicateIds = (key) => {
  const seen = new Set();
  for (const item of all(key)) {
    if (!item?.id) errors.push(`${key}: missing id`);
    else if (seen.has(item.id)) errors.push(`${key}: duplicate id ${item.id}`);
    else seen.add(item.id);
  }
};

for (const key of [
  "members",
  "places",
  "activities",
  "travelLegs",
  "branches",
  "checkpoints",
  "resources",
  "signals",
]) duplicateIds(key);

const members = ids("members");
const places = ids("places");
const activities = ids("activities");
const checkpoints = ids("checkpoints");
const resources = ids("resources");

for (const activity of extra.activities || []) {
  if (activity.placeId && !places.has(activity.placeId))
    errors.push(`activity ${activity.id}: unknown place ${activity.placeId}`);
  for (const memberId of activity.participants || [])
    if (!members.has(memberId))
      errors.push(`activity ${activity.id}: unknown participant ${memberId}`);
  for (const sourceId of activity.sourceIds || [])
    if (!resources.has(sourceId))
      errors.push(`activity ${activity.id}: unknown source ${sourceId}`);
  if (activity.date < base.trip.startDate || activity.date > base.trip.endDate)
    errors.push(`activity ${activity.id}: outside trip dates`);
  if (!["fixed", "target", "window", "floating"].includes(activity.timing?.type))
    errors.push(`activity ${activity.id}: invalid timing type`);
  if (activity.timing?.type === "fixed" && !activity.timing.start)
    errors.push(`activity ${activity.id}: fixed timing missing start`);
  const duration = activity.duration || {};
  if (!(duration.minMinutes > 0 && duration.targetMinutes > 0 && duration.maxMinutes > 0))
    errors.push(`activity ${activity.id}: invalid duration`);
  if (!(duration.minMinutes <= duration.targetMinutes && duration.targetMinutes <= duration.maxMinutes))
    errors.push(`activity ${activity.id}: duration range is not monotonic`);
}

for (const place of extra.places || []) {
  if (!Number.isFinite(place.latitude) || place.latitude < -90 || place.latitude > 90)
    errors.push(`place ${place.id}: invalid latitude`);
  if (!Number.isFinite(place.longitude) || place.longitude < -180 || place.longitude > 180)
    errors.push(`place ${place.id}: invalid longitude`);
}

for (const leg of extra.travelLegs || []) {
  if (!places.has(leg.fromPlaceId) || !places.has(leg.toPlaceId))
    errors.push(`travel leg ${leg.id}: broken place reference`);
}

for (const branch of extra.branches || []) {
  if (!(branch.participants?.length > 0))
    errors.push(`branch ${branch.id}: missing participants`);
  for (const memberId of branch.participants || [])
    if (!members.has(memberId))
      errors.push(`branch ${branch.id}: unknown participant ${memberId}`);
  if (branch.rejoinCheckpointId && !checkpoints.has(branch.rejoinCheckpointId))
    errors.push(`branch ${branch.id}: unknown checkpoint ${branch.rejoinCheckpointId}`);
  if (!(branch.lanes?.length > 1))
    errors.push(`branch ${branch.id}: expected at least two lanes`);
  for (const lane of branch.lanes || []) {
    if (!(lane.participants?.length > 0))
      errors.push(`branch ${branch.id}/${lane.id}: missing participants`);
    for (const memberId of lane.participants || [])
      if (!members.has(memberId))
        errors.push(`branch ${branch.id}/${lane.id}: unknown participant ${memberId}`);
    for (const activityId of lane.activityIds || [])
      if (!activities.has(activityId))
        errors.push(`branch ${branch.id}/${lane.id}: unknown activity ${activityId}`);
  }
}

for (const checkpoint of extra.checkpoints || []) {
  if (checkpoint.placeId && !places.has(checkpoint.placeId))
    errors.push(`checkpoint ${checkpoint.id}: unknown place ${checkpoint.placeId}`);
  for (const memberId of checkpoint.participants || [])
    if (!members.has(memberId))
      errors.push(`checkpoint ${checkpoint.id}: unknown participant ${memberId}`);
}

for (const resource of extra.resources || []) {
  if (!["pdf", "image", "link", "note"].includes(resource.type))
    errors.push(`resource ${resource.id}: unsupported type ${resource.type}`);
  if ((resource.type === "pdf" || resource.type === "image") && !resource.path)
    errors.push(`resource ${resource.id}: local file missing path`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Return branch valid: ${(extra.members || []).length} member, ${(extra.activities || []).length} activity, ${(extra.branches || []).length} branch`,
);
