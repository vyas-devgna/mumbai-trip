import React from "react";
import {
  CalendarDays,
  Download,
  Gauge,
  MapPinned,
  Users,
} from "lucide-react";

function RupeeIcon() {
  return <span className="dock-rupee" aria-hidden="true">₹</span>;
}

export default function SideNav({
  active,
  onChange,
  onCommand,
  onInstall,
  installed,
}) {
  const tabs = [
    ["Now", Gauge],
    ["Plan", CalendarDays],
    ["Map", MapPinned],
    ["Group", Users],
    ["Finance", RupeeIcon],
  ];
  return (
    <nav className="bottom-dock" aria-label="Trip dashboard navigation">
      {tabs.map(([tab, Icon]) => (
        <button
          key={tab}
          className={active === tab ? "active" : ""}
          onClick={() => onChange(tab)}
          aria-current={active === tab ? "page" : undefined}
          aria-label={tab}
        >
          <Icon />
          <b>{tab}</b>
        </button>
      ))}
      {!installed && (
        <>
          <div className="side-nav-sep" />
          <button
            className="install-nav"
            onClick={onInstall}
            aria-label="Install TripOS"
          >
            <Download />
            <b>Install</b>
          </button>
        </>
      )}
    </nav>
  );
}
