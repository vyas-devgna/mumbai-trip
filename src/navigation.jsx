import React from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Download,
  Gauge,
  MapPinned,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { PRESS_SPRING } from "./lib.js";

function RupeeIcon() {
  return <span className="dock-rupee" aria-hidden="true">₹</span>;
}

export default function SideNav({
  active,
  onChange,
  onInstall,
  installed,
}) {
  const tabs = [
    ["Now", Gauge],
    ["Plan", CalendarDays],
    ["Map", MapPinned],
    ["Group", Users],
    ["Finance", RupeeIcon],
    ["More", MoreHorizontal],
  ];
  return (
    <nav className="side-nav" aria-label="Trip dashboard navigation">
      {tabs.map(([tab, Icon]) => (
        <motion.button
          key={tab}
          className={active === tab ? "active" : ""}
          whileTap={{ scale: 0.92 }}
          whileHover={{ x: -2 }}
          transition={PRESS_SPRING}
          onClick={() => onChange(tab)}
          aria-current={active === tab ? "page" : undefined}
          aria-label={tab}
        >
          <Icon />
          <b>{tab}</b>
        </motion.button>
      ))}
      {!installed && (
        <>
          <div className="side-nav-sep" />
          <motion.button
            className="install-nav"
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.03 }}
            transition={PRESS_SPRING}
            onClick={onInstall}
            aria-label="Install TripOS"
          >
            <Download />
            <b>Install</b>
          </motion.button>
        </>
      )}
    </nav>
  );
}
