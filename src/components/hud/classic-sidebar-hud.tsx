"use client";

import React, { useState } from "react";
import {
  Building2,
  Coins,
  Cpu,
  DollarSign,
  ShieldAlert,
  Truck,
  Users,
  Volume2,
  VolumeX,
  Zap,
  ZoomIn,
} from "lucide-react";
import {
  BUILDING_LIST,
  FACTIONS,
  UNIT_LIST,
  ZOOM_LEVELS,
  type BuildingKind,
  type ProductionCategory,
  type UnitKind,
} from "../../shared/constants";
import { globalAudioMixer } from "../../audio/mixer";
import { useRtsGameStore } from "../../store/game-store";
import { Badge, Button, DiscretizedProgressBar } from "../ui/primitives";

interface ClassicSidebarHudProps {
  minimapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onMinimapClickTile: (tileX: number, tileY: number) => void;
  onLeaveMatch: () => void;
  zoomLevel: number;
  onCycleZoom: () => void;
  onSelectZoom: (zoom: number) => void;
}

export function ClassicSidebarHud({
  minimapCanvasRef,
  onMinimapClickTile,
  onLeaveMatch,
  zoomLevel,
  onCycleZoom,
  onSelectZoom,
}: ClassicSidebarHudProps) {
  const {
    playerId,
    faction,
    currEntities,
    playersEconomy,
    placementBuilding,
    sellMode,
    audioMuted,
    setPlacementBuilding,
    setSellMode,
    setAudioMuted,
    triggerProduction,
  } = useRtsGameStore();

  const [activeTab, setActiveTab] = useState<ProductionCategory>("BUILDING");

  const myEcon = playersEconomy.get(playerId);
  const credits = myEcon?.credits ?? 2500;
  const maxStorage = myEcon?.maxStorage ?? 2000;
  const powerProduced = myEcon?.powerProduced ?? 100;
  const powerConsumed = myEcon?.powerConsumed ?? 40;
  const lowPower = myEcon?.lowPower ?? false;

  const ownedBuildingKinds = new Set<BuildingKind>();
  for (const ent of currEntities.values()) {
    if (ent.ownerId === playerId && ent.entityType === "BUILDING") {
      ownedBuildingKinds.add(ent.kind as BuildingKind);
    }
  }

  const activeSlot = myEcon?.queues.find((q) => q.category === activeTab) ?? {
    category: activeTab,
    activeItem: null,
    progressRatio: 0,
    readyToPlace: false,
  };

  function handleMinimapPointer(e: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onMinimapClickTile(Math.floor(relX * 48), Math.floor(relY * 48));
  }

  function handleToggleMute(): void {
    const next = !audioMuted;
    setAudioMuted(next);
    globalAudioMixer.setMuted(next);
  }

  const powerLoadRatio =
    powerProduced <= 0 ? 1 : Math.min(1, powerConsumed / Math.max(1, powerProduced));

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-tactical text-slate-100 select-none font-mono">
      {/* Top Faction & Credits Display */}
      <div className="border-b border-slate-800 bg-slate-950/90 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Badge className={FACTIONS[myEcon?.faction ?? faction].badgeClass}>
            {myEcon?.faction ?? faction} COMMAND
          </Badge>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleToggleMute}>
              {audioMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="danger" size="sm" onClick={onLeaveMatch}>
              Quitter
            </Button>
          </div>
        </div>

        {/* Credits Counter */}
        <div className="flex items-center justify-between rounded border border-amber-500/40 bg-slate-900 px-3 py-1.5">
          <div className="flex items-center gap-1.5 text-xs text-amber-300">
            <Coins className="h-4 w-4 text-amber-400" />
            <span>CRÉDITS</span>
          </div>
          <div className="text-sm font-bold tracking-wider text-amber-400">
            {credits.toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-slate-400">
              / {maxStorage.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Second Canvas Element: Tactical Radar Minimap */}
      <div className="border-b border-slate-800 bg-slate-950 p-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase text-slate-400">
          <span>Radar Tactique</span>
          <span className={lowPower ? "text-red-400 font-bold" : "text-emerald-400"}>
            {lowPower ? "SURCHARGE ÉNERGIE" : "BALAYAGE ACTIF"}
          </span>
        </div>
        <div className="flex items-center justify-center rounded border border-slate-800 bg-obsidian p-1">
          <canvas
            ref={minimapCanvasRef}
            width={240}
            height={180}
            onClick={handleMinimapPointer}
            className="h-44 w-full cursor-crosshair rounded"
          />
        </div>
      </div>

      {/* Discretized Power Balance Gauge (Zero inline styles) */}
      <div className="border-b border-slate-800 bg-slate-950/70 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 text-slate-300">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            BILAN ÉNERGÉTIQUE
          </span>
          <span className={lowPower ? "text-red-400 font-bold" : "text-emerald-300"}>
            {powerConsumed} MW / {powerProduced} MW
          </span>
        </div>
        <DiscretizedProgressBar
          ratio={powerLoadRatio}
          tone={lowPower ? "red" : powerLoadRatio > 0.8 ? "amber" : "emerald"}
        />
      </div>

      {/* Tactical Mode Actions (Zoom Selector & Sell Structure) */}
      <div className="border-b border-slate-800 px-3 py-2 space-y-2">
        <div className="flex items-center justify-between gap-1.5">
          <Button
            variant="tactical"
            size="sm"
            onClick={onCycleZoom}
            className="shrink-0"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            Zoom {zoomLevel}x
          </Button>
          <div className="grid flex-1 grid-cols-5 gap-1 rounded border border-slate-800 bg-slate-950 p-0.5">
            {ZOOM_LEVELS.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => onSelectZoom(z)}
                className={
                  Math.abs(zoomLevel - z) < 0.01
                    ? "rounded border border-amber-400/60 bg-amber-500/25 py-1 text-[10px] font-bold text-amber-300"
                    : "rounded py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }
              >
                {z}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant={sellMode ? "danger" : "ghost"}
          size="sm"
          className="w-full"
          onClick={() => {
            globalAudioMixer.playUiClick();
            setSellMode(!sellMode);
          }}
        >
          <DollarSign className="h-3.5 w-3.5" />
          {sellMode ? "Mode Vente : ACTIF (50%)" : "Vendre Structure (50%)"}
        </Button>
      </div>

      {/* 4 Parallel Production Category Tabs */}
      <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950">
        {(
          [
            { id: "BUILDING", label: "Base", icon: Building2 },
            { id: "DEFENSE", label: "Déf.", icon: ShieldAlert },
            { id: "INFANTRY", label: "Inf.", icon: Users },
            { id: "VEHICLE", label: "Blindés", icon: Truck },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isCurrent = activeTab === tab.id;
          const qSlot = myEcon?.queues.find((q) => q.category === tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                globalAudioMixer.playUiClick();
                setActiveTab(tab.id);
              }}
              className={
                isCurrent
                  ? "flex flex-col items-center justify-center border-b-2 border-amber-400 bg-slate-900 py-2 text-[11px] font-bold text-amber-300"
                  : "flex flex-col items-center justify-center py-2 text-[11px] text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              }
            >
              <Icon className="h-4 w-4 mb-0.5" />
              <span>{tab.label}</span>
              {qSlot?.readyToPlace && (
                <span className="mt-0.5 rounded bg-emerald-500/30 px-1 text-[9px] text-emerald-300">
                  PRÊT
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Queue Status for Selected Category */}
      {activeSlot.activeItem && (
        <div className="border-b border-slate-800 bg-slate-900/90 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-300">{activeSlot.activeItem}</span>
            <span className="text-emerald-300">
              {Math.round(activeSlot.progressRatio * 100)}%
            </span>
          </div>
          <DiscretizedProgressBar
            ratio={activeSlot.progressRatio}
            tone={activeSlot.readyToPlace ? "emerald" : "amber"}
          />
          {activeSlot.readyToPlace &&
            (activeTab === "BUILDING" || activeTab === "DEFENSE") && (
              <Button
                variant="tactical"
                size="sm"
                className="w-full"
                onClick={() => {
                  globalAudioMixer.playUiClick();
                  setPlacementBuilding({
                    category: activeTab,
                    kind: activeSlot.activeItem as BuildingKind,
                  });
                }}
              >
                {placementBuilding?.kind === activeSlot.activeItem
                  ? "Cliquez sur la Carte pour Poser"
                  : "Déployer sur la Grille"}
              </Button>
            )}
        </div>
      )}

      {/* Production Icons Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {(activeTab === "BUILDING" || activeTab === "DEFENSE"
          ? BUILDING_LIST.filter((b) => b.category === activeTab)
          : UNIT_LIST.filter((u) => u.category === activeTab)
        ).map((item) => {
          const unlocked = item.prerequisites.every((req) => ownedBuildingKinds.has(req));
          const isBuildingThis = activeSlot.activeItem === item.kind;
          const canAfford = credits >= item.cost;

          return (
            <div
              key={item.kind}
              className={
                unlocked
                  ? "rounded border border-slate-800 bg-slate-900/80 p-2.5 space-y-1.5"
                  : "rounded border border-slate-900 bg-slate-950/60 p-2.5 opacity-50 space-y-1.5"
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-100">{item.name}</span>
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                  {item.cost} cr
                </Badge>
              </div>
              <p className="text-[11px] leading-snug text-slate-400">{item.description}</p>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">
                  {unlocked
                    ? "Prérequis validés"
                    : `Requis : ${item.prerequisites.join(", ")}`}
                </span>
                <Button
                  size="sm"
                  variant={isBuildingThis ? "tactical" : "default"}
                  disabled={!unlocked || activeSlot.activeItem !== null || !canAfford}
                  onClick={() => {
                    globalAudioMixer.playUiClick();
                    triggerProduction(
                      activeTab,
                      item.kind as BuildingKind | UnitKind
                    );
                  }}
                >
                  <Cpu className="h-3 w-3" />
                  {isBuildingThis ? "En cours" : "Produire"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
