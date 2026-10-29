"use client";

import React from "react";
import {
  BUILDINGS,
  FACTIONS,
  type BuildingKind,
  type FactionId,
  type UnitKind,
} from "../../shared/constants";
import {
  getActiveVectorVariant,
  type VectorVariantProposal,
} from "../../shared/schemas/vector-variants";

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
  const bevelId = `emblem-bevel-${faction}`;

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
        <linearGradient id={bevelId} x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="45%" stopColor={fSpec.primaryColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor="#090d16" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id={coreId} cx="32" cy="32" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor={fSpec.primaryColor} stopOpacity="0.88" />
          <stop offset="100%" stopColor={fSpec.secondaryColor} stopOpacity="0.2" />
        </radialGradient>
      </defs>

      {/* Layer 1: Base Shadow & Multi-Beveled Tactical Shield Frame */}
      <g data-layer="base-shadow">
        <polygon
          points="32,3 58,13 58,43 32,61 6,43 6,13"
          fill="#05080f"
          stroke={fSpec.secondaryColor}
          strokeWidth="2.4"
        />
        <polygon
          points="32,6 54,15 54,41 32,57 10,41 10,15"
          fill="#0b1324"
          stroke={fSpec.primaryColor}
          strokeWidth="1.5"
        />
        {/* Shaded SE inner shield bevel */}
        <polygon
          points="32,6 54,15 54,41 32,57"
          fill="#060a12"
          opacity="0.45"
        />
        {/* Inner hexagonal tactical recess */}
        <polygon
          points="32,10 50,18 50,39 32,52 14,39 14,18"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1"
        />
      </g>

      {/* Layer 2: Faction Specific Multi-Layered Main Body */}
      <g data-layer="main-body">
        {faction === "GDI" && (
          <>
            {/* Precision 12-tooth orbital gear crown */}
            <circle
              cx="32"
              cy="31"
              r="18.5"
              fill="none"
              stroke={fSpec.secondaryColor}
              strokeWidth="3.2"
              strokeDasharray="3.2 1.6"
            />
            <circle
              cx="32"
              cy="31"
              r="16.5"
              fill="#091526"
              stroke={fSpec.primaryColor}
              strokeWidth="1.3"
            />
            {/* Orbital latitude/longitude grid */}
            <ellipse cx="32" cy="31" rx="16" ry="6.5" fill="none" stroke="#38bdf8" strokeWidth="0.8" opacity="0.45" />
            <ellipse cx="32" cy="31" rx="6.5" ry="16" fill="none" stroke="#38bdf8" strokeWidth="0.8" opacity="0.45" />

            {/* Lower secondary beveled wing feathers */}
            <polygon
              points="32,44 12,35 9,27 23,31 32,37 41,31 55,27 52,35"
              fill={fSpec.secondaryColor}
              stroke="#78350f"
              strokeWidth="1.1"
            />
            {/* Middle primary beveled wing feathers */}
            <polygon
              points="32,39 10,28 8,20 24,25 32,31 40,25 56,20 54,28"
              fill={`url(#${gradId})`}
              stroke="#fde047"
              strokeWidth="1.2"
            />
            {/* Upper razor-beveled golden flight feathers & raptor head */}
            <polygon
              points="32,11 36,15 34,21 54,15 51,23 37,27 32,49 27,27 13,23 10,15 30,21 28,15"
              fill={`url(#${bevelId})`}
              stroke="#fef08a"
              strokeWidth="1.3"
            />
            {/* Eagle armored beak & brow crest */}
            <polygon
              points="32,12 35.5,16 32,20 28.5,16"
              fill="#fef9c3"
              stroke="#ca8a04"
              strokeWidth="1"
            />
          </>
        )}

        {faction === "NOD" && (
          <>
            {/* Stealth crimson inner triangular carapace */}
            <polygon
              points="32,9 51,23 45,49 32,55 19,49 13,23"
              fill="#180608"
              stroke="#dc2626"
              strokeWidth="1.5"
            />
            {/* Twin cybernetic scorpion pincers / pedipalps at base */}
            <path
              d="M24,48 C15,45 13,34 19,28 L22,33 C19,36 20,42 26,44 Z"
              fill={`url(#${gradId})`}
              stroke="#fca5a5"
              strokeWidth="1.1"
            />
            <path
              d="M40,48 C49,45 51,34 45,28 L42,33 C45,36 44,42 38,44 Z"
              fill="#7f1d1d"
              stroke="#ef4444"
              strokeWidth="1.1"
            />
            {/* Multi-segmented cybernetic scorpion tail (5 armored vertebrae + hydraulic spine) */}
            <polygon points="27,48 37,48 35,41 29,41" fill="#991b1b" stroke="#f87171" strokeWidth="1.1" />
            <polygon points="25,41 34,40 31,33 23,35" fill="#b91c1c" stroke="#fca5a5" strokeWidth="1.1" />
            <polygon points="22,34 30,32 29,25 21,27" fill="#dc2626" stroke="#fca5a5" strokeWidth="1.1" />
            <polygon points="22,26 30,25 34,19 26,18" fill="#ef4444" stroke="#fecaca" strokeWidth="1.1" />
            <polygon points="28,18 36,20 41,25 35,14" fill={`url(#${gradId})`} stroke="#fecaca" strokeWidth="1.2" />

            {/* Faceted Ruby Stinger & Laser Venom Tip */}
            <polygon
              points="36,13 46,21 41,30 34,24"
              fill="#dc2626"
              stroke="#fecaca"
              strokeWidth="1.3"
            />
            <polygon
              points="37,15 44,21 39,27 35,22"
              fill="#f43f5e"
            />
            <polygon
              points="41,30 43,35 38,29"
              fill="#ffffff"
            />
          </>
        )}

        {faction === "ORDOS" && (
          <>
            {/* Cryogenic outer gimbal ring */}
            <circle
              cx="32"
              cy="32"
              r="18"
              fill="#041e2e"
              stroke={fSpec.secondaryColor}
              strokeWidth="2.4"
              strokeDasharray="6 2.5"
            />
            {/* Tilted cryogenic gyroscope inner rings */}
            <ellipse
              cx="32"
              cy="32"
              rx="15"
              ry="7.5"
              transform="rotate(-30 32 32)"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
            <ellipse
              cx="32"
              cy="32"
              rx="15"
              ry="7.5"
              transform="rotate(30 32 32)"
              fill="none"
              stroke={fSpec.primaryColor}
              strokeWidth="1.5"
            />
            {/* Central Caduceus Cryogenic Axial Rod */}
            <line x1="32" y1="11" x2="32" y2="51" stroke="#e0f2fe" strokeWidth="2.4" />
            <polygon points="32,8 36,14 32,17 28,14" fill="#38bdf8" stroke="#ffffff" strokeWidth="1" />

            {/* Twin Intertwined Mechanical Caduceus Serpents */}
            <path
              d="M24,47 C16,41 18,32 32,28 C46,24 46,16 37,14"
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            <path
              d="M40,47 C48,41 46,32 32,28 C18,24 18,16 27,14"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Hooded Cyber-Serpent Heads facing the apex */}
            <polygon points="27,14 21,12 23,18" fill="#67e8f9" stroke="#083344" strokeWidth="0.9" />
            <polygon points="37,14 43,12 41,18" fill="#6ee7b7" stroke="#064e3b" strokeWidth="0.9" />
          </>
        )}
      </g>

      {/* Layer 3: Sub-Assemblies & Mechanical Details */}
      <g data-layer="sub-assemblies">
        <circle cx="32" cy="32" r="5" fill={`url(#${coreId})`} stroke="#ffffff" strokeWidth="1.1" />
        <circle cx="32" cy="32" r="2" fill="#ffffff" />
        {/* 6 Hexagonal Shield Anchor Bolts */}
        <circle cx="32" cy="7.5" r="1.3" fill={fSpec.primaryColor} />
        <circle cx="51.5" cy="16.5" r="1.3" fill={fSpec.primaryColor} />
        <circle cx="51.5" cy="39.5" r="1.3" fill={fSpec.primaryColor} />
        <circle cx="32" cy="54" r="1.3" fill={fSpec.primaryColor} />
        <circle cx="12.5" cy="39.5" r="1.3" fill={fSpec.primaryColor} />
        <circle cx="12.5" cy="16.5" r="1.3" fill={fSpec.primaryColor} />
      </g>

      {/* Layer 4: Crisp NW Specular Highlights */}
      <g data-layer="specular-highlights">
        <polyline
          points="11,39 11,16 32,7 48,14"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.3"
          opacity="0.55"
        />
      </g>
    </svg>
  );
});

export const ProductionItemVectorIcon = React.memo(function ProductionItemVectorIcon({
  itemKind,
  faction,
  className = "h-full w-full",
  variantOverride,
}: {
  itemKind: BuildingKind | UnitKind;
  faction: FactionId;
  className?: string;
  variantOverride?: VectorVariantProposal;
}): React.JSX.Element {
  const fSpec = FACTIONS[faction];
  const isBuilding = Object.prototype.hasOwnProperty.call(BUILDINGS, itemKind);
  const assetKey = `${isBuilding ? "BUILDING" : "UNIT"}:${itemKind}`;
  const activeVariant = variantOverride ?? getActiveVectorVariant(assetKey);
  const isCustomVariant = activeVariant.variantId !== "v1_classic_mk1";
  const pColor = fSpec.primaryColor;
  const sColor = fSpec.secondaryColor;
  const uid = `${faction}-${itemKind}-${activeVariant.variantId}`;
  const hullGradId = `hull-${uid}`;
  const shadeGradId = `shade-${uid}`;
  const glowGradId = `glow-${uid}`;
  const bgGradId = `bg-${uid}`;

  return (
    <svg
      viewBox="4 4 56 56"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={itemKind}
    >
      <defs>
        <linearGradient id={bgGradId} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="55%" stopColor="#090d16" />
          <stop offset="100%" stopColor="#05070c" />
        </linearGradient>
        <linearGradient id={hullGradId} x1="8" y1="8" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={pColor} />
          <stop offset="100%" stopColor={sColor} />
        </linearGradient>
        <linearGradient id={shadeGradId} x1="28" y1="18" x2="58" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={sColor} />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>
        <radialGradient id={glowGradId} cx="32" cy="30" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.08" />
        </radialGradient>
      </defs>

      {/* LAYER 1: FULL-BLEED C&C CAMEO BACKDROP & ISOMETRIC GROUND DECK */}
      <g data-layer="base-shadow">
        <rect
          x="4"
          y="4"
          width="56"
          height="56"
          rx="2.5"
          fill={`url(#${bgGradId})`}
          stroke="#1e293b"
          strokeWidth="1.2"
        />
        {/* Isometric 3/4 tactical horizon & ground shadow plane */}
        <polygon
          points="5,38 32,26 59,38 59,59 5,59"
          fill="#0b111e"
          opacity="0.85"
        />
        <line x1="5" y1="38" x2="32" y2="26" stroke="#1e293b" strokeWidth="0.9" />
        <line x1="32" y1="26" x2="59" y2="38" stroke="#1e293b" strokeWidth="0.9" />
        {/* South-East cast shadow under 3/4 cameo subject */}
        <ellipse cx="34" cy="48" rx="21" ry="8" fill="#020409" opacity="0.75" />

        {/* Tight full-frame tactical corner brackets */}
        <polyline points="5.5,13 5.5,5.5 13,5.5" fill="none" stroke={pColor} strokeWidth="1.8" />
        <polyline points="51,5.5 58.5,5.5 58.5,13" fill="none" stroke={pColor} strokeWidth="1.8" />
        <polyline points="5.5,51 5.5,58.5 13,58.5" fill="none" stroke={pColor} strokeWidth="1.8" />
        <polyline points="51,58.5 58.5,58.5 58.5,51" fill="none" stroke={pColor} strokeWidth="1.8" />
      </g>

      {/* LAYER 2: 3/4 ISOMETRIC TACTICAL SILHOUETTE & MULTI-PLANE VOLUMES (NW Sunlit / SE Shaded) */}
      <g data-layer="main-body">
        {itemKind === "CONSTRUCTION_YARD" && (
          <>
            {/* 3/4 Isometric Base Foundation Plinth */}
            <polygon points="32,28 57,39 32,55 7,42" fill="#1e293b" stroke={pColor} strokeWidth="1.4" />
            <polygon points="32,55 57,39 57,44 32,58" fill="#090d16" />
            <polygon points="7,42 32,55 32,58 7,46" fill="#334155" />
            {/* Left Command Bastion (3/4 block: roof, NW sunlit left face, SE shaded right face) */}
            <polygon points="22,13 36,19 24,26 10,19" fill={pColor} stroke="#0f172a" strokeWidth="1.1" />
            <polygon points="10,19 24,26 24,45 10,38" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="24,26 36,19 36,38 24,45" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            {/* Right Assembly Hangar Bay */}
            <polygon points="36,21 54,29 44,36 26,27" fill="#334155" stroke={pColor} strokeWidth="1.1" />
            <polygon points="26,27 44,36 44,49 26,40" fill="#091526" stroke="#38bdf8" strokeWidth="1.2" />
            <polygon points="44,36 54,29 54,42 44,49" fill="#0f172a" stroke={sColor} strokeWidth="1.1" />
          </>
        )}

        {itemKind === "POWER_PLANT" && (
          <>
            {/* 3/4 Stepped Reactor Deck */}
            <polygon points="30,27 56,38 32,55 8,42" fill="#1e293b" stroke={pColor} strokeWidth="1.3" />
            {/* Left front reactor hall (sunlit NW face + shaded SE face) */}
            <polygon points="10,27 28,36 28,49 10,39" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="28,36 42,28 42,41 28,49" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="22,20 42,28 28,36 10,27" fill={pColor} stroke="#0f172a" strokeWidth="1.1" />
            {/* Twin 3/4 Cylindrical Cooling Towers (Back-right & Center-left) */}
            <path d="M35,16 L35,36 C35,40 51,40 51,36 L51,16 Z" fill="#1e293b" stroke={pColor} strokeWidth="1.3" />
            <ellipse cx="43" cy="16" rx="8" ry="4.2" fill="#091526" stroke={pColor} strokeWidth="1.4" />
            <path d="M16,19 L16,40 C16,44 32,44 32,40 L32,19 Z" fill="#334155" stroke={pColor} strokeWidth="1.4" />
            <ellipse cx="24" cy="19" rx="8" ry="4.2" fill="#091526" stroke="#38bdf8" strokeWidth="1.5" />
          </>
        )}

        {itemKind === "REFINERY" && (
          <>
            {/* 3/4 Industrial Processing Platform & Unloading Ramp */}
            <polygon points="31,26 57,38 33,56 7,42" fill="#1e293b" stroke={pColor} strokeWidth="1.4" />
            {/* Twin Tall Smelting Distillation Towers (Left NW sunlit side) */}
            <path d="M10,15 L10,41 C10,44 21,44 21,41 L21,15 Z" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <ellipse cx="15.5" cy="15" rx="5.5" ry="2.8" fill={pColor} stroke="#fef08a" strokeWidth="1.1" />
            <path d="M21,12 L21,38 C21,41 32,41 32,38 L32,12 Z" fill="#334155" stroke={pColor} strokeWidth="1.2" />
            <ellipse cx="26.5" cy="12" rx="5.5" ry="2.8" fill="#f97316" stroke="#fef08a" strokeWidth="1.1" />
            {/* Right Harvester Unloading Hopper Bay in 3/4 perspective */}
            <polygon points="28,28 48,37 48,51 28,42" fill="#0f172a" stroke="#eab308" strokeWidth="1.4" />
            <polygon points="48,37 56,31 56,45 48,51" fill="#090d16" stroke={sColor} strokeWidth="1.2" />
            <polygon points="36,22 56,31 48,37 28,28" fill="#eab308" stroke="#0f172a" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "SILO" && (
          <>
            {/* Octagonal 3/4 Containment Pad */}
            <polygon points="32,32 54,42 32,56 10,42" fill="#1e293b" stroke={pColor} strokeWidth="1.4" />
            {/* Massive 3/4 Pressurized Cylindrical Ore Silo Dome */}
            <path
              d="M15,22 L15,44 C15,51 49,51 49,44 L49,22 Z"
              fill="#334155"
              stroke={pColor}
              strokeWidth="1.6"
            />
            {/* Sunlit NW cylinder half vs Shaded SE cylinder half */}
            <path d="M15,22 L15,44 C15,49 32,50 32,50 L32,22 Z" fill={`url(#${hullGradId})`} opacity="0.82" />
            <path d="M32,22 L32,50 C32,50 49,49 49,44 L49,22 Z" fill="#0f172a" opacity="0.65" />
            {/* Armored hemispherical dome cap */}
            <ellipse cx="32" cy="22" rx="17" ry="8" fill="#475569" stroke={pColor} strokeWidth="1.5" />
            <ellipse cx="32" cy="20.5" rx="11" ry="5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.1" />
          </>
        )}

        {itemKind === "BARRACKS" && (
          <>
            {/* 3/4 Fortified Bunker Base & Muster Parade Ramp */}
            <polygon points="32,27 56,39 32,56 8,42" fill="#1e293b" stroke={pColor} strokeWidth="1.4" />
            {/* Sloped Armored Bunker Left Wall (Sunlit NW) */}
            <polygon points="10,27 32,38 32,52 10,40" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            {/* Shaded SE Right Wall with armored blast door */}
            <polygon points="32,38 54,26 54,40 32,52" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            {/* Ribbed Tactical Roof Deck */}
            <polygon points="32,14 54,26 32,38 10,27" fill="#334155" stroke={pColor} strokeWidth="1.5" />
            {/* Recessed dark armored troop exit portal on SE flank */}
            <polygon points="36,39 48,32 48,43 36,50" fill="#060911" stroke="#eab308" strokeWidth="1.1" />
          </>
        )}

        {itemKind === "WAR_FACTORY" && (
          <>
            {/* 3/4 Heavy Tank Hangar & Roll-out Treadway */}
            <polygon points="32,26 58,38 32,57 6,43" fill="#18181b" stroke={pColor} strokeWidth="1.4" />
            {/* Sunlit NW Side Wall */}
            <polygon points="8,24 30,36 30,52 8,40" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            {/* Shaded SE Front Roll-out Hangar Facade */}
            <polygon points="30,36 55,24 55,41 30,52" fill="#1e293b" stroke={pColor} strokeWidth="1.3" />
            {/* 3 Sawtooth Industrial Roof Bays in 3/4 perspective */}
            <polygon points="20,13 43,24 30,36 8,24" fill="#3f3f46" stroke={pColor} strokeWidth="1.2" />
            <polygon points="28,11 50,22 41,29 19,18" fill="#52525b" stroke={pColor} strokeWidth="1.2" />
            <polygon points="35,9 55,20 48,26 27,15" fill="#3f3f46" stroke={pColor} strokeWidth="1.2" />
            {/* Illuminated Armored Bay Door */}
            <polygon points="34,37 51,29 51,42 34,50" fill="#091526" stroke="#eab308" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "RADAR_DOME" && (
          <>
            {/* 3/4 Octagonal Sensor Bunker */}
            <polygon points="32,30 55,40 32,55 9,41" fill="#1e293b" stroke={pColor} strokeWidth="1.4" />
            <polygon points="12,28 32,38 32,50 12,40" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="32,38 52,28 52,40 32,50" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="32,19 52,28 32,38 12,28" fill="#334155" stroke={pColor} strokeWidth="1.3" />
            {/* Elevated 3/4 Parabolic Dish tilted toward NW/NE sky */}
            <ellipse
              cx="33"
              cy="20"
              rx="18"
              ry="10.5"
              transform="rotate(-18 33 20)"
              fill="#091526"
              stroke="#38bdf8"
              strokeWidth="1.8"
            />
            <ellipse
              cx="33"
              cy="20"
              rx="12"
              ry="6.5"
              transform="rotate(-18 33 20)"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="1.1"
              strokeDasharray="3 2"
            />
          </>
        )}

        {itemKind === "TECH_CENTER" && (
          <>
            {/* 3/4 Stepped Quantum Research Citadel */}
            <polygon points="32,29 57,40 32,56 7,41" fill="#1e293b" stroke={pColor} strokeWidth="1.4" />
            <polygon points="11,24 32,35 32,50 11,39" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="32,35 53,24 53,39 32,50" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="32,14 53,24 32,35 11,24" fill="#334155" stroke={pColor} strokeWidth="1.3" />
            {/* Central Luminescent Quantum Core Sphere & Cryo Pylons */}
            <circle cx="32" cy="23" r="10.5" fill="#3b0764" stroke="#c084fc" strokeWidth="1.8" />
            <path d="M12,17 L12,34 L18,37 L18,20 Z" fill="#0284c7" stroke="#bae6fd" strokeWidth="1" />
            <path d="M46,20 L46,37 L52,34 L52,17 Z" fill="#0369a1" stroke="#38bdf8" strokeWidth="1" />
          </>
        )}

        {itemKind === "SILVER_MINE" && (
          <>
            {/* 3/4 Jagged Silver Ore Mountain Crag & Excavated Mine Portal */}
            <polygon points="8,44 16,16 34,10 52,18 56,43 32,56" fill="#334155" stroke={pColor} strokeWidth="1.5" />
            {/* Sunlit NW rock escarpment */}
            <polygon points="8,44 16,16 34,10 30,36 18,49" fill="#64748b" />
            {/* Shaded SE rock face */}
            <polygon points="34,10 52,18 56,43 32,56 30,36" fill="#1e293b" />
            {/* Armored 3/4 Subterranean Tunnel Portal Arch */}
            <polygon points="22,49 25,25 43,29 45,51" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="25,49 28,29 40,32 42,51" fill="#05070c" />
          </>
        )}

        {itemKind === "CONCRETE_SLAB" && (
          <>
            {/* 3/4 Isometric Heavy Reinforced Concrete Slab with thick stratigraphic lip */}
            <polygon points="32,15 57,29 32,45 7,29" fill="#64748b" stroke={pColor} strokeWidth="1.5" />
            {/* Sunlit SW/NW left thickness lip */}
            <polygon points="7,29 32,45 32,52 7,36" fill="#475569" stroke="#0f172a" strokeWidth="1.2" />
            {/* Shaded SE right thickness lip */}
            <polygon points="32,45 57,29 57,36 32,52" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
            {/* Inner recessed armor plate */}
            <polygon points="32,19 50,29 32,40 14,29" fill="#525e6e" stroke="#334155" strokeWidth="1.1" />
          </>
        )}

        {itemKind === "SANDBAG_WALL" && (
          <>
            {/* 3/4 Isometric Stacked Tactical Burlap Sandbag Parapet (3 Courses) */}
            <ellipse cx="19" cy="41" rx="9.5" ry="5" fill="#9a7b42" stroke="#4a381b" strokeWidth="1.3" />
            <ellipse cx="33" cy="45" rx="9.5" ry="5" fill="#856835" stroke="#4a381b" strokeWidth="1.3" />
            <ellipse cx="46" cy="39" rx="9.5" ry="5" fill="#7c6234" stroke="#4a381b" strokeWidth="1.3" />
            {/* Middle staggered course */}
            <ellipse cx="25" cy="35" rx="9.5" ry="5" fill="#b59457" stroke="#4a381b" strokeWidth="1.3" />
            <ellipse cx="39" cy="33" rx="9.5" ry="5" fill="#9a7b42" stroke="#4a381b" strokeWidth="1.3" />
            {/* Top sunlit course */}
            <ellipse cx="32" cy="27" rx="10" ry="5.2" fill="#d6b87c" stroke="#4a381b" strokeWidth="1.4" />
          </>
        )}

        {itemKind === "CONCRETE_WALL" && (
          <>
            {/* 3/4 Isometric Fortified Ferro-Concrete Bastion Segment with Buttresses */}
            <polygon points="10,27 30,39 30,54 10,41" fill="#64748b" stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="30,39 54,25 54,40 30,54" fill="#334155" stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="34,14 54,25 30,39 10,27" fill="#94a3b8" stroke={pColor} strokeWidth="1.5" />
            {/* Raised anti-tank parapet crest */}
            <polygon points="33,17 48,25 30,35 16,27" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.1" />
          </>
        )}

        {itemKind === "GUARD_TOWER" && (
          <>
            {/* 3/4 Tall Fortified Watchtower Casemate & Rotary Gunhouse */}
            <polygon points="32,33 52,43 32,56 12,43" fill="#1e293b" stroke={pColor} strokeWidth="1.4" />
            {/* Tower column: NW sunlit face + SE shaded face */}
            <polygon points="17,24 32,32 32,51 17,42" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="32,32 47,24 47,42 32,51" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            {/* Upper 3/4 Armored Rotary Turret Pod */}
            <polygon points="32,13 48,21 32,29 16,21" fill={pColor} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="16,21 32,29 32,35 16,27" fill="#475569" stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="32,29 48,21 48,27 32,35" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "SAM_SITE" && (
          <>
            {/* 3/4 Rotary Missile Bunker Pedestal */}
            <polygon points="32,31 56,42 32,56 8,42" fill="#1e293b" stroke={pColor} strokeWidth="1.5" />
            <ellipse cx="32" cy="41" rx="16" ry="8" fill="#0f172a" stroke={sColor} strokeWidth="1.3" />
            {/* Inclined 3/4 Quad SAM Launcher Box aiming toward upper-left/right sky */}
            <polygon points="14,24 32,33 32,43 14,34" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="32,33 50,21 50,31 32,43" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="32,12 50,21 32,33 14,24" fill="#334155" stroke={pColor} strokeWidth="1.4" />
          </>
        )}

        {itemKind === "OBELISK" && (
          <>
            {/* 3/4 Ritual Obsidian Stepped Pedestal */}
            <polygon points="32,36 54,45 32,57 10,45" fill="#180608" stroke="#dc2626" strokeWidth="1.4" />
            {/* Towering 3/4 Pyramidal Monolith: NW sunlit obsidian face + SE deep crimson face */}
            <polygon points="32,8 32,52 15,43" fill="#27272a" stroke="#ef4444" strokeWidth="1.4" />
            <polygon points="32,8 49,43 32,52" fill="#450a0a" stroke="#dc2626" strokeWidth="1.4" />
          </>
        )}

        {itemKind === "RIFLE_INFANTRY" && (
          <>
            {/* 3/4 Tactical Portrait — Assault Rifleman (Armored Pauldrons, Visor Helmet, Pulse Rifle) */}
            {/* Torso & Beveled Shoulder Pauldrons */}
            <polygon
              points="10,56 13,37 23,31 41,31 51,37 54,56"
              fill={`url(#${shadeGradId})`}
              stroke={pColor}
              strokeWidth="1.5"
            />
            {/* Sunlit NW Right-Screen / Left-Body Pauldron & Chest Rig */}
            <polygon points="11,54 14,37 28,33 28,54" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="38,33 51,37 53,50 38,48" fill={sColor} stroke={pColor} strokeWidth="1.2" />
            {/* Armored Gorget Collar */}
            <polygon points="22,31 32,36 42,31 39,26 25,26" fill="#1e293b" stroke={pColor} strokeWidth="1.2" />
            {/* 3/4 Combat Helmet */}
            <path
              d="M20,22 C20,12 44,12 44,22 L43,29 L32,33 L21,29 Z"
              fill={`url(#${hullGradId})`}
              stroke="#0f172a"
              strokeWidth="1.4"
            />
            {/* Glowing Optical Tactical Visor */}
            <polygon points="23,21 38,20 41,25 25,26" fill="#0284c7" stroke="#e0f2fe" strokeWidth="1.1" />
            <polygon points="24,22 33,21.5 31,24.5 25,25" fill="#7dd3fc" />
          </>
        )}

        {itemKind === "ROCKET_SOLDIER" && (
          <>
            {/* 3/4 Tactical Portrait — Heavy Anti-Tank Specialist (Blast Pauldrons, Target-Lock Helmet, Shoulder AT Launcher) */}
            <polygon
              points="9,56 12,38 23,32 42,32 52,38 55,56"
              fill={`url(#${shadeGradId})`}
              stroke={pColor}
              strokeWidth="1.5"
            />
            <polygon points="10,54 13,38 29,34 29,54" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            {/* Heavy Blast-Shielded Left Shoulder Pauldron supporting the Launcher */}
            <polygon points="36,31 53,35 55,52 36,49" fill="#334155" stroke={pColor} strokeWidth="1.4" />
            {/* Full-Face Blast Helmet with Target-Acquisition HUD Monocle */}
            <path
              d="M19,23 C19,13 43,13 43,23 L42,31 L31,35 L20,31 Z"
              fill={sColor}
              stroke={pColor}
              strokeWidth="1.4"
            />
            <polygon points="21,22 33,22 33,27 22,27" fill="#091526" stroke="#38bdf8" strokeWidth="1" />
            <circle cx="36.5" cy="24.5" r="3.4" fill="#ef4444" stroke="#fecaca" strokeWidth="1.1" />
          </>
        )}

        {itemKind === "ENGINEER" && (
          <>
            {/* 3/4 Tactical Portrait — Combat Engineer (Hazard Rig, Technical Hard-Shell Helm, Satchel & Plasma Torch) */}
            <polygon
              points="10,56 13,38 23,32 41,32 51,38 54,56"
              fill="#1e293b"
              stroke="#eab308"
              strokeWidth="1.5"
            />
            <polygon points="11,54 14,38 28,34 28,54" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            {/* High-Visibility Yellow Technical Hard-Hat / Combat Helm */}
            <path
              d="M19,22 C19,11 45,11 45,22 L47,25 L17,25 Z"
              fill="#eab308"
              stroke="#0f172a"
              strokeWidth="1.4"
            />
            <rect x="28" y="12" width="8" height="10" rx="1.5" fill="#fef08a" stroke="#78350f" strokeWidth="1" />
            {/* Multi-Optic Diagnostic Visor Goggles */}
            <rect x="21" y="24" width="22" height="6.5" rx="2" fill="#091526" stroke="#38bdf8" strokeWidth="1.2" />
            <circle cx="27" cy="27.2" r="2.2" fill="#38bdf8" />
            <circle cx="37" cy="27.2" r="2.2" fill="#22c55e" />
          </>
        )}

        {itemKind === "CONSTRUCTOR_BOT" && (
          <>
            {/* 3/4 Isometric Tracked Robotic Constructor Chassis */}
            <polygon points="9,39 26,48 26,55 9,46" fill="#18181b" stroke="#475569" strokeWidth="1.2" />
            <polygon points="26,48 53,35 53,42 26,55" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Sunlit NW Front-Left Robotic Body + Shaded SE Flank */}
            <polygon points="12,26 30,35 30,48 12,39" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="30,35 50,25 50,38 30,48" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="32,17 50,25 30,35 12,26" fill="#eab308" stroke="#0f172a" strokeWidth="1.3" />
            {/* Rotary Servo Dome */}
            <ellipse cx="31" cy="25" rx="9" ry="5.5" fill={pColor} stroke="#0f172a" strokeWidth="1.3" />
          </>
        )}

        {itemKind === "HARVESTER" && (
          <>
            {/* 3/4 Super-Heavy Ore Harvester: Massive Articulated Tracks, Front Crusher Drum, Forward Cab & Rear Dump-Bed */}
            <polygon points="8,41 28,53 28,58 8,46" fill="#18181b" stroke="#475569" strokeWidth="1.2" />
            <polygon points="28,53 56,38 56,44 28,58" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Rear 3/4 Dump-Bed (Benne) & Twin Side Cisterns */}
            <polygon points="24,14 55,27 55,40 24,27" fill={`url(#${shadeGradId})`} stroke={pColor} strokeWidth="1.3" />
            <polygon points="24,14 55,27 41,35 14,22" fill="#064e3b" stroke={pColor} strokeWidth="1.4" />
            {/* Forward Sloped Armored Cab (NW Sunlit) */}
            <polygon points="9,28 28,39 28,51 9,40" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="20,21 39,31 28,39 9,28" fill={pColor} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="12,28 25,35 28,32 16,25" fill="#38bdf8" stroke="#091526" strokeWidth="1" />
          </>
        )}

        {itemKind === "RECON_BUGGY" && (
          <>
            {/* 3/4 High-Speed 4x4 Attack Buggy with Oversized Off-Road Tires */}
            <polygon points="12,29 31,39 53,27 34,18" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="10,31 31,42 31,49 10,38" fill={pColor} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="31,42 54,29 54,36 31,49" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            {/* 3 Visible 3/4 Lugged Off-Road Wheels */}
            <ellipse cx="15" cy="41" rx="5.5" ry="6.5" fill="#18181b" stroke="#64748b" strokeWidth="1.5" />
            <ellipse cx="31" cy="49" rx="6" ry="7" fill="#18181b" stroke="#64748b" strokeWidth="1.5" />
            <ellipse cx="49" cy="39" rx="5.5" ry="6.5" fill="#18181b" stroke="#475569" strokeWidth="1.5" />
          </>
        )}

        {itemKind === "MEDIUM_TANK" && (
          <>
            {/* 3/4 Main Battle Tank: Armored Track Skirts, Sloped Glacis & Beveled Turret */}
            <polygon points="7,38 28,51 28,57 7,44" fill="#18181b" stroke="#475569" strokeWidth="1.2" />
            <polygon points="28,51 56,36 56,43 28,57" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Sunlit NW Front Glacis + Shaded SE Side Skirt */}
            <polygon points="8,32 28,44 28,52 8,40" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="28,44 55,29 55,37 28,52" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="28,20 55,29 28,44 8,32" fill={sColor} stroke={pColor} strokeWidth="1.3" />
            {/* 3/4 Beveled Tank Turret */}
            <polygon points="33,15 48,22 33,31 19,23" fill={pColor} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="19,23 33,31 33,37 19,29" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.2" />
            <polygon points="33,31 48,22 48,28 33,37" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "ARTILLERY" && (
          <>
            {/* 3/4 Self-Propelled Siege Howitzer / Missile Carrier */}
            <polygon points="8,40 29,52 29,58 8,46" fill="#18181b" stroke="#475569" strokeWidth="1.2" />
            <polygon points="29,52 56,38 56,44 29,58" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Hull Deck */}
            <polygon points="9,33 29,45 29,52 9,40" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="29,45 55,31 55,38 29,52" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="29,23 55,31 29,45 9,33" fill={sColor} stroke={pColor} strokeWidth="1.2" />
            {/* Elevated Siege Breech Housing */}
            <polygon points="26,18 48,26 36,35 18,26" fill={pColor} stroke="#0f172a" strokeWidth="1.4" />
          </>
        )}

        {itemKind === "MAMMOTH_TANK" && (
          <>
            {/* 3/4 Super-Heavy Quad-Track Mammoth Tank */}
            {/* Front & Rear independent quad-track pods */}
            <polygon points="6,39 19,47 19,54 6,46" fill="#18181b" stroke="#64748b" strokeWidth="1.2" />
            <polygon points="21,48 34,56 34,60 21,54" fill="#18181b" stroke="#64748b" strokeWidth="1.2" />
            <polygon points="34,56 57,42 57,48 34,60" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Massive Reactive Glacis Hull */}
            <polygon points="7,30 31,44 31,53 7,39" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="31,44 56,29 56,39 31,53" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="30,18 56,29 31,44 7,30" fill={sColor} stroke={pColor} strokeWidth="1.4" />
            {/* Twin-Cannon Heavy Turret & Tusk Missile Pods */}
            <polygon points="33,12 51,20 34,31 17,22" fill={pColor} stroke="#0f172a" strokeWidth="1.5" />
            <polygon points="17,22 34,31 34,38 17,29" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="34,31 51,20 51,28 34,38" fill="#1e293b" stroke="#0f172a" strokeWidth="1.3" />
          </>
        )}

        {itemKind === "MCV" && (
          <>
            {/* 3/4 Giant Mobile Construction Vehicle */}
            <polygon points="7,40 29,53 29,58 7,45" fill="#18181b" stroke="#64748b" strokeWidth="1.2" />
            <polygon points="29,53 56,38 56,44 29,58" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Rear Mobile Factory Gantry Box */}
            <polygon points="24,13 54,26 54,40 24,27" fill="#334155" stroke={pColor} strokeWidth="1.3" />
            <polygon points="24,13 54,26 39,35 13,22" fill="#475569" stroke={pColor} strokeWidth="1.3" />
            {/* Front Armored Command Cab (Sunlit NW) */}
            <polygon points="8,26 28,38 28,51 8,39" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="19,19 39,30 28,38 8,26" fill={pColor} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="11,26 25,34 28,31 15,23" fill="#38bdf8" stroke="#091526" strokeWidth="1.1" />
          </>
        )}

        {itemKind === "FORESTRY_TRUCK" && (
          <>
            {/* 3/4 Heavy Forestry Truck with Rear Sapling Nursery Rack & Forward Cab */}
            <polygon points="8,40 28,52 28,57 8,45" fill="#18181b" stroke="#64748b" strokeWidth="1.2" />
            <polygon points="28,52 55,37 55,43 28,57" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Rear Open Nursery Bed (Emerald Soil & Sapling Crate) */}
            <polygon points="24,16 54,28 54,40 24,28" fill="#14532d" stroke="#22c55e" strokeWidth="1.3" />
            <polygon points="24,16 54,28 40,36 14,23" fill="#064e3b" stroke="#4ade80" strokeWidth="1.3" />
            {/* Forward Forestry Cab (Sunlit NW) */}
            <polygon points="9,28 28,39 28,50 9,39" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.4" />
            <polygon points="19,21 38,31 28,39 9,28" fill={pColor} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="12,28 24,35 27,32 15,25" fill="#38bdf8" stroke="#091526" strokeWidth="1" />
          </>
        )}

        {itemKind === "BLOWER_TRUCK" && (
          <>
            {/* 3/4 Mobile Thermal Blower Truck with Twin Turbo-Fan Turbines */}
            <polygon points="8,40 28,52 28,57 8,45" fill="#18181b" stroke="#64748b" strokeWidth="1.2" />
            <polygon points="28,52 55,37 55,43 28,57" fill="#09090b" stroke="#334155" strokeWidth="1.2" />
            {/* Main Amphibious Engineering Hull */}
            <polygon points="9,30 29,42 29,51 9,39" fill={`url(#${hullGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="29,42 54,28 54,38 29,51" fill={`url(#${shadeGradId})`} stroke="#0f172a" strokeWidth="1.3" />
            <polygon points="29,18 54,28 29,42 9,30" fill="#1e293b" stroke={pColor} strokeWidth="1.3" />
          </>
        )}
      </g>

      {/* LAYER 3: MECHANICAL SUB-ASSEMBLIES (3/4 Barrels, Weapons, Crystals, Cranes, Rotors) */}
      <g data-layer="sub-assemblies">
        {itemKind === "CONSTRUCTION_YARD" && (
          <>
            {/* 3/4 Articulated Gantry Crane Boom & Welding Arc */}
            <polyline points="34,42 44,14 54,20" fill="none" stroke="#eab308" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="54" y1="20" x2="54" y2="30" stroke="#cbd5e1" strokeWidth="1.3" />
            <circle cx="54" cy="31" r="2.8" fill="#38bdf8" />
            <circle cx="22" cy="13" r="2.2" fill="#38bdf8" />
          </>
        )}

        {itemKind === "POWER_PLANT" && (
          <>
            {/* Glowing Plasma Turbine Cores & High-Voltage Busbars */}
            <ellipse cx="24" cy="19" rx="4.5" ry="2.3" fill="#7dd3fc" />
            <ellipse cx="43" cy="16" rx="4.5" ry="2.3" fill="#38bdf8" />
            <polyline points="24,30 34,25 43,27" fill="none" stroke="#f59e0b" strokeWidth="2.2" />
          </>
        )}

        {itemKind === "REFINERY" && (
          <>
            {/* Overhead Distillation Pipes & Emerald Ore Mound in Unloading Hopper */}
            <polyline points="15.5,22 36,28 44,36" fill="none" stroke="#cbd5e1" strokeWidth="2.4" />
            <polygon points="34,42 40,35 46,43 39,47" fill="#10b981" stroke="#a7f3d0" strokeWidth="1" />
            <circle cx="15.5" cy="11" r="2.5" fill="#fef08a" />
          </>
        )}

        {itemKind === "SILO" && (
          <>
            {/* Vertical Sight-Glass Level Gauge on 3/4 Cylinder Wall */}
            <rect x="29" y="27" width="6" height="20" rx="1.5" fill="#091526" stroke="#94a3b8" strokeWidth="1" />
            <rect x="30.5" y="30" width="3" height="15" rx="0.8" fill="#22c55e" />
            <line x1="17" y1="22" x2="47" y2="22" stroke="#cbd5e1" strokeWidth="1.6" />
          </>
        )}

        {itemKind === "BARRACKS" && (
          <>
            {/* Roof Tactical Crest & Spotlight */}
            <polygon points="32,19 42,25 32,31 22,25" fill={pColor} stroke="#fef08a" strokeWidth="1.1" />
            <circle cx="42" cy="36" r="2.5" fill="#fef08a" />
          </>
        )}

        {itemKind === "WAR_FACTORY" && (
          <>
            {/* Twin Smokestacks & Roll-out Chevron Stripes */}
            <rect x="13" y="10" width="4" height="12" fill="#18181b" stroke="#94a3b8" strokeWidth="1" />
            <rect x="20" y="8" width="4" height="12" fill="#18181b" stroke="#94a3b8" strokeWidth="1" />
            <circle cx="15" cy="9" r="2" fill="#f97316" />
            <line x1="36" y1="48" x2="52" y2="40" stroke="#eab308" strokeWidth="2.4" strokeDasharray="3 2" />
          </>
        )}

        {itemKind === "RADAR_DOME" && (
          <>
            {/* Tripod Feed Horn & Telemetry Receiver */}
            <line x1="23" y1="22" x2="30" y2="12" stroke="#e2e8f0" strokeWidth="1.4" />
            <line x1="43" y1="18" x2="30" y2="12" stroke="#e2e8f0" strokeWidth="1.4" />
            <line x1="33" y1="28" x2="30" y2="12" stroke="#e2e8f0" strokeWidth="1.4" />
            <circle cx="30" cy="12" r="2.8" fill="#38bdf8" stroke="#ffffff" strokeWidth="1" />
          </>
        )}

        {itemKind === "TECH_CENTER" && (
          <>
            {/* Orbital Quantum Ring & Laser Telemetry Spire */}
            <ellipse
              cx="32"
              cy="23"
              rx="14"
              ry="5.5"
              transform="rotate(-22 32 23)"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.6"
            />
            <circle cx="32" cy="21" r="4.5" fill="#f0abfc" />
            <line x1="32" y1="7" x2="32" y2="17" stroke="#e0f2fe" strokeWidth="1.8" />
            <circle cx="32" cy="7" r="2.2" fill="#38bdf8" />
          </>
        )}

        {itemKind === "SILVER_MINE" && (
          <>
            {/* Minecart Rails & Gleaming Silver Nuggets */}
            <line x1="31" y1="40" x2="21" y2="55" stroke="#cbd5e1" strokeWidth="1.6" />
            <line x1="37" y1="42" x2="29" y2="57" stroke="#cbd5e1" strokeWidth="1.6" />
            <circle cx="17" cy="36" r="3" fill="#f8fafc" stroke="#64748b" strokeWidth="0.9" />
            <circle cx="48" cy="34" r="3.2" fill="#f8fafc" stroke="#64748b" strokeWidth="0.9" />
            <circle cx="34" cy="24" r="2.4" fill="#38bdf8" />
          </>
        )}

        {itemKind === "CONCRETE_SLAB" && (
          <>
            {/* Isometric Expansion Seams & 4 Corner Anchor Bolts */}
            <line x1="20" y1="22" x2="44" y2="36" stroke="#1e293b" strokeWidth="1.4" />
            <line x1="44" y1="22" x2="20" y2="36" stroke="#1e293b" strokeWidth="1.4" />
            <circle cx="32" cy="20" r="1.6" fill="#cbd5e1" />
            <circle cx="46" cy="29" r="1.6" fill="#cbd5e1" />
            <circle cx="32" cy="38" r="1.6" fill="#cbd5e1" />
            <circle cx="18" cy="29" r="1.6" fill="#cbd5e1" />
          </>
        )}

        {itemKind === "SANDBAG_WALL" && (
          <>
            {/* Burlap Tie Seams */}
            <line x1="26" y1="27" x2="38" y2="27" stroke="#fef3c7" strokeWidth="1.2" opacity="0.75" />
            <line x1="19" y1="35" x2="31" y2="35" stroke="#fef3c7" strokeWidth="1.1" opacity="0.65" />
            <line x1="33" y1="33" x2="45" y2="33" stroke="#fef3c7" strokeWidth="1.1" opacity="0.65" />
          </>
        )}

        {itemKind === "CONCRETE_WALL" && (
          <>
            {/* Steel Buttress Ribs & Caution Stripe */}
            <polygon points="18,32 23,35 23,50 18,47" fill={sColor} />
            <polygon points="38,34 44,31 44,46 38,49" fill="#1e293b" />
            <circle cx="32" cy="26" r="3.5" fill={pColor} stroke="#0f172a" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "GUARD_TOWER" && (
          <>
            {/* Twin 3/4 Vulcan Rotary Barrels projecting forward-left */}
            <line x1="24" y1="23" x2="8" y2="14" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
            <line x1="29" y1="20" x2="13" y2="11" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="20" r="3.2" fill="#38bdf8" stroke="#ffffff" strokeWidth="0.9" />
          </>
        )}

        {itemKind === "SAM_SITE" && (
          <>
            {/* 4 Protruding Red/White SAM Missile Warheads in 3/4 Launch Tubes */}
            <line x1="23" y1="23" x2="12" y2="15" stroke="#f8fafc" strokeWidth="3.2" strokeLinecap="round" />
            <line x1="29" y1="20" x2="18" y2="12" stroke="#f8fafc" strokeWidth="3.2" strokeLinecap="round" />
            <line x1="35" y1="17" x2="24" y2="9" stroke="#f8fafc" strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="12" cy="15" r="2" fill="#ef4444" />
            <circle cx="18" cy="12" r="2" fill="#ef4444" />
            <circle cx="24" cy="9" r="2" fill="#ef4444" />
          </>
        )}

        {itemKind === "OBELISK" && (
          <>
            {/* Incandescent Ruby Crystal Focal Tip & Induction Coils */}
            <line x1="24" y1="27" x2="40" y2="27" stroke="#f59e0b" strokeWidth="1.8" />
            <line x1="20" y1="36" x2="44" y2="36" stroke="#f59e0b" strokeWidth="1.8" />
            <circle cx="32" cy="11" r="6.5" fill="#ef4444" opacity="0.45" />
            <polygon points="32,6 37,12 32,17 27,12" fill="#ef4444" stroke="#ffffff" strokeWidth="1.2" />
          </>
        )}

        {itemKind === "RIFLE_INFANTRY" && (
          <>
            {/* 3/4 Foreground Pulse Assault Rifle with Optic & Vented Barrel */}
            <polygon points="14,47 46,33 48,38 16,52" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.2" />
            <line x1="46" y1="35" x2="57" y2="30" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
            {/* Holographic sight & glowing ammo cell */}
            <rect x="29" y="35" width="7" height="4" rx="1" transform="rotate(-23 29 35)" fill="#38bdf8" />
            <rect x="33" y="42" width="5" height="9" rx="1" transform="rotate(-23 33 42)" fill={pColor} stroke="#0f172a" strokeWidth="1" />
          </>
        )}

        {itemKind === "ROCKET_SOLDIER" && (
          <>
            {/* Heavy Shoulder-Mounted Anti-Tank Missile Tube & Protruding Red Warhead */}
            <polygon points="26,38 56,16 59,22 30,44" fill="#475569" stroke="#e2e8f0" strokeWidth="1.3" />
            <polygon points="54,17 60,13 58,21" fill="#ef4444" stroke="#fef08a" strokeWidth="1" />
            {/* Laser Target-Designator Grips */}
            <rect x="34" y="36" width="5" height="9" rx="1" fill="#0f172a" stroke={pColor} strokeWidth="1" />
          </>
        )}

        {itemKind === "ENGINEER" && (
          <>
            {/* Foreground Plasma Cutting Torch, Power Conduit & Welding Spark */}
            <path d="M16,52 C22,46 28,44 36,40" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
            <polygon points="31,39 48,30 51,35 34,44" fill="#334155" stroke="#cbd5e1" strokeWidth="1.2" />
            <circle cx="52" cy="31" r="4.5" fill="#38bdf8" />
            <circle cx="52" cy="31" r="2.2" fill="#ffffff" />
          </>
        )}

        {itemKind === "CONSTRUCTOR_BOT" && (
          <>
            {/* Dual Articulated 3/4 Welding Arms & Plasma Arc */}
            <polyline points="17,32 8,24 14,16" fill="none" stroke="#eab308" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="34,39 26,30 22,19" fill="none" stroke="#eab308" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="14" cy="16" r="3" fill="#38bdf8" />
            <circle cx="22" cy="19" r="3" fill="#38bdf8" />
            <line x1="14" y1="16" x2="22" y2="19" stroke="#e0f2fe" strokeWidth="1.5" strokeDasharray="2 1" />
          </>
        )}

        {itemKind === "HARVESTER" && (
          <>
            {/* Front Rotary Crusher Drum Teeth & Luminescent Emerald Crystals in Rear Dump-Bed */}
            <polygon points="6,39 23,49 27,45 10,35" fill="#475569" stroke="#cbd5e1" strokeWidth="1.2" />
            <circle cx="14" cy="43" r="2.6" fill="#10b981" />
            <circle cx="20" cy="46" r="2.6" fill="#34d399" />
            {/* Crystalline Ore Mound in 3/4 Rear Dump-Bed */}
            <polygon points="26,22 36,15 47,23 39,30 28,27" fill="#10b981" stroke="#6ee7b7" strokeWidth="1.1" />
            <polygon points="32,20 39,17 43,23 35,26" fill="#a7f3d0" />
          </>
        )}

        {itemKind === "RECON_BUGGY" && (
          <>
            {/* Roof-Mounted Rotary Heavy MG & Roll Cage */}
            <polyline points="22,28 28,18 39,23 33,34" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
            <line x1="30" y1="21" x2="11" y2="12" stroke="#e2e8f0" strokeWidth="2.8" strokeLinecap="round" />
            <polygon points="26,18 33,17 31,24 24,23" fill={pColor} stroke="#0f172a" strokeWidth="1" />
          </>
        )}

        {itemKind === "MEDIUM_TANK" && (
          <>
            {/* 3/4 105mm Main Cannon with Thermal Sleeve & Muzzle Brake projecting forward-left */}
            <line x1="25" y1="24" x2="7" y2="14" stroke="#e2e8f0" strokeWidth="3.8" strokeLinecap="round" />
            <polygon points="6,12 11,14 9,18 4,15" fill="#475569" stroke="#cbd5e1" strokeWidth="0.9" />
            <ellipse cx="35" cy="20" rx="4" ry="2.2" fill={sColor} stroke="#cbd5e1" strokeWidth="1" />
          </>
        )}

        {itemKind === "ARTILLERY" && (
          <>
            {/* Long-Range Elevated Siege Cannon Barrel & Hydraulic Elevators */}
            <line x1="32" y1="25" x2="8" y2="9" stroke="#f8fafc" strokeWidth="4.6" strokeLinecap="round" />
            <line x1="22" y1="30" x2="18" y2="18" stroke="#eab308" strokeWidth="2" />
            <circle cx="36" cy="23" r="2.6" fill="#38bdf8" />
          </>
        )}

        {itemKind === "MAMMOTH_TANK" && (
          <>
            {/* Twin 120mm Heavy Cannons + Lateral Tusk Missile Pods */}
            <line x1="23" y1="24" x2="6" y2="14" stroke="#f8fafc" strokeWidth="3.4" strokeLinecap="round" />
            <line x1="29" y1="21" x2="12" y2="11" stroke="#cbd5e1" strokeWidth="3.4" strokeLinecap="round" />
            {/* Lateral Tusk Missile Pod with Crimson Warheads */}
            <polygon points="39,16 53,23 53,30 39,23" fill="#334155" stroke="#cbd5e1" strokeWidth="1.1" />
            <circle cx="42" cy="21" r="1.6" fill="#ef4444" />
            <circle cx="47" cy="23.5" r="1.6" fill="#ef4444" />
          </>
        )}

        {itemKind === "MCV" && (
          <>
            {/* Folded Heavy Gantry Crane & Roof Command Beacon */}
            <line x1="25" y1="24" x2="47" y2="16" stroke="#eab308" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="24" cy="22" r="3" fill="#facc15" stroke="#ffffff" strokeWidth="1" />
            <line x1="32" y1="45" x2="50" y2="35" stroke="#eab308" strokeWidth="2.2" strokeDasharray="3 2" />
          </>
        )}

        {itemKind === "FORESTRY_TRUCK" && (
          <>
            {/* 3 Emerald Sapling Canopies in Nursery Rack & Hydraulic Planting Boom */}
            <polygon points="34,11 40,22 28,22" fill="#22c55e" stroke="#052e16" strokeWidth="1" />
            <polygon points="44,16 50,26 38,26" fill="#4ade80" stroke="#052e16" strokeWidth="1" />
            <line x1="45" y1="28" x2="55" y2="21" stroke="#eab308" strokeWidth="2.8" strokeLinecap="round" />
          </>
        )}

        {itemKind === "BLOWER_TRUCK" && (
          <>
            {/* Twin Turbo-Fan Thermal Blowers & Orange Heat Waves */}
            <circle cx="29" cy="25" r="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
            <circle cx="41" cy="22" r="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
            <circle cx="29" cy="25" r="2.2" fill="#f97316" />
            <circle cx="41" cy="22" r="2.2" fill="#f97316" />
            <path d="M8,36 Q14,32 20,38" fill="none" stroke="#fb923c" strokeWidth="2" />
            <path d="M5,41 Q12,37 18,43" fill="none" stroke="#facc15" strokeWidth="1.8" />
          </>
        )}
      </g>

      {/* LAYER 4: SPECULAR HIGHLIGHTS & NORTH-WEST RIM LIGHTING */}
      <g data-layer="specular-highlights">
        <polyline
          points="7,28 7,7 28,7"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.1"
          opacity="0.38"
        />
        {isCustomVariant && (
          <>
            <polygon
              points="46,6 58,6 58,15 46,15"
              fill="#090d16"
              stroke={pColor}
              strokeWidth="1"
            />
            <circle
              cx="52"
              cy="10.5"
              r="2.2"
              fill={
                activeVariant.dna.energyCoreHue === "CYAN_PLASMA"
                  ? "#38bdf8"
                  : activeVariant.dna.energyCoreHue === "EMERALD_TIBERIUM"
                    ? "#10b981"
                    : activeVariant.dna.energyCoreHue === "CRIMSON_LASER"
                      ? "#ef4444"
                      : activeVariant.dna.energyCoreHue === "VIOLET_QUANTUM"
                        ? "#a855f7"
                        : "#facc15"
              }
            />
            <polyline
              points="6,50 14,58 58,58"
              fill="none"
              stroke={pColor}
              strokeWidth="1.5"
              strokeDasharray={
                activeVariant.dna.hazardStripeMode === "DOUBLE_CHEVRON"
                  ? "3 2"
                  : undefined
              }
            />
          </>
        )}
      </g>
    </svg>
  );
});
