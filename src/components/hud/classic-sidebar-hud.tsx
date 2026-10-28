"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Coins,
  Cpu,
  Crosshair,
  DollarSign,
  PanelRightClose,
  Radar,
  ShieldAlert,
  Truck,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
  ZoomIn,
} from "lucide-react";
import {
  BUILDING_LIST,
  FACTIONS,
  isRepeatableBuildingKind,
  UNIT_LIST,
  ZOOM_LEVELS,
  type BuildingKind,
  type ProductionCategory,
  type UnitKind,
} from "../../shared/constants";
import { globalAudioMixer } from "../../audio/mixer";
import { useRtsGameStore } from "../../store/game-store";
import { Badge, Button, DiscretizedProgressBar } from "../ui/primitives";
import { FactionVectorEmblem, ProductionItemVectorIcon } from "./leonardo-icons";

interface ClassicSidebarHudProps {
  minimapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onMinimapClickTile: (tileX: number, tileY: number) => void;
  onLeaveMatch: () => void;
  zoomLevel: number;
  onCycleZoom: () => void;
  onSelectZoom: (zoom: number) => void;
  onCloseMobile?: () => void;
}

export const ClassicSidebarHud = React.memo(function ClassicSidebarHud({
  minimapCanvasRef,
  onMinimapClickTile,
  onLeaveMatch,
  zoomLevel,
  onCycleZoom,
  onSelectZoom,
  onCloseMobile,
}: ClassicSidebarHudProps) {
  const playerId = useRtsGameStore((s) => s.playerId);
  const faction = useRtsGameStore((s) => s.faction);
  const hudRevision = useRtsGameStore((s) => s.hudRevision);
  const ownedBuildingsKey = useRtsGameStore((s) => s.ownedBuildingsKey);
  const placementBuilding = useRtsGameStore((s) => s.placementBuilding);
  const sellMode = useRtsGameStore((s) => s.sellMode);
  const repairMode = useRtsGameStore((s) => s.repairMode);
  const forceAttackMode = useRtsGameStore((s) => s.forceAttackMode);
  const audioMuted = useRtsGameStore((s) => s.audioMuted);
  const setPlacementBuilding = useRtsGameStore((s) => s.setPlacementBuilding);
  const setSellMode = useRtsGameStore((s) => s.setSellMode);
  const setRepairMode = useRtsGameStore((s) => s.setRepairMode);
  const setForceAttackMode = useRtsGameStore((s) => s.setForceAttackMode);
  const setAudioMuted = useRtsGameStore((s) => s.setAudioMuted);
  const triggerProduction = useRtsGameStore((s) => s.triggerProduction);

  const [activeTab, setActiveTab] = useState<ProductionCategory>("BUILDING");
  const [radarCollapsed, setRadarCollapsed] = useState(false);
  const minimapDraggingRef = useRef(false);

  // Read player economy snapshot gated by hudRevision (never re-renders on unit movement ticks)
  const myEcon = useMemo(() => {
    void hudRevision;
    return useRtsGameStore.getState().playersEconomy.get(playerId);
  }, [playerId, hudRevision]);

  const credits = myEcon?.credits ?? 2500;
  const maxStorage = myEcon?.maxStorage ?? 2000;
  const powerProduced = myEcon?.powerProduced ?? 100;
  const powerConsumed = myEcon?.powerConsumed ?? 40;
  const lowPower = myEcon?.lowPower ?? false;

  const ownedBuildingKinds = useMemo(() => {
    const set = new Set<BuildingKind>();
    if (!ownedBuildingsKey) return set;
    for (const part of ownedBuildingsKey.split(",")) {
      if (part) set.add(part as BuildingKind);
    }
    return set;
  }, [ownedBuildingsKey]);

  const activeSlot = myEcon?.queues.find((q) => q.category === activeTab) ?? {
    category: activeTab,
    activeItem: null,
    progressRatio: 0,
    readyToPlace: false,
  };

  function updateMinimapFromClientXY(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number
  ): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onMinimapClickTile(Math.floor(relX * 48), Math.floor(relY * 48));
  }

  function handleMinimapPointer(e: React.MouseEvent<HTMLCanvasElement>): void {
    updateMinimapFromClientXY(e.currentTarget, e.clientX, e.clientY);
  }

  function handleMinimapTouch(e: React.TouchEvent<HTMLCanvasElement>): void {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    updateMinimapFromClientXY(e.currentTarget, touch.clientX, touch.clientY);
  }

  function handleToggleMute(): void {
    const next = !audioMuted;
    setAudioMuted(next);
    globalAudioMixer.setMuted(next);
  }

  const powerLoadRatio =
    powerProduced <= 0 ? 1 : Math.min(1, powerConsumed / Math.max(1, powerProduced));

  return (
    <aside className="flex h-full w-64 sm:w-72 lg:w-80 shrink-0 flex-col overflow-y-auto overscroll-contain touch-pan-y border-l border-slate-800 bg-tactical text-slate-100 select-none font-mono">
      {/* Top Faction & Credits Display */}
      <div className="border-b border-slate-800 bg-slate-950/95 p-2.5 lg:p-3 space-y-2">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <FactionVectorEmblem
              faction={myEcon?.faction ?? faction}
              className="h-6 w-6 lg:h-7 lg:w-7 shrink-0"
            />
            <Badge className={`truncate ${FACTIONS[myEcon?.faction ?? faction].badgeClass}`}>
              {myEcon?.faction ?? faction} CMD
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={handleToggleMute} title="Audio">
              {audioMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </Button>
            {onCloseMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCloseMobile}
                className="lg:hidden"
                title="Replier le menu C&C"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={onLeaveMatch}>
              Quitter
            </Button>
          </div>
        </div>

        {/* Credits Counter */}
        <div className="flex items-center justify-between rounded border border-amber-500/40 bg-slate-900 px-2.5 py-1">
          <div className="flex items-center gap-1.5 text-xs text-amber-300">
            <Coins className="h-3.5 w-3.5 text-amber-400" />
            <span>CRÉDITS</span>
          </div>
          <div className="text-xs lg:text-sm font-bold tracking-wider text-amber-400">
            {credits.toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-slate-400">
              / {maxStorage.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Second Canvas Element: Tactical Radar Minimap (Collapsible on Mobile Landscape) */}
      <div className="border-b border-slate-800 bg-slate-950 p-2.5 lg:p-3">
        <div className="flex items-center justify-between text-[11px] uppercase text-slate-400">
          <button
            type="button"
            onClick={() => {
              globalAudioMixer.playUiClick();
              setRadarCollapsed(!radarCollapsed);
            }}
            className="flex items-center gap-1 font-bold text-slate-300 hover:text-amber-300"
          >
            <Radar className="h-3.5 w-3.5 text-amber-400" />
            <span>Radar [{radarCollapsed ? "Afficher" : "Masquer"}]</span>
            {radarCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          <span className={lowPower ? "text-red-400 font-bold text-[10px]" : "text-emerald-400 text-[10px]"}>
            {lowPower ? "SURCHARGE" : "ACTIF"}
          </span>
        </div>
        <div
          className={
            radarCollapsed
              ? "hidden"
              : "mt-1.5 flex items-center justify-center rounded border border-slate-800 bg-obsidian p-1"
          }
        >
          <canvas
            ref={minimapCanvasRef}
            width={240}
            height={180}
            onClick={handleMinimapPointer}
            onMouseDown={(e) => {
              minimapDraggingRef.current = true;
              updateMinimapFromClientXY(e.currentTarget, e.clientX, e.clientY);
            }}
            onMouseMove={(e) => {
              if (minimapDraggingRef.current || e.buttons === 1) {
                updateMinimapFromClientXY(e.currentTarget, e.clientX, e.clientY);
              }
            }}
            onMouseUp={() => {
              minimapDraggingRef.current = false;
            }}
            onMouseLeave={() => {
              minimapDraggingRef.current = false;
            }}
            onTouchStart={handleMinimapTouch}
            onTouchMove={handleMinimapTouch}
            className="h-32 sm:h-36 lg:h-44 w-full cursor-crosshair rounded touch-none"
          />
        </div>
      </div>

      {/* Discretized Power Balance Gauge (Zero inline styles) */}
      <div className="border-b border-slate-800 bg-slate-950/70 px-2.5 lg:px-3 py-2 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 text-slate-300">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            ÉNERGIE
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
      <div className="border-b border-slate-800 px-2.5 lg:px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <Button
            variant="tactical"
            size="sm"
            onClick={onCycleZoom}
            className="shrink-0"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            {zoomLevel}x
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
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={repairMode ? "tactical" : "ghost"}
            size="sm"
            className="w-full"
            onClick={() => {
              globalAudioMixer.playUiClick();
              setRepairMode(!repairMode);
            }}
          >
            <Wrench className="h-3.5 w-3.5" />
            {repairMode ? "Réparer : ACTIF" : "Réparer"}
          </Button>
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
            {sellMode ? "Vente : 50%" : "Vendre (50%)"}
          </Button>
        </div>
        <Button
          variant={forceAttackMode ? "danger" : "ghost"}
          size="sm"
          className="w-full"
          onClick={() => {
            globalAudioMixer.playUiClick();
            setForceAttackMode(!forceAttackMode);
          }}
        >
          <Crosshair className="h-3.5 w-3.5" />
          {forceAttackMode
            ? "Tir Forcé au Sol : ACTIF (Cliquez Carte)"
            : "Tir Forcé au Sol (Ctrl + Clic)"}
        </Button>
      </div>

      {/* 4 Parallel Production Category Tabs (Sticky so always reachable when scrolling) */}
      <div className="sticky top-0 z-10 grid grid-cols-4 border-b border-slate-800 bg-slate-950">
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
        <div className="border-b border-slate-800 bg-slate-900/90 px-2.5 lg:px-3 py-2 space-y-1.5">
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
                  ? "Touchez / Cliquez la Carte pour Poser"
                  : "Déployer sur la Grille"}
              </Button>
            )}
        </div>
      )}

      {/* Production Icons Grid */}
      <div className="flex-1 p-2.5 lg:p-3 space-y-2">
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
                  ? "rounded border border-slate-800 bg-slate-900/80 p-2.5 space-y-2"
                  : "rounded border border-slate-900 bg-slate-950/60 p-2.5 opacity-50 space-y-2"
              }
            >
              <div className="flex items-start gap-2.5">
                <ProductionItemVectorIcon
                  itemKind={item.kind}
                  faction={myEcon?.faction ?? faction}
                  className="h-12 w-12 shrink-0 rounded border border-slate-700/80 bg-slate-950 p-1"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-slate-100">{item.name}</span>
                    <Badge className="shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-300">
                      {item.cost} cr
                    </Badge>
                  </div>
                  <p className="text-[11px] leading-snug text-slate-400">{item.description}</p>
                  <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[10px]">
                    {item.attackRange > 0 && (
                      <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-red-300">
                        Tir {item.attackRange}t
                      </span>
                    )}
                    {item.detectionRange > item.attackRange && (
                      <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">
                        Détect. {item.detectionRange}t
                      </span>
                    )}
                    <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-slate-300">
                      Vision {item.sightRadius}t
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">
                  {unlocked
                    ? "Prérequis validés"
                    : `Requis : ${item.prerequisites.join(", ")}`}
                </span>
                <Button
                  size="sm"
                  variant={
                    isBuildingThis || placementBuilding?.kind === item.kind
                      ? "tactical"
                      : "default"
                  }
                  disabled={
                    !unlocked ||
                    (!isRepeatableBuildingKind(item.kind as BuildingKind) &&
                      activeSlot.activeItem !== null) ||
                    (!canAfford && placementBuilding?.kind !== item.kind)
                  }
                  onClick={() => {
                    globalAudioMixer.playUiClick();
                    if (
                      (activeTab === "BUILDING" || activeTab === "DEFENSE") &&
                      isRepeatableBuildingKind(item.kind as BuildingKind)
                    ) {
                      if (placementBuilding?.kind === item.kind) {
                        setPlacementBuilding(null);
                      } else {
                        setPlacementBuilding({
                          category: activeTab,
                          kind: item.kind as BuildingKind,
                        });
                      }
                      return;
                    }
                    triggerProduction(
                      activeTab,
                      item.kind as BuildingKind | UnitKind
                    );
                  }}
                >
                  <Cpu className="h-3 w-3" />
                  {placementBuilding?.kind === item.kind
                    ? "Pose Continue Active"
                    : isBuildingThis
                      ? "En cours"
                      : isRepeatableBuildingKind(item.kind as BuildingKind)
                        ? "Poser en Continu"
                        : "Produire"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
});
