"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Coins,
  Crosshair,
  DollarSign,
  FolderTree,
  Lock,
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
  BUILDINGS,
  FACTIONS,
  getBalancedGridSlotCount,
  getConstructionCatalogItems,
  getSubcategoriesForCategory,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  ZOOM_LEVELS,
  type BuildingKind,
  type ConstructionCatalogEntry,
  type ProductionCategory,
  type ProductionSubcategory,
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

type HoveredToolKind = "REPAIR" | "SELL" | "FORCE_ATTACK" | null;

const CATEGORY_META: Record<
  ProductionCategory,
  { label: string; fullTitle: string; icon: React.ComponentType<{ className?: string }> }
> = {
  BUILDING: { label: "Base", fullTitle: "Infrastructures de Base", icon: Building2 },
  DEFENSE: { label: "Déf.", fullTitle: "Fortifications & Défenses", icon: ShieldAlert },
  INFANTRY: { label: "Inf.", fullTitle: "Escouades d'Infanterie", icon: Users },
  VEHICLE: { label: "Blindés", fullTitle: "Véhicules & Blindés", icon: Truck },
};

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
  const [activeSubcategory, setActiveSubcategory] = useState<ProductionSubcategory | "ALL">("ALL");
  const [hoveredItem, setHoveredItem] = useState<ConstructionCatalogEntry | null>(null);
  const [hoveredTool, setHoveredTool] = useState<HoveredToolKind>(null);
  const [radarCollapsed, setRadarCollapsed] = useState(false);
  const minimapDraggingRef = useRef(false);

  // Read player economy snapshot gated by hudRevision (never re-renders on unit movement ticks)
  const myEcon = useMemo(() => {
    void hudRevision;
    return useRtsGameStore.getState().playersEconomy.get(playerId);
  }, [playerId, hudRevision]);

  const activeFaction = myEcon?.faction ?? faction;
  const credits = myEcon?.credits ?? 2500;
  const silverOre = myEcon?.silverOre ?? 0;
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

  const subcategories = useMemo(() => getSubcategoriesForCategory(activeTab), [activeTab]);
  const allCategoryItems = useMemo(
    () => getConstructionCatalogItems(activeTab, "ALL"),
    [activeTab]
  );
  const catalogItems = useMemo(
    () => getConstructionCatalogItems(activeTab, activeSubcategory),
    [activeTab, activeSubcategory]
  );

  const totalGridSlots = useMemo(
    () => getBalancedGridSlotCount(catalogItems.length, 2, 3),
    [catalogItems.length]
  );
  const emptySlotCount = Math.max(0, totalGridSlots - catalogItems.length);

  function updateMinimapFromClientXY(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number
  ): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onMinimapClickTile(Math.floor(relX * MAP_WIDTH_TILES), Math.floor(relY * MAP_HEIGHT_TILES));
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

  function handleSelectCategory(cat: ProductionCategory): void {
    globalAudioMixer.playUiClick();
    setActiveTab(cat);
    setActiveSubcategory("ALL");
    setHoveredItem(null);
  }

  function handleSelectSubcategory(sub: ProductionSubcategory | "ALL"): void {
    globalAudioMixer.playUiClick();
    setActiveSubcategory(sub);
    setHoveredItem(null);
  }

  function handleGridItemClick(item: ConstructionCatalogEntry, unlocked: boolean, canAfford: boolean): void {
    globalAudioMixer.playUiClick();

    if (!unlocked) {
      const missingNames = item.prerequisites
        .filter((req) => !ownedBuildingKinds.has(req))
        .map((req) => BUILDINGS[req].name)
        .join(", ");
      useRtsGameStore.setState({
        evaBannerText: `EVA : PRÉREQUIS REQUIS POUR ${item.name.toUpperCase()} (${missingNames})`,
      });
      return;
    }

    if (item.isDirectBlueprint && (activeTab === "BUILDING" || activeTab === "DEFENSE")) {
      if (placementBuilding?.kind === item.kind) {
        setPlacementBuilding(null);
        return;
      }
      if (!canAfford) {
        useRtsGameStore.setState({
          evaBannerText: `EVA : CRÉDITS INSUFFISANTS (${item.cost} CR REQUIS POUR ${item.name.toUpperCase()})`,
        });
        return;
      }
      setPlacementBuilding({
        category: activeTab,
        kind: item.kind as BuildingKind,
      });
      return;
    }

    if (activeSlot.activeItem !== null) {
      useRtsGameStore.setState({
        evaBannerText: "EVA : FILE DE PRODUCTION OCCUPÉE DANS CETTE CATÉGORIE",
      });
      return;
    }

    if (!canAfford) {
      useRtsGameStore.setState({
        evaBannerText: `EVA : CRÉDITS INSUFFISANTS (${item.cost} CR REQUIS POUR ${item.name.toUpperCase()})`,
      });
      return;
    }

    triggerProduction(activeTab, item.kind as BuildingKind | UnitKind);
  }

  const powerLoadRatio =
    powerProduced <= 0 ? 1 : Math.min(1, powerConsumed / Math.max(1, powerProduced));

  const activeSubcategorySpec =
    activeSubcategory === "ALL"
      ? null
      : subcategories.find((s) => s.id === activeSubcategory) ?? null;

  const hoveredItemUnlocked = hoveredItem
    ? hoveredItem.prerequisites.every((req) => ownedBuildingKinds.has(req))
    : false;
  const hoveredSubcategoryLabel = hoveredItem
    ? subcategories.find((s) => s.id === hoveredItem.subcategory)?.label ?? hoveredItem.subcategory
    : "";

  return (
    <aside className="relative flex h-full w-64 sm:w-72 lg:w-80 shrink-0 flex-col border-l border-slate-800 bg-tactical text-slate-100 select-none font-mono">
      {/* Floating Tactical Hover Menu (Appears when hovering any grid item or tool pictogram) */}
      {hoveredItem && (
        <div
          data-testid="construction-hover-menu"
          className="pointer-events-none fixed bottom-3 left-3 right-3 z-40 rounded-md border border-amber-500/60 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-md sm:absolute sm:bottom-auto sm:left-auto sm:right-full sm:top-24 sm:mr-2.5 sm:w-72"
        >
          <div className="flex items-start gap-2.5 border-b border-slate-800 pb-2">
            <ProductionItemVectorIcon
              itemKind={hoveredItem.kind}
              faction={activeFaction}
              className="h-11 w-11 shrink-0 rounded border border-slate-700 bg-slate-900 p-1"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-bold text-amber-300">
                  {hoveredItem.name}
                </span>
                <Badge className="shrink-0 border-amber-500/50 bg-amber-500/15 text-amber-200">
                  ${hoveredItem.cost}
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                <span className="truncate">{hoveredSubcategoryLabel}</span>
                <span>{(hoveredItem.buildTimeTicks / 20).toFixed(1)}s</span>
              </div>
            </div>
          </div>

          <p className="mt-2 text-[11px] leading-snug text-slate-200">
            {hoveredItem.description}
          </p>

          {/* Tactical Stats Matrix */}
          <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
            <div className="rounded border border-slate-800 bg-slate-900/90 px-2 py-1 text-slate-300">
              Structure : <span className="font-bold text-slate-100">{hoveredItem.maxHp} PV</span>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/90 px-2 py-1 text-slate-300">
              Vision : <span className="font-bold text-slate-100">{hoveredItem.sightRadius}t</span>
            </div>
            {hoveredItem.itemType === "BUILDING" && (
              <div className="rounded border border-slate-800 bg-slate-900/90 px-2 py-1 text-slate-300">
                Empreinte :{" "}
                <span className="font-bold text-slate-100">
                  {hoveredItem.footprintW}×{hoveredItem.footprintH}
                </span>
              </div>
            )}
            {hoveredItem.powerDelta !== 0 && (
              <div className="rounded border border-slate-800 bg-slate-900/90 px-2 py-1 text-slate-300">
                Énergie :{" "}
                <span
                  className={
                    hoveredItem.powerDelta > 0
                      ? "font-bold text-emerald-300"
                      : "font-bold text-amber-300"
                  }
                >
                  {hoveredItem.powerDelta > 0
                    ? `+${hoveredItem.powerDelta}`
                    : hoveredItem.powerDelta}{" "}
                  MW
                </span>
              </div>
            )}
            {hoveredItem.attackRange > 0 && (
              <div className="rounded border border-red-500/40 bg-red-950/40 px-2 py-1 text-red-200">
                Tir : <span className="font-bold">{hoveredItem.attackRange}t</span> (
                {hoveredItem.attackDamage} dmg)
              </div>
            )}
            {hoveredItem.detectionRange > hoveredItem.attackRange && (
              <div className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-1 text-cyan-200">
                Détection : <span className="font-bold">{hoveredItem.detectionRange}t</span>
              </div>
            )}
          </div>

          {/* Prerequisites & Action Footer */}
          <div className="mt-2 border-t border-slate-800 pt-1.5 space-y-1 text-[10px]">
            <div className={hoveredItemUnlocked ? "text-emerald-400" : "text-red-400 font-bold"}>
              {hoveredItemUnlocked
                ? "✓ Prérequis technologiques validés"
                : `🔒 Requis : ${hoveredItem.prerequisites
                    .map((req) => BUILDINGS[req].name)
                    .join(" + ")}`}
            </div>
            <div className="text-amber-300/90">
              {hoveredItem.isRepeatable
                ? "Clic gauche : Activer la pose continue sur la carte"
                : hoveredItem.isDirectBlueprint
                  ? "Clic gauche : Sélectionner le patron et poser sur la grille"
                  : "Clic gauche : Lancer la production dans l'usine"}
            </div>
          </div>
        </div>
      )}

      {!hoveredItem && hoveredTool && (
        <div
          data-testid="tool-hover-menu"
          className="pointer-events-none fixed bottom-3 left-3 right-3 z-40 rounded-md border border-amber-500/60 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur-md sm:absolute sm:bottom-auto sm:left-auto sm:right-full sm:top-44 sm:mr-2.5 sm:w-64"
        >
          {hoveredTool === "REPAIR" && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <Wrench className="h-3.5 w-3.5" />
                <span>Réparation Tactique</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Active le curseur clé à molette : cliquez sur un bâtiment allié endommagé pour le réparer (+10 PV / 2 cr par tick).
              </p>
            </div>
          )}
          {hoveredTool === "SELL" && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <DollarSign className="h-3.5 w-3.5" />
                <span>Vente de Structure (50%)</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Active le curseur dollar : cliquez sur une structure alliée pour la démanteler et récupérer 50% de son coût en crédits.
              </p>
            </div>
          )}
          {hoveredTool === "FORCE_ATTACK" && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-300">
                <Crosshair className="h-3.5 w-3.5" />
                <span>Tir Forcé au Sol (Ctrl + Clic)</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Ordonne aux unités sélectionnées de pilonner une coordonnée au sol ou de détruire des arbres.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Top Faction & Compact Resource Display */}
      <div className="border-b border-slate-800 bg-slate-950/95 p-2 lg:p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <FactionVectorEmblem
              faction={activeFaction}
              className="h-6 w-6 shrink-0"
            />
            <Badge className={`truncate ${FACTIONS[activeFaction].badgeClass}`}>
              {activeFaction} CMD
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

        {/* Compact Credits & Silver Ore Row */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center justify-between rounded border border-amber-500/40 bg-slate-900 px-2 py-1">
            <div className="flex items-center gap-1 text-[10px] text-amber-300">
              <Coins className="h-3 w-3 text-amber-400 shrink-0" />
              <span>CR</span>
            </div>
            <div className="text-xs font-bold tracking-tight text-amber-400">
              {credits.toLocaleString()}{" "}
              <span className="text-[9px] font-normal text-slate-500">
                /{Math.round(maxStorage / 1000)}k
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-slate-500/40 bg-slate-900 px-2 py-1">
            <div className="flex items-center gap-1 text-[10px] text-slate-300">
              <Coins className="h-3 w-3 text-slate-300 shrink-0" />
              <span>ARGENT</span>
            </div>
            <div className="text-xs font-bold tracking-tight text-slate-100">
              {silverOre.toLocaleString()}{" "}
              <span className="text-[9px] font-normal text-slate-400">Ag</span>
            </div>
          </div>
        </div>

        {/* Discretized Power Balance Gauge */}
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1 text-slate-300">
              <Zap className="h-3 w-3 text-amber-400" />
              ÉNERGIE
            </span>
            <span className={lowPower ? "text-red-400 font-bold" : "text-emerald-300"}>
              {powerConsumed} / {powerProduced} MW
            </span>
          </div>
          <DiscretizedProgressBar
            ratio={powerLoadRatio}
            tone={lowPower ? "red" : powerLoadRatio > 0.8 ? "amber" : "emerald"}
          />
        </div>
      </div>

      {/* Second Canvas Element: Tactical Radar Minimap */}
      <div className="border-b border-slate-800 bg-slate-950 px-2.5 py-2">
        <div className="flex items-center justify-between text-[10px] uppercase text-slate-400">
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
          <span className={lowPower ? "text-red-400 font-bold" : "text-emerald-400"}>
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
            className="h-28 sm:h-32 lg:h-36 w-full cursor-crosshair rounded touch-none"
          />
        </div>
      </div>

      {/* Tactical Pictogram Command Bar: Wrench (Repair), Dollar (Sell), Crosshair (Force Fire) & Zoom */}
      <div className="border-b border-slate-800 bg-slate-950/85 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          {/* Pictogram Action Buttons (Wrench / Dollar / Crosshair) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Réparer"
              title="Réparer une structure (Clé à molette)"
              onMouseEnter={() => setHoveredTool("REPAIR")}
              onMouseLeave={() => setHoveredTool((prev) => (prev === "REPAIR" ? null : prev))}
              onClick={() => {
                globalAudioMixer.playUiClick();
                setRepairMode(!repairMode);
              }}
              className={
                repairMode
                  ? "flex h-8 w-9 items-center justify-center rounded border border-emerald-400 bg-emerald-500/25 text-emerald-200 shadow-sm"
                  : "flex h-8 w-9 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/60 hover:text-emerald-300"
              }
            >
              <Wrench className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="Vendre"
              title="Vendre une structure (50% remboursement)"
              onMouseEnter={() => setHoveredTool("SELL")}
              onMouseLeave={() => setHoveredTool((prev) => (prev === "SELL" ? null : prev))}
              onClick={() => {
                globalAudioMixer.playUiClick();
                setSellMode(!sellMode);
              }}
              className={
                sellMode
                  ? "flex h-8 w-9 items-center justify-center rounded border border-amber-400 bg-amber-500/25 text-amber-200 shadow-sm"
                  : "flex h-8 w-9 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-500/60 hover:text-amber-300"
              }
            >
              <DollarSign className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="Tir Forcé au Sol"
              title="Tir Forcé au Sol (Ctrl + Clic)"
              onMouseEnter={() => setHoveredTool("FORCE_ATTACK")}
              onMouseLeave={() =>
                setHoveredTool((prev) => (prev === "FORCE_ATTACK" ? null : prev))
              }
              onClick={() => {
                globalAudioMixer.playUiClick();
                setForceAttackMode(!forceAttackMode);
              }}
              className={
                forceAttackMode
                  ? "flex h-8 w-9 items-center justify-center rounded border border-red-400 bg-red-500/25 text-red-200 shadow-sm"
                  : "flex h-8 w-9 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-red-500/60 hover:text-red-300"
              }
            >
              <Crosshair className="h-4 w-4" />
            </button>
          </div>

          {/* Compact Zoom Selector */}
          <div className="flex flex-1 items-center justify-end gap-1">
            <button
              type="button"
              onClick={onCycleZoom}
              title="Changer le zoom"
              className="flex h-8 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 text-[10px] font-bold text-amber-300 hover:border-amber-500/50"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              <span>{zoomLevel}x</span>
            </button>
            <div className="hidden sm:grid grid-cols-5 gap-0.5 rounded border border-slate-800 bg-slate-950 p-0.5">
              {ZOOM_LEVELS.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => onSelectZoom(z)}
                  className={
                    Math.abs(zoomLevel - z) < 0.01
                      ? "rounded border border-amber-400/60 bg-amber-500/25 px-1 py-1 text-[9px] font-bold text-amber-300"
                      : "rounded px-1 py-1 text-[9px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }
                >
                  {z}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Tool Mode Indicator Strip */}
        {(repairMode || sellMode || forceAttackMode) && (
          <div className="flex items-center justify-between rounded border border-amber-500/40 bg-slate-900/90 px-2 py-1 text-[10px]">
            <span className="font-bold text-amber-300">
              {repairMode
                ? "OUTIL : RÉPARATION ACTIVE"
                : sellMode
                  ? "OUTIL : VENTE (50%) ACTIVE"
                  : "OUTIL : TIR FORCÉ AU SOL"}
            </span>
            <button
              type="button"
              onClick={() => {
                setRepairMode(false);
                setSellMode(false);
                setForceAttackMode(false);
              }}
              className="text-slate-400 underline hover:text-slate-200"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {/* Level 1 Hierarchy: 4 Main Production Category Tabs */}
      <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950">
        {(["BUILDING", "DEFENSE", "INFANTRY", "VEHICLE"] as const).map((catId) => {
          const meta = CATEGORY_META[catId];
          const Icon = meta.icon;
          const isCurrent = activeTab === catId;
          const qSlot = myEcon?.queues.find((q) => q.category === catId);
          return (
            <button
              key={catId}
              type="button"
              onClick={() => handleSelectCategory(catId)}
              className={
                isCurrent
                  ? "flex flex-col items-center justify-center border-b-2 border-amber-400 bg-slate-900 py-1.5 text-[10px] font-bold text-amber-300"
                  : "flex flex-col items-center justify-center py-1.5 text-[10px] text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              }
            >
              <Icon className="h-3.5 w-3.5 mb-0.5" />
              <span>{meta.label}</span>
              {qSlot?.readyToPlace ? (
                <span className="mt-0.5 rounded bg-emerald-500/30 px-1 text-[8px] text-emerald-300">
                  PRÊT
                </span>
              ) : qSlot?.activeItem ? (
                <span className="mt-0.5 rounded bg-amber-500/30 px-1 text-[8px] text-amber-300">
                  {Math.round(qSlot.progressRatio * 100)}%
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Level 2 Hierarchy: Subcategory Filter & Breadcrumb Navigation */}
      <div className="border-b border-slate-800 bg-slate-950/90 px-2.5 py-1.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-1 truncate">
            <FolderTree className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="font-bold text-slate-200">{CATEGORY_META[activeTab].label}</span>
            <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
            <span className="truncate text-amber-300">
              {activeSubcategorySpec ? activeSubcategorySpec.label : "Tous les éléments"}
            </span>
          </div>
          <span className="shrink-0 text-[9px] text-slate-500">
            {catalogItems.length} élém.
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => handleSelectSubcategory("ALL")}
            className={
              activeSubcategory === "ALL"
                ? "rounded border border-amber-400/70 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200"
                : "rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }
          >
            Tous ({allCategoryItems.length})
          </button>
          {subcategories.map((sub) => {
            const count = allCategoryItems.filter((i) => i.subcategory === sub.id).length;
            const isSelected = activeSubcategory === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleSelectSubcategory(sub.id)}
                className={
                  isSelected
                    ? "rounded border border-amber-400/70 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200"
                    : "rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }
              >
                {sub.shortLabel} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Queue Status Strip (when producing a unit or legacy queued item) */}
      {activeSlot.activeItem && (
        <div className="border-b border-slate-800 bg-slate-900/90 px-2.5 py-1.5 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold text-amber-300 truncate">
              EN COURS : {activeSlot.activeItem}
            </span>
            <span className="text-emerald-300 font-bold">
              {Math.round(activeSlot.progressRatio * 100)}%
            </span>
          </div>
          <DiscretizedProgressBar
            ratio={activeSlot.progressRatio}
            tone={activeSlot.readyToPlace ? "emerald" : "amber"}
          />
        </div>
      )}

      {/* Balanced 3-Column Construction Image Grid */}
      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-2.5">
        <div
          data-testid="construction-grid"
          className="grid grid-cols-3 gap-2"
        >
          {catalogItems.map((item) => {
            const unlocked = item.prerequisites.every((req) => ownedBuildingKinds.has(req));
            const isBuildingThis = activeSlot.activeItem === item.kind;
            const isActiveBlueprint = placementBuilding?.kind === item.kind;
            const canAfford = credits >= item.cost;

            const tileBorderClass = isActiveBlueprint
              ? "border-emerald-400 bg-emerald-950/50 ring-1 ring-emerald-400/60"
              : isBuildingThis
                ? "border-amber-400 bg-amber-950/40"
                : unlocked
                  ? "border-slate-700/90 bg-slate-900/90 hover:border-amber-400/80 hover:bg-slate-800/90"
                  : "border-slate-900 bg-slate-950/60 opacity-45 hover:opacity-75 hover:border-slate-700";

            return (
              <button
                key={`${activeTab}-${item.kind}`}
                type="button"
                data-testid={`grid-tile-${item.kind}`}
                aria-label={`${item.name} (${item.cost} crédits)`}
                onMouseEnter={() => setHoveredItem(item)}
                onMouseLeave={() =>
                  setHoveredItem((prev) => (prev?.kind === item.kind ? null : prev))
                }
                onFocus={() => setHoveredItem(item)}
                onBlur={() =>
                  setHoveredItem((prev) => (prev?.kind === item.kind ? null : prev))
                }
                onClick={() => handleGridItemClick(item, unlocked, canAfford)}
                className={`group relative flex aspect-square flex-col items-center justify-between overflow-hidden rounded border p-1.5 text-left transition ${tileBorderClass}`}
              >
                {/* Top Row: Status Badge / Lock on Left + Cost on Right */}
                <div className="flex w-full items-center justify-between gap-0.5 z-10">
                  {!unlocked ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-950/90 text-red-400">
                      <Lock className="h-2.5 w-2.5" />
                    </span>
                  ) : isActiveBlueprint ? (
                    <span className="rounded bg-emerald-500/30 px-1 py-0.2 text-[8px] font-bold uppercase text-emerald-200">
                      {item.isRepeatable ? "Cont." : "Patron"}
                    </span>
                  ) : isBuildingThis ? (
                    <span className="rounded bg-amber-500/30 px-1 py-0.2 text-[8px] font-bold text-amber-200">
                      {Math.round(activeSlot.progressRatio * 100)}%
                    </span>
                  ) : (
                    <span />
                  )}

                  <span
                    className={
                      canAfford
                        ? "rounded bg-slate-950/90 px-1 py-0.2 text-[9px] font-bold text-amber-300"
                        : "rounded bg-slate-950/90 px-1 py-0.2 text-[9px] font-bold text-red-400"
                    }
                  >
                    ${item.cost}
                  </span>
                </div>

                {/* Center: High-Precision Vector Artwork */}
                <div className="my-auto flex items-center justify-center">
                  <ProductionItemVectorIcon
                    itemKind={item.kind}
                    faction={activeFaction}
                    className="h-10 w-10 sm:h-11 sm:w-11 transition-transform duration-150 group-hover:scale-110"
                  />
                </div>

                {/* Bottom: Short Name & Optional Active Build Progress Bar */}
                <div className="w-full space-y-0.5 z-10">
                  <div className="w-full truncate text-center text-[9px] font-bold leading-tight text-slate-100 group-hover:text-amber-200">
                    {item.shortName}
                  </div>
                  {isBuildingThis && (
                    <DiscretizedProgressBar
                      ratio={activeSlot.progressRatio}
                      tone={activeSlot.readyToPlace ? "emerald" : "amber"}
                      className="h-1"
                    />
                  )}
                </div>
              </button>
            );
          })}

          {/* Balanced Empty Rack Slots so the 3-column grid is always uniform and extensible */}
          {Array.from({ length: emptySlotCount }).map((_, idx) => (
            <div
              key={`empty-slot-${idx}`}
              aria-hidden="true"
              className="flex aspect-square flex-col items-center justify-center rounded border border-dashed border-slate-800/60 bg-slate-950/30 p-1.5"
            >
              <div className="h-2 w-2 rounded-full bg-slate-800/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Compact Status Footer */}
      <div className="border-t border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[10px] text-slate-400">
        {hoveredItem ? (
          <div className="flex items-center justify-between gap-2 truncate">
            <span className="truncate font-bold text-amber-300">{hoveredItem.name}</span>
            <span className="shrink-0 text-slate-300">${hoveredItem.cost} cr</span>
          </div>
        ) : placementBuilding ? (
          <div className="flex items-center justify-between gap-2 text-emerald-300">
            <span className="truncate font-bold">
              PATRON : {BUILDINGS[placementBuilding.kind].shortName}
            </span>
            <button
              type="button"
              onClick={() => setPlacementBuilding(null)}
              className="shrink-0 text-red-300 underline"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="truncate text-slate-500">
            Survolez une case pour les détails • Cliquez pour construire
          </div>
        )}
      </div>
    </aside>
  );
});
