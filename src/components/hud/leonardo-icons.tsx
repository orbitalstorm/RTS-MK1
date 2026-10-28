"use client";

import React from "react";
import {
  FACTIONS,
  type BuildingKind,
  type FactionId,
  type UnitKind,
} from "../../shared/constants";

export const FactionVectorEmblem = React.memo(function FactionVectorEmblem({
  faction,
  className = "w-8 h-8",
}: {
  faction: FactionId;
  className?: string;
}): React.JSX.Element {
  const fSpec = FACTIONS[faction];
  const gradId = `emblem-grad-${faction}`;
  const coreId = `emblem-core-${faction}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={`Emblème ${fSpec.name}`}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={fSpec.primaryColor} />
          <stop offset="100%" stopColor={fSpec.secondaryColor} />
        </linearGradient>
        <radialGradient id={coreId} cx="32" cy="32" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="45%" stopColor={fSpec.primaryColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={fSpec.secondaryColor} stopOpacity="0.2" />
        </radialGradient>
      </defs>

      {/* Layer 1: Base Shadow & Shield Frame */}
      <g data-layer="base-shadow">
        <polygon
          points="32,4 56,14 56,42 32,60 8,42 8,14"
          fill="#090d16"
          stroke={fSpec.secondaryColor}
          strokeWidth="2.5"
        />
        <polygon
          points="32,8 52,17 52,40 32,55 12,40 12,17"
          fill="#0f172a"
          stroke={fSpec.primaryColor}
          strokeWidth="1.5"
          opacity="0.9"
        />
      </g>

      {/* Layer 2: Faction Specific Main Body */}
      <g data-layer="main-body">
        {faction === "GDI" && (
          <>
            {/* Armored Golden Eagle Wings & Orbital Shield */}
            <circle
              cx="32"
              cy="32"
              r="15"
              fill="none"
              stroke={fSpec.primaryColor}
              strokeWidth="1.5"
              strokeDasharray="4 2"
              opacity="0.55"
            />
            <polygon
              points="32,14 38,24 50,20 44,33 48,40 32,48 16,40 20,33 14,20 26,24"
              fill={`url(#${gradId})`}
              stroke="#fef08a"
              strokeWidth="1.4"
            />
          </>
        )}

        {faction === "NOD" && (
          <>
            {/* Cybernetic Crimson Scorpion Tail & Talon Frame */}
            <polygon
              points="32,10 50,24 44,48 32,54 20,48 14,24"
              fill="#180909"
              stroke="#ef4444"
              strokeWidth="1.5"
            />
            <path
              d="M22 44 C18 34, 20 22, 32 16 C40 16, 44 24, 36 30 L32 25"
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <polygon
              points="32,14 39,24 32,29 25,24"
              fill="#ef4444"
              stroke="#fecaca"
              strokeWidth="1.2"
            />
          </>
        )}

        {faction === "ORDOS" && (
          <>
            {/* High-Frequency Gear & Twin Mechanical Cyan Serpent */}
            <circle
              cx="32"
              cy="32"
              r="16"
              fill="#082f49"
              stroke={fSpec.primaryColor}
              strokeWidth="2.5"
              strokeDasharray="5 3"
            />
            <path
              d="M22 40 C18 28, 28 18, 36 22 C44 26, 44 38, 32 42 C24 44, 24 30, 32 28"
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="4"
              strokeLinecap="round"
            />
          </>
        )}
      </g>

      {/* Layer 3: Sub-Assemblies & Mechanical Details */}
      <g data-layer="sub-assemblies">
        <circle cx="32" cy="32" r="5.5" fill={`url(#${coreId})`} stroke="#ffffff" strokeWidth="1" />
        <circle cx="14" cy="18" r="1.5" fill={fSpec.primaryColor} />
        <circle cx="50" cy="18" r="1.5" fill={fSpec.primaryColor} />
        <circle cx="14" cy="39" r="1.5" fill={fSpec.primaryColor} />
        <circle cx="50" cy="39" r="1.5" fill={fSpec.primaryColor} />
      </g>

      {/* Layer 4: Crisp Specular Highlights */}
      <g data-layer="specular-highlights">
        <polyline
          points="13,36 13,18 32,9 46,15"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.2"
          opacity="0.45"
        />
      </g>
    </svg>
  );
});

export const ProductionItemVectorIcon = React.memo(function ProductionItemVectorIcon({
  itemKind,
  faction,
  className = "w-12 h-12",
}: {
  itemKind: BuildingKind | UnitKind;
  faction: FactionId;
  className?: string;
}): React.JSX.Element {
  const fSpec = FACTIONS[faction];
  const pColor = fSpec.primaryColor;
  const sColor = fSpec.secondaryColor;
  const hullGradId = `hull-${faction}-${itemKind}`;
  const glowGradId = `glow-${faction}-${itemKind}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={itemKind}
    >
      <defs>
        <linearGradient id={hullGradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={pColor} />
          <stop offset="100%" stopColor={sColor} />
        </linearGradient>
        <radialGradient id={glowGradId} cx="32" cy="32" r="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
        </radialGradient>
      </defs>

      {/* LAYER 1: BASE SHADOW & TACTICAL PLATE */}
      <g data-layer="base-shadow">
        <polygon
          points="10,6 54,6 58,10 58,54 54,58 10,58 6,54 6,10"
          fill="#090d16"
          stroke="#1e293b"
          strokeWidth="1.8"
        />
        <polyline points="8,18 8,8 18,8" fill="none" stroke={pColor} strokeWidth="2" />
        <polyline points="46,8 56,8 56,18" fill="none" stroke={pColor} strokeWidth="2" />
        <polyline points="8,46 8,56 18,56" fill="none" stroke={pColor} strokeWidth="2" />
        <polyline points="46,56 56,56 56,46" fill="none" stroke={pColor} strokeWidth="2" />
      </g>

      {/* LAYER 2: MAIN BODY & SILHOUETTE */}
      <g data-layer="main-body">
        {itemKind === "CONSTRUCTION_YARD" && (
          <>
            <rect x="11" y="16" width="42" height="34" rx="3" fill="#1e293b" stroke={pColor} strokeWidth="1.8" />
            <rect x="14" y="20" width="18" height="26" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <rect x="34" y="22" width="15" height="22" fill="#091526" stroke="#38bdf8" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "POWER_PLANT" && (
          <>
            <rect x="12" y="20" width="40" height="28" rx="3" fill={sColor} stroke={pColor} strokeWidth="1.6" />
            <circle cx="23" cy="34" r="9" fill="#0f172a" stroke={pColor} strokeWidth="1.8" />
            <circle cx="41" cy="34" r="9" fill="#0f172a" stroke={pColor} strokeWidth="1.8" />
          </>
        )}

        {itemKind === "REFINERY" && (
          <>
            <rect x="10" y="16" width="26" height="34" rx="2" fill="#334155" stroke={pColor} strokeWidth="1.6" />
            <rect x="36" y="20" width="18" height="28" fill="#eab308" stroke="#0f172a" strokeWidth="1.4" />
            <rect x="39" y="24" width="12" height="20" fill="#0f172a" />
          </>
        )}

        {itemKind === "SILO" && (
          <>
            <circle cx="32" cy="32" r="18" fill="#334155" stroke={pColor} strokeWidth="2.2" />
            <circle cx="32" cy="32" r="12" fill="#1e293b" stroke="#64748b" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "BARRACKS" && (
          <>
            <polygon
              points="14,18 50,18 54,24 54,48 10,48 10,24"
              fill={sColor}
              stroke={pColor}
              strokeWidth="1.8"
            />
            <polygon points="32,18 46,33 32,46 18,33" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
          </>
        )}

        {itemKind === "WAR_FACTORY" && (
          <>
            <rect x="10" y="16" width="44" height="34" rx="2" fill="#27272a" stroke={pColor} strokeWidth="1.8" />
            <rect x="14" y="20" width="10" height="24" fill="#3f3f46" />
            <rect x="27" y="20" width="10" height="24" fill="#52525b" />
            <rect x="40" y="20" width="10" height="24" fill="#3f3f46" />
          </>
        )}

        {itemKind === "RADAR_DOME" && (
          <>
            <polygon points="20,14 44,14 52,24 52,46 44,52 20,52 12,46 12,24" fill={sColor} stroke={pColor} strokeWidth="1.6" />
            <circle cx="32" cy="32" r="15" fill="#091526" stroke="#38bdf8" strokeWidth="2" />
          </>
        )}

        {itemKind === "TECH_CENTER" && (
          <>
            <polygon points="18,12 46,12 52,18 52,46 46,52 18,52 12,46 12,18" fill={sColor} stroke={pColor} strokeWidth="1.8" />
            <circle cx="32" cy="32" r="12" fill="#581c87" stroke="#c084fc" strokeWidth="2" />
          </>
        )}

        {itemKind === "CONCRETE_SLAB" && (
          <>
            <polygon points="14,12 50,12 54,16 54,48 50,52 14,52 10,48 10,16" fill="#525e6e" stroke={pColor} strokeWidth="1.8" />
            <rect x="16" y="18" width="32" height="28" rx="2" fill="#64748b" stroke="#334155" strokeWidth="1.4" />
          </>
        )}

        {itemKind === "SANDBAG_WALL" && (
          <>
            <ellipse cx="22" cy="24" rx="10" ry="5.5" fill="#b59457" stroke="#4a381b" strokeWidth="1.5" />
            <ellipse cx="42" cy="24" rx="10" ry="5.5" fill="#b59457" stroke="#4a381b" strokeWidth="1.5" />
            <ellipse cx="32" cy="33" rx="11" ry="5.8" fill="#d6b87c" stroke="#4a381b" strokeWidth="1.5" />
            <ellipse cx="22" cy="42" rx="10" ry="5.5" fill="#b59457" stroke="#4a381b" strokeWidth="1.5" />
            <ellipse cx="42" cy="42" rx="10" ry="5.5" fill="#b59457" stroke="#4a381b" strokeWidth="1.5" />
          </>
        )}

        {itemKind === "CONCRETE_WALL" && (
          <>
            <polygon points="14,12 50,12 52,16 52,48 50,52 14,52 12,48 12,16" fill="#64748b" stroke={pColor} strokeWidth="2" />
            <rect x="18" y="18" width="28" height="28" rx="3" fill="#475569" stroke="#0f172a" strokeWidth="1.6" />
          </>
        )}

        {itemKind === "GUARD_TOWER" && (
          <>
            <polygon points="20,18 44,18 48,24 48,48 16,48 16,24" fill={sColor} stroke={pColor} strokeWidth="1.8" />
            <circle cx="32" cy="34" r="10" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.6" />
          </>
        )}

        {itemKind === "SAM_SITE" && (
          <>
            <circle cx="32" cy="34" r="17" fill="#1e293b" stroke={pColor} strokeWidth="2" />
            <rect x="18" y="20" width="28" height="22" rx="3" fill={sColor} stroke="#94a3b8" strokeWidth="1.5" />
          </>
        )}

        {itemKind === "OBELISK" && (
          <>
            <polygon points="32,10 48,52 16,52" fill="#18181b" stroke="#ef4444" strokeWidth="2" />
            <polygon points="32,12 40,50 24,50" fill="#450a0a" />
          </>
        )}

        {(itemKind === "RIFLE_INFANTRY" ||
          itemKind === "ROCKET_SOLDIER" ||
          itemKind === "ENGINEER") && (
          <>
            {/* 3-Soldier Tactical Formation */}
            <circle cx="32" cy="20" r="6" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
            <circle cx="20" cy="40" r="6" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
            <circle cx="44" cy="40" r="6" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
          </>
        )}

        {itemKind === "CONSTRUCTOR_BOT" && (
          <>
            <rect x="14" y="18" width="5" height="28" fill="#18181b" />
            <rect x="45" y="18" width="5" height="28" fill="#18181b" />
            <rect x="19" y="18" width="26" height="28" rx="4" fill={sColor} stroke={pColor} strokeWidth="1.8" />
            <circle cx="32" cy="30" r="8" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.5" />
          </>
        )}

        {itemKind === "HARVESTER" && (
          <>
            <rect x="9" y="12" width="6" height="40" fill="#18181b" />
            <rect x="49" y="12" width="6" height="40" fill="#18181b" />
            <rect x="14" y="12" width="36" height="42" rx="4" fill={sColor} stroke={pColor} strokeWidth="2" />
            <rect x="13" y="22" width="5" height="26" rx="2" fill="#475569" stroke="#cbd5e1" strokeWidth="1.2" />
            <rect x="46" y="22" width="5" height="26" rx="2" fill="#475569" stroke="#cbd5e1" strokeWidth="1.2" />
            <rect x="19" y="13" width="26" height="11" rx="2" fill={`url(#${hullGradId})`} />
          </>
        )}

        {itemKind === "RECON_BUGGY" && (
          <>
            <rect x="15" y="16" width="4" height="10" fill="#18181b" />
            <rect x="45" y="16" width="4" height="10" fill="#18181b" />
            <rect x="15" y="36" width="4" height="12" fill="#18181b" />
            <rect x="45" y="36" width="4" height="12" fill="#18181b" />
            <polygon points="32,12 44,22 44,48 20,48 20,22" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.6" />
          </>
        )}

        {itemKind === "MEDIUM_TANK" && (
          <>
            <rect x="14" y="14" width="5" height="36" fill="#18181b" />
            <rect x="45" y="14" width="5" height="36" fill="#18181b" />
            <rect x="18" y="14" width="28" height="36" rx="3" fill={sColor} stroke={pColor} strokeWidth="1.8" />
            <rect x="21" y="17" width="22" height="28" rx="2" fill={`url(#${hullGradId})`} />
          </>
        )}

        {itemKind === "ARTILLERY" && (
          <>
            <rect x="14" y="12" width="5" height="40" fill="#18181b" />
            <rect x="45" y="12" width="5" height="40" fill="#18181b" />
            <rect x="18" y="14" width="28" height="38" rx="3" fill={sColor} stroke={pColor} strokeWidth="1.8" />
          </>
        )}

        {itemKind === "MAMMOTH_TANK" && (
          <>
            <rect x="11" y="12" width="6" height="18" fill="#18181b" />
            <rect x="47" y="12" width="6" height="18" fill="#18181b" />
            <rect x="11" y="34" width="6" height="18" fill="#18181b" />
            <rect x="47" y="34" width="6" height="18" fill="#18181b" />
            <rect x="16" y="14" width="32" height="38" rx="4" fill={sColor} stroke={pColor} strokeWidth="2" />
            <rect x="19" y="17" width="26" height="30" rx="3" fill={`url(#${hullGradId})`} />
          </>
        )}

        {itemKind === "MCV" && (
          <>
            <rect x="12" y="12" width="6" height="40" fill="#18181b" />
            <rect x="46" y="12" width="6" height="40" fill="#18181b" />
            <rect x="17" y="12" width="30" height="40" rx="4" fill={sColor} stroke={pColor} strokeWidth="1.8" />
            <rect x="20" y="14" width="24" height="12" rx="2" fill={`url(#${hullGradId})`} />
          </>
        )}
      </g>

      {/* LAYER 3: MECHANICAL SUB-ASSEMBLIES (Turrets, Barrels, Crystals, Antennas, Cranes) */}
      <g data-layer="sub-assemblies">
        {itemKind === "CONSTRUCTION_YARD" && (
          <>
            <line x1="28" y1="42" x2="48" y2="20" stroke="#eab308" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="28" cy="42" r="4" fill="#334155" stroke={pColor} strokeWidth="1.5" />
          </>
        )}

        {itemKind === "POWER_PLANT" && (
          <>
            <circle cx="23" cy="34" r="4.5" fill="#38bdf8" />
            <circle cx="41" cy="34" r="4.5" fill="#38bdf8" />
            <line x1="23" y1="22" x2="41" y2="22" stroke="#f59e0b" strokeWidth="2.5" />
          </>
        )}

        {itemKind === "REFINERY" && (
          <>
            <circle cx="22" cy="26" r="5" fill="#f97316" stroke="#cbd5e1" strokeWidth="1.4" />
            <circle cx="22" cy="40" r="5" fill="#f97316" stroke="#cbd5e1" strokeWidth="1.4" />
            <circle cx="45" cy="34" r="4.5" fill="#22c55e" />
          </>
        )}

        {itemKind === "SILO" && (
          <>
            <rect x="29" y="18" width="6" height="28" rx="2" fill="#091526" />
            <rect x="30.5" y="22" width="3" height="21" rx="1" fill="#22c55e" />
          </>
        )}

        {itemKind === "BARRACKS" && (
          <circle cx="32" cy="33" r="4" fill="#fef08a" stroke="#0f172a" strokeWidth="1.2" />
        )}

        {itemKind === "WAR_FACTORY" && (
          <>
            <rect x="15" y="22" width="8" height="4" fill={pColor} />
            <rect x="28" y="22" width="8" height="4" fill={pColor} />
            <rect x="41" y="22" width="8" height="4" fill={pColor} />
          </>
        )}

        {itemKind === "RADAR_DOME" && (
          <>
            <ellipse cx="32" cy="32" rx="12" ry="7" fill="none" stroke="#7dd3fc" strokeWidth="1.6" transform="rotate(-25 32 32)" />
            <circle cx="32" cy="30" r="3" fill="#38bdf8" />
          </>
        )}

        {itemKind === "TECH_CENTER" && (
          <>
            <circle cx="32" cy="32" r="5.5" fill="#f0abfc" />
            <circle cx="20" cy="20" r="3" fill="#38bdf8" />
            <circle cx="44" cy="20" r="3" fill="#38bdf8" />
            <circle cx="20" cy="44" r="3" fill="#38bdf8" />
            <circle cx="44" cy="44" r="3" fill="#38bdf8" />
          </>
        )}

        {itemKind === "CONCRETE_SLAB" && (
          <>
            <line x1="16" y1="32" x2="48" y2="32" stroke="#1e293b" strokeWidth="1.6" />
            <line x1="32" y1="18" x2="32" y2="46" stroke="#1e293b" strokeWidth="1.6" />
            <circle cx="20" cy="22" r="2" fill="#cbd5e1" />
            <circle cx="44" cy="22" r="2" fill="#cbd5e1" />
            <circle cx="20" cy="42" r="2" fill="#cbd5e1" />
            <circle cx="44" cy="42" r="2" fill="#cbd5e1" />
          </>
        )}

        {itemKind === "SANDBAG_WALL" && (
          <>
            <line x1="16" y1="24" x2="28" y2="24" stroke="#fef3c7" strokeWidth="1.2" opacity="0.6" />
            <line x1="36" y1="24" x2="48" y2="24" stroke="#fef3c7" strokeWidth="1.2" opacity="0.6" />
            <line x1="25" y1="33" x2="39" y2="33" stroke="#fef3c7" strokeWidth="1.2" opacity="0.7" />
          </>
        )}

        {itemKind === "CONCRETE_WALL" && (
          <>
            <rect x="29" y="14" width="6" height="36" fill={sColor} />
            <rect x="14" y="29" width="36" height="6" fill={sColor} />
            <circle cx="32" cy="32" r="5" fill={pColor} stroke="#0f172a" strokeWidth="1.4" />
          </>
        )}

        {itemKind === "GUARD_TOWER" && (
          <>
            <rect x="27" y="10" width="3" height="20" fill="#e2e8f0" />
            <rect x="34" y="10" width="3" height="20" fill="#e2e8f0" />
            <circle cx="32" cy="34" r="3.5" fill="#38bdf8" />
          </>
        )}

        {itemKind === "SAM_SITE" && (
          <>
            <rect x="21" y="14" width="3" height="10" fill="#f8fafc" />
            <rect x="27" y="14" width="3" height="10" fill="#f8fafc" />
            <rect x="34" y="14" width="3" height="10" fill="#f8fafc" />
            <rect x="40" y="14" width="3" height="10" fill="#f8fafc" />
            <circle cx="22.5" cy="14" r="1.8" fill="#ef4444" />
            <circle cx="28.5" cy="14" r="1.8" fill="#ef4444" />
            <circle cx="35.5" cy="14" r="1.8" fill="#ef4444" />
            <circle cx="41.5" cy="14" r="1.8" fill="#ef4444" />
          </>
        )}

        {itemKind === "OBELISK" && (
          <>
            <circle cx="32" cy="13" r="5" fill="#ef4444" />
            <circle cx="32" cy="13" r="2.2" fill="#ffffff" />
            <line x1="25" y1="30" x2="39" y2="30" stroke="#f59e0b" strokeWidth="2" />
            <line x1="22" y1="40" x2="42" y2="40" stroke="#f59e0b" strokeWidth="2" />
          </>
        )}

        {itemKind === "RIFLE_INFANTRY" && (
          <>
            <line x1="35" y1="20" x2="35" y2="10" stroke="#e2e8f0" strokeWidth="2.2" />
            <line x1="23" y1="40" x2="23" y2="30" stroke="#e2e8f0" strokeWidth="2.2" />
            <line x1="47" y1="40" x2="47" y2="30" stroke="#e2e8f0" strokeWidth="2.2" />
          </>
        )}

        {itemKind === "ROCKET_SOLDIER" && (
          <>
            <rect x="35" y="10" width="3.5" height="13" fill="#cbd5e1" />
            <circle cx="36.7" cy="10" r="2" fill="#ef4444" />
            <rect x="23" y="30" width="3.5" height="13" fill="#cbd5e1" />
            <rect x="47" y="30" width="3.5" height="13" fill="#cbd5e1" />
          </>
        )}

        {itemKind === "ENGINEER" && (
          <>
            <rect x="28" y="23" width="8" height="4" fill="#eab308" />
            <circle cx="35" cy="13" r="2.5" fill="#38bdf8" />
            <circle cx="23" cy="33" r="2.5" fill="#38bdf8" />
            <circle cx="47" cy="33" r="2.5" fill="#38bdf8" />
          </>
        )}

        {itemKind === "CONSTRUCTOR_BOT" && (
          <>
            <polyline points="22,22 20,11 26,8" fill="none" stroke="#eab308" strokeWidth="2.8" strokeLinecap="round" />
            <polyline points="42,22 44,11 38,8" fill="none" stroke="#eab308" strokeWidth="2.8" strokeLinecap="round" />
            <circle cx="26" cy="8" r="2.6" fill="#38bdf8" />
            <circle cx="38" cy="8" r="2.6" fill="#38bdf8" />
            <rect x="27" y="25" width="10" height="3" fill="#38bdf8" />
          </>
        )}

        {itemKind === "HARVESTER" && (
          <>
            <rect x="17" y="7" width="30" height="5" rx="1" fill="#334155" stroke="#94a3b8" strokeWidth="1.2" />
            <rect x="19" y="25" width="26" height="25" rx="2" fill="#064e3b" stroke={pColor} strokeWidth="1.4" />
            <ellipse cx="32" cy="38" rx="10" ry="9" fill="#10b981" />
            <ellipse cx="30" cy="36" rx="5.5" ry="5" fill="#6ee7b7" />
            <circle cx="32" cy="9" r="3.5" fill="#22c55e" />
          </>
        )}

        {itemKind === "RECON_BUGGY" && (
          <>
            <rect x="30.5" y="10" width="3" height="16" fill="#e2e8f0" />
            <circle cx="32" cy="28" r="5" fill="#1e293b" stroke={pColor} strokeWidth="1.5" />
          </>
        )}

        {itemKind === "MEDIUM_TANK" && (
          <>
            <rect x="30" y="7" width="4" height="22" fill="#e2e8f0" />
            <rect x="28.5" y="6" width="7" height="3.5" fill="#475569" />
            <polygon points="25,24 39,24 42,32 39,40 25,40 22,32" fill={pColor} stroke="#0f172a" strokeWidth="1.6" />
          </>
        )}

        {itemKind === "ARTILLERY" && (
          <>
            <rect x="28" y="8" width="8" height="26" rx="1" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.2" />
            <rect x="23" y="22" width="18" height="22" rx="2" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.5" />
          </>
        )}

        {itemKind === "MAMMOTH_TANK" && (
          <>
            <rect x="25" y="6" width="3.5" height="20" fill="#e2e8f0" />
            <rect x="35.5" y="6" width="3.5" height="20" fill="#e2e8f0" />
            <polygon points="22,22 42,22 45,32 42,42 22,42 19,32" fill={pColor} stroke="#0f172a" strokeWidth="1.8" />
          </>
        )}

        {itemKind === "MCV" && (
          <>
            <rect x="22" y="16" width="20" height="4" fill="#38bdf8" />
            <rect x="22" y="28" width="20" height="18" fill="#334155" />
            <line x1="25" y1="43" x2="39" y2="30" stroke="#eab308" strokeWidth="3.5" strokeLinecap="round" />
          </>
        )}
      </g>

      {/* LAYER 4: SPECULAR HIGHLIGHTS & RIM LIGHTING */}
      <g data-layer="specular-highlights">
        <polyline
          points="10,32 10,10 32,10"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1"
          opacity="0.35"
        />
      </g>
    </svg>
  );
});
