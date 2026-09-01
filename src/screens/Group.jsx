import React, { useMemo } from "react";
import { data } from "../lib.js";
import groupPlan from "../data/group.json";
import { DockAwarePanel } from "../ui.jsx";

const POSITIVE = new Set(["interest", "must"]);

function targetLabel(preference) {
  if (preference.targetType === "place" && preference.targetId)
    return (
      data.places.find((place) => place.id === preference.targetId)?.name ||
      preference.label ||
      preference.targetId
    );
  if (preference.targetType === "activity" && preference.targetId)
    return (
      data.activities.find((activity) => activity.id === preference.targetId)?.title ||
      preference.label ||
      preference.targetId
    );
  return preference.label || preference.targetId || "Unlabelled preference";
}

function targetKey(preference) {
  return `${preference.targetType || "freeform"}:${
    preference.targetId || preference.label?.trim().toLowerCase() || preference.id
  }`;
}

function kindLabel(kind) {
  return (
    {
      must: "MUST",
      interest: "INTERESTED",
      avoid: "SKIP",
      food: "FOOD",
      pace: "PACE",
      timing: "TIMING",
      other: "NOTE",
    }[kind] || String(kind || "NOTE").toUpperCase()
  );
}

export default function Group() {
  const preferences = groupPlan.preferences || [],
    byMember = useMemo(() => {
      const map = Object.fromEntries(data.members.map((member) => [member.id, []]));
      preferences.forEach((preference) => {
        if (map[preference.memberId]) map[preference.memberId].push(preference);
      });
      return map;
    }, [preferences]),
    groupFit = useMemo(() => {
      const targets = new Map();
      for (const preference of preferences) {
        const key = targetKey(preference),
          row = targets.get(key) || {
            label: targetLabel(preference),
            positive: new Set(),
            must: new Set(),
            avoid: new Set(),
          };
        if (POSITIVE.has(preference.kind)) row.positive.add(preference.memberId);
        if (preference.kind === "must") row.must.add(preference.memberId);
        if (preference.kind === "avoid") row.avoid.add(preference.memberId);
        targets.set(key, row);
      }
      const rows = [...targets.values()];
      return {
        overlaps: rows
          .filter((row) => row.positive.size >= 2)
          .sort((a, b) => b.positive.size - a.positive.size),
        conflicts: rows.filter(
          (row) => row.positive.size > 0 && row.avoid.size > 0,
        ),
      };
    }, [preferences]);

  return (
    <section className="page">
      <div className="page-title">
        <span>PEOPLE + PREFERENCES</span>
        <h1>Group</h1>
        <p>
          Keep track of what each person wants to see, do, eat or avoid so the
          final itinerary can maximize overlap without ignoring individual wishes.
        </p>
      </div>

      <DockAwarePanel className="panel group-status">
        <div className="panel-head">
          <span>PLANNING STATE</span>
          <b>{groupPlan.status.replaceAll("-", " ")}</b>
        </div>
        <div className="group-status-grid">
          <div>
            <strong>{preferences.length}</strong>
            <span>wishes recorded</span>
          </div>
          <div>
            <strong>{groupFit.overlaps.length}</strong>
            <span>shared interests</span>
          </div>
          <div>
            <strong>{groupFit.conflicts.length}</strong>
            <span>conflicts to solve</span>
          </div>
        </div>
        <p className="muted">
          Group planning has not started yet. The structure is ready; no interests
          or dislikes are being assumed for anyone.
        </p>
      </DockAwarePanel>

      <div className="group-grid preference-grid">
        {data.members.map((member, index) => {
          const memberPreferences = byMember[member.id] || [];
          return (
            <DockAwarePanel className="panel preference-member" key={member.id}>
              <div className="preference-member-head">
                <div className="member-id">
                  <b>{member.initials}</b>
                  <small>0{index + 1}</small>
                </div>
                <div>
                  <h3>{member.name}</h3>
                  <span>
                    {memberPreferences.length
                      ? `${memberPreferences.length} preference${memberPreferences.length === 1 ? "" : "s"}`
                      : "waiting for wishes"}
                  </span>
                </div>
              </div>
              {memberPreferences.length ? (
                <div className="preference-list">
                  {memberPreferences.map((preference) => (
                    <div className={`preference-row ${preference.kind}`} key={preference.id}>
                      <small>{kindLabel(preference.kind)}</small>
                      <b>{targetLabel(preference)}</b>
                      {preference.note && <span>{preference.note}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="preference-empty">
                  <b>No wishes recorded yet</b>
                  <span>
                    Later you can tell me things like who wants a particular place,
                    food, experience, pace or what someone wants to skip.
                  </span>
                </div>
              )}
            </DockAwarePanel>
          );
        })}
      </div>

      <div className="group-fit-grid">
        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>BEST OVERLAP</span>
            <b>{groupFit.overlaps.length ? "USE THESE FIRST" : "WAITING"}</b>
          </div>
          {groupFit.overlaps.length ? (
            <div className="group-fit-list">
              {groupFit.overlaps.map((row) => (
                <div key={row.label}>
                  <b>{row.label}</b>
                  <span>{row.positive.size} people interested</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              Shared interests will appear here automatically once preferences are
              recorded.
            </p>
          )}
        </DockAwarePanel>

        <DockAwarePanel className="panel">
          <div className="panel-head">
            <span>CONFLICT CHECK</span>
            <b>{groupFit.conflicts.length ? "NEEDS DECISION" : "CLEAR"}</b>
          </div>
          {groupFit.conflicts.length ? (
            <div className="group-fit-list conflict">
              {groupFit.conflicts.map((row) => (
                <div key={row.label}>
                  <b>{row.label}</b>
                  <span>
                    {row.positive.size} want · {row.avoid.size} want to skip
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              If one person wants something another wants to avoid, it will be
              surfaced here instead of silently forcing the itinerary.
            </p>
          )}
        </DockAwarePanel>
      </div>

      <DockAwarePanel className="panel">
        <div className="panel-head">
          <span>GROUP RULE</span>
          <b>NO INVENTED PREFERENCES</b>
        </div>
        <p className="system-copy">
          Preferences are canonical GitHub-backed trip data. When group planning
          starts, I can record each person’s wishes and use the overlap/conflict
          view to shape routes and days around the whole group.
        </p>
      </DockAwarePanel>
    </section>
  );
}
