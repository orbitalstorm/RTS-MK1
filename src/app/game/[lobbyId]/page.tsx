"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  Crosshair,
  Hand,
  Home,
  Layers,
  Lock,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Send,
  ShieldCheck,
  Smartphone,
  SquareDashedMousePointer,
  Swords,
  Trophy,
  X,
  ZoomIn,
} from "lucide-react";
import {
  BASE_BUILD_RADIUS_TILES,
  BUILDINGS,
  canPlaceBuildingOnTerrainTile,
  computeEdgeScrollVelocity,
  FACTIONS,
  isRepeatableBuildingKind,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  resolveTouchTapAction,
  TERRAIN_KIND,
  TILE_PIXEL_SIZE,
  TOUCH_TAP_MAX_DISTANCE_PX,
  ZOOM_LEVELS,
  type BuildingKind,
  type FactionId,
  type TouchInteractionMode,
} from "../../../shared/constants";
import { globalAudioMixer } from "../../../audio/mixer";
import { ClassicSidebarHud } from "../../../components/hud/classic-sidebar-hud";
import { FactionVectorEmblem } from "../../../components/hud/leonardo-icons";
import { Badge, Button, Card, DiscretizedProgressBar } from "../../../components/ui/primitives";
import { TacticalCamera } from "../../../renderer/camera";
import {
  generateProceduralSpriteAtlasAsync,
  type ProceduralSpriteAtlas,
} from "../../../renderer/generator/atlas-generator";
import { renderMinimapRadar } from "../../../renderer/minimap-renderer";
import { BattlefieldVfxManager } from "../../../renderer/vfx-manager";
import { renderTacticalWorld } from "../../../renderer/world-renderer";
import { useRtsGameStore, type RtsGameStoreState } from "../../../store/game-store";

interface PendingTilePlacement {
  tileX: number;
  tileY: number;
  kind: BuildingKind;
  expiresAtMs: number;
}

function canPlaceBuildingOnGrid(
  st: RtsGameStoreState,
  buildingKind: BuildingKind,
  tileX: number,
  tileY: number,
  pendingPlacements?: ReadonlyMap<string, PendingTilePlacement>,
  nowMs = performance.now()
): boolean {
  const spec = BUILDINGS[buildingKind];
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX + spec.footprintW > MAP_WIDTH_TILES ||
    tileY + spec.footprintH > MAP_HEIGHT_TILES
  ) {
    return false;
  }

  let hasConstructorBot = false;
  for (const ent of st.currEntities.values()) {
    if (
      ent.ownerId === st.playerId &&
      ent.entityType === "UNIT" &&
      ent.kind === "CONSTRUCTOR_BOT"
    ) {
      hasConstructorBot = true;
      break;
    }
  }
  if (!hasConstructorBot) {
    return false;
  }

  for (let dy = 0; dy < spec.footprintH; dy++) {
    for (let dx = 0; dx < spec.footprintW; dx++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const idx = ty * MAP_WIDTH_TILES + tx;
      const cellTerrain = st.terrainGrid[idx] ?? 0;
      if (!canPlaceBuildingOnTerrainTile(buildingKind, cellTerrain)) {
        return false;
      }
      if (buildingKind === "CONCRETE_SLAB" && cellTerrain === TERRAIN_KIND.CONCRETE_SLAB) {
        return false;
      }
      if (pendingPlacements) {
        const pending = pendingPlacements.get(`${tx},${ty}`);
        if (pending && nowMs < pending.expiresAtMs) {
          return false;
        }
      }
    }
  }

  const cx = tileX + spec.footprintW * 0.5;
  const cy = tileY + spec.footprintH * 0.5;
  let withinBaseRadius = false;

  for (const ent of st.currEntities.values()) {
    if (ent.entityType === "BUILDING") {
      const bSpec = BUILDINGS[ent.kind as BuildingKind];
      const overlapsX = tileX < ent.x + bSpec.footprintW && tileX + spec.footprintW > ent.x;
      const overlapsY = tileY < ent.y + bSpec.footprintH && tileY + spec.footprintH > ent.y;
      if (overlapsX && overlapsY) {
        return false;
      }
      if (ent.ownerId === st.playerId && (ent.buildProgress ?? 1) >= 1) {
        const bx = ent.x + bSpec.footprintW * 0.5;
        const by = ent.y + bSpec.footprintH * 0.5;
        if (Math.hypot(cx - bx, cy - by) <= BASE_BUILD_RADIUS_TILES) {
          withinBaseRadius = true;
        }
      }
    } else if (ent.entityType === "TREE") {
      const tx = Math.round(ent.x);
      const ty = Math.round(ent.y);
      if (
        tx >= tileX &&
        tx < tileX + spec.footprintW &&
        ty >= tileY &&
        ty < tileY + spec.footprintH
      ) {
        return false;
      }
    } else if (ent.entityType === "UNIT" && ent.ownerId !== st.playerId) {
      const ux = Math.round(ent.x);
      const uy = Math.round(ent.y);
      if (
        ux >= tileX &&
        ux < tileX + spec.footprintW &&
        uy >= tileY &&
        uy < tileY + spec.footprintH
      ) {
        return false;
      }
    }
  }

  if (!withinBaseRadius && pendingPlacements) {
    for (const pending of pendingPlacements.values()) {
      if (nowMs < pending.expiresAtMs && pending.kind !== "CONCRETE_SLAB") {
        const pSpec = BUILDINGS[pending.kind];
        const bx = pending.tileX + pSpec.footprintW * 0.5;
        const by = pending.tileY + pSpec.footprintH * 0.5;
        if (Math.hypot(cx - bx, cy - by) <= BASE_BUILD_RADIUS_TILES) {
          withinBaseRadius = true;
          break;
        }
      }
    }
  }

  return withinBaseRadius;
}

export default function GameMatchPage() {
  const params = useParams<{ lobbyId: string }>();
  const router = useRouter();
  const lobbyId = decodeURIComponent(params.lobbyId);

  const playerId = useRtsGameStore((s) => s.playerId);
  const commanderName = useRtsGameStore((s) => s.commanderName);
  const faction = useRtsGameStore((s) => s.faction);
  const overview = useRtsGameStore((s) => s.overview);
  const evaBannerText = useRtsGameStore((s) => s.evaBannerText);
  const winnerPlayerId = useRtsGameStore((s) => s.winnerPlayerId);
  const selectedUnitCount = useRtsGameStore((s) => s.selectedEntityIds.size);
  const hasPlacementBuilding = useRtsGameStore((s) => s.placementBuilding !== null);
  const connectWebSocket = useRtsGameStore((s) => s.connectWebSocket);
  const sendMessage = useRtsGameStore((s) => s.sendMessage);
  const setSelectedEntities = useRtsGameStore((s) => s.setSelectedEntities);
  const setPlacementBuilding = useRtsGameStore((s) => s.setPlacementBuilding);

  const lobby = overview.lobbies.find((l) => l.lobbyId === lobbyId);

  const [atlas, setAtlas] = useState<ProceduralSpriteAtlas | null>(null);
  const [atlasProgress, setAtlasProgress] = useState(0);
  const [atlasStage, setAtlasStage] = useState("Initialisation OffscreenCanvas...");
  const [chatInput, setChatInput] = useState("");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [touchMode, setTouchMode] = useState<TouchInteractionMode>("AUTO");

  const worldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<TacticalCamera>(new TacticalCamera());
  const vfxManagerRef = useRef<BattlefieldVfxManager>(new BattlefieldVfxManager());
  const lastFrameTimeRef = useRef<number>(performance.now());
  const lastProcessedProjectileTickRef = useRef<number>(-1);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragCurrRef = useRef<{ x: number; y: number } | null>(null);
  const hoverTileRef = useRef<{ tileX: number; tileY: number }>({ tileX: 6, tileY: 6 });
  const pendingPlacedTilesRef = useRef<Map<string, PendingTilePlacement>>(new Map());
  const lastDragPlacedTileRef = useRef<{ tileX: number; tileY: number }>({
    tileX: -1,
    tileY: -1,
  });
  const pointerCanvasRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: -1,
    y: -1,
    inside: false,
  });
  const keysPressedRef = useRef<Set<string>>(new Set());
  const touchStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    movedDistance: number;
    isTwoFinger: boolean;
    pinchStartDist: number;
    pinchStartZoom: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    movedDistance: 0,
    isTwoFinger: false,
    pinchStartDist: 0,
    pinchStartZoom: 1,
  });

  // 1. Connect WebSocket & join lobby
  useEffect(() => {
    connectWebSocket();
    const timer = setTimeout(() => {
      sendMessage({
        type: "LOBBY_JOIN",
        lobbyId,
        playerId,
        commanderName,
        faction,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [connectWebSocket, sendMessage, lobbyId, playerId, commanderName, faction]);

  // 2. Generate Hybrid Vector/Bitmap OffscreenCanvas -> ImageBitmap Sprite Atlas in async chunks
  useEffect(() => {
    let cancelled = false;
    let builtAtlas: ProceduralSpriteAtlas | null = null;

    void generateProceduralSpriteAtlasAsync((pct, label) => {
      if (!cancelled) {
        setAtlasProgress(pct);
        setAtlasStage(label);
      }
    }).then((result) => {
      if (cancelled) {
        result.dispose();
        return;
      }
      builtAtlas = result;
      setAtlas(result);
    });

    return () => {
      cancelled = true;
      if (builtAtlas) {
        builtAtlas.dispose();
      }
    };
  }, []);

  // 3. Keyboard camera panning (WASD / Arrows)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressedRef.current.add(e.key.toLowerCase());
      if (e.key === "Escape") {
        setPlacementBuilding(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setPlacementBuilding]);

  // 4. ResizeObserver for World Canvas (Zero getBoundingClientRect inside 60 FPS RAF loop)
  useEffect(() => {
    const canvas = worldCanvasRef.current;
    if (!canvas) return;

    const applySize = (w: number, h: number) => {
      const nextW = Math.max(320, Math.floor(w));
      const nextH = Math.max(240, Math.floor(h));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
        cameraRef.current.setViewport(nextW, nextH);
      }
    };

    const initRect = canvas.getBoundingClientRect();
    applySize(initRect.width, initRect.height);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        applySize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [atlas, lobby?.status, sidebarOpen]);

  // 5. 60+ FPS Tactical World & Radar Minimap Render Loop with Tick Interpolation
  useEffect(() => {
    if (!atlas) return;
    let animId = 0;
    lastFrameTimeRef.current = performance.now();
    const emptyCellSet: ReadonlySet<number> = new Set<number>();
    let cachedWorldCanvas: HTMLCanvasElement | null = null;
    let cachedWorldCtx: CanvasRenderingContext2D | null = null;
    let cachedMiniCanvas: HTMLCanvasElement | null = null;
    let cachedMiniCtx: CanvasRenderingContext2D | null = null;

    const renderFrame = () => {
      const nowMs = performance.now();
      const dtSec = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameTimeRef.current) * 0.001));
      lastFrameTimeRef.current = nowMs;

      const st = useRtsGameStore.getState();
      const cam = cameraRef.current;

      // Smooth keyboard camera pan
      const keys = keysPressedRef.current;
      const panSpeed = 7;
      if (keys.has("w") || keys.has("arrowup")) cam.pan(0, -panSpeed);
      if (keys.has("s") || keys.has("arrowdown")) cam.pan(0, panSpeed);
      if (keys.has("a") || keys.has("arrowleft")) cam.pan(-panSpeed, 0);
      if (keys.has("d") || keys.has("arrowright")) cam.pan(panSpeed, 0);

      // Gentle, progressive edge-of-screen camera auto-scroll when cursor is near a canvas border
      if (pointerCanvasRef.current.inside && !dragStartRef.current) {
        const { vx, vy } = computeEdgeScrollVelocity(
          pointerCanvasRef.current.x,
          pointerCanvasRef.current.y,
          cam.viewportWidth,
          cam.viewportHeight
        );
        if (vx !== 0 || vy !== 0) {
          cam.pan(vx, vy);
          hoverTileRef.current = cam.screenToTile(
            pointerCanvasRef.current.x,
            pointerCanvasRef.current.y
          );
        }
      }

      // Process acoustic events with camera spatialization
      const events = st.consumeAcousticEvents();
      if (events.length > 0) {
        const centerTile = cam.getCenterTile();
        for (const ev of events) {
          if (ev.targetPlayerId && ev.targetPlayerId !== st.playerId) continue;
          globalAudioMixer.playAcousticEvent(ev, centerTile.tileX, centerTile.tileY);
        }
      }

      // Ingest tick visual effects and new projectiles into the 60 FPS VFX Manager
      const vfxEvents = st.consumeVisualEffects();
      const isNewProjectileTick =
        st.tickId !== lastProcessedProjectileTickRef.current && st.recentProjectiles.length > 0;
      if (isNewProjectileTick) {
        lastProcessedProjectileTickRef.current = st.tickId;
      }
      if (vfxEvents.length > 0 || isNewProjectileTick) {
        vfxManagerRef.current.ingestTickEvents(
          vfxEvents,
          isNewProjectileTick ? st.recentProjectiles : [],
          cam,
          nowMs
        );
      }

      const explored = st.exploredByPlayer.get(st.playerId) ?? emptyCellSet;
      const visible = st.visibleByPlayer.get(st.playerId) ?? emptyCellSet;

      const canvas = worldCanvasRef.current;
      if (canvas) {
        if (cachedWorldCanvas !== canvas) {
          cachedWorldCanvas = canvas;
          cachedWorldCtx = canvas.getContext("2d");
        }
        const ctx = cachedWorldCtx;
        if (ctx) {
          const elapsedSinceTick = nowMs - st.lastTickReceivedAt;
          const alpha = Math.max(
            0,
            Math.min(1.05, elapsedSinceTick / Math.max(40, st.tickDurationMs))
          );

          let placementPreview: {
            faction: FactionId;
            buildingKind: BuildingKind;
            tileX: number;
            tileY: number;
            valid: boolean;
          } | null = null;

          if (st.placementBuilding) {
            const bKind = st.placementBuilding.kind;
            const tx = hoverTileRef.current.tileX;
            const ty = hoverTileRef.current.tileY;
            const myEcon = st.playersEconomy.get(st.playerId);
            const valid = canPlaceBuildingOnGrid(
              st,
              bKind,
              tx,
              ty,
              pendingPlacedTilesRef.current,
              nowMs
            );
            placementPreview = {
              faction: myEcon?.faction ?? st.faction,
              buildingKind: bKind,
              tileX: tx,
              tileY: ty,
              valid,
            };
          }

          renderTacticalWorld({
            ctx,
            camera: cam,
            atlas,
            localPlayerId: st.playerId,
            terrainGrid: st.terrainGrid,
            oreGrid: st.oreGrid,
            prevEntities: st.prevEntities,
            currEntities: st.currEntities,
            playersEconomy: st.playersEconomy,
            interpolationAlpha: alpha,
            selectedIds: st.selectedEntityIds,
            exploredCells: explored,
            visibleCells: visible,
            projectiles: st.recentProjectiles,
            vfxManager: vfxManagerRef.current,
            nowMs,
            dtSec,
            dragBox:
              dragStartRef.current && dragCurrRef.current
                ? {
                    startX: dragStartRef.current.x,
                    startY: dragStartRef.current.y,
                    endX: dragCurrRef.current.x,
                    endY: dragCurrRef.current.y,
                  }
                : null,
            placementPreview,
          });
        }
      }

      const miniCanvas = minimapCanvasRef.current;
      if (miniCanvas) {
        if (cachedMiniCanvas !== miniCanvas) {
          cachedMiniCanvas = miniCanvas;
          cachedMiniCtx = miniCanvas.getContext("2d");
        }
        const mCtx = cachedMiniCtx;
        if (mCtx) {
          const myEcon = st.playersEconomy.get(st.playerId);
          renderMinimapRadar({
            ctx: mCtx,
            width: miniCanvas.width,
            height: miniCanvas.height,
            radarActive: myEcon?.radarActive ?? false,
            lowPower: myEcon?.lowPower ?? false,
            localPlayerId: st.playerId,
            terrainGrid: st.terrainGrid,
            oreGrid: st.oreGrid,
            entities: st.currEntities,
            exploredCells: explored,
            visibleCells: visible,
            camera: cam,
            nowMs,
          });
        }
      }

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [atlas]);

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const st = useRtsGameStore.getState();
    const { tileX, tileY } = cameraRef.current.screenToTile(sx, sy);

    if (e.button === 2) {
      // Right-click: Cancel selected building awaiting construction, or issue Move / Attack / Force-Attack Ground command
      e.preventDefault();
      if (st.placementBuilding || st.sellMode || st.repairMode || st.forceAttackMode) {
        setPlacementBuilding(null);
        return;
      }

      // Check if right-clicking a currently selected allied building awaiting construction -> cancel construction
      for (const selectedId of st.selectedEntityIds) {
        const ent = st.currEntities.get(selectedId);
        if (
          ent &&
          ent.ownerId === st.playerId &&
          ent.entityType === "BUILDING" &&
          (ent.buildProgress ?? 1) < 1
        ) {
          const bSpec = BUILDINGS[ent.kind as BuildingKind];
          if (
            tileX >= ent.x &&
            tileX < ent.x + bSpec.footprintW &&
            tileY >= ent.y &&
            tileY < ent.y + bSpec.footprintH
          ) {
            globalAudioMixer.playUiClick();
            sendMessage({
              type: "COMMAND_CANCEL_CONSTRUCTION",
              lobbyId,
              playerId,
              buildingEntityId: ent.id,
            });
            const nextSel = new Set(st.selectedEntityIds);
            nextSel.delete(ent.id);
            setSelectedEntities(nextSel);
            useRtsGameStore.setState({
              evaBannerText: `EVA : CONSTRUCTION ANNULÉE (${bSpec.name.toUpperCase()}) — CRÉDITS REMBOURSÉS`,
            });
            return;
          }
        }
      }

      const selectedUnits = Array.from(st.selectedEntityIds).filter((id) => {
        const ent = st.currEntities.get(id);
        return ent?.entityType === "UNIT";
      });
      if (selectedUnits.length === 0) return;

      if (e.ctrlKey) {
        globalAudioMixer.playUiClick();
        sendMessage({
          type: "COMMAND_ATTACK_GROUND",
          lobbyId,
          playerId,
          entityIds: selectedUnits,
          targetTileX: tileX,
          targetTileY: tileY,
        });
        return;
      }

      // Check if clicking an enemy entity or destructible tree
      let targetEnemyId: string | null = null;
      for (const ent of st.currEntities.values()) {
        if (ent.ownerId === st.playerId) continue;
        const w =
          ent.entityType === "BUILDING"
            ? BUILDINGS[ent.kind as BuildingKind].footprintW
            : 1;
        const h =
          ent.entityType === "BUILDING"
            ? BUILDINGS[ent.kind as BuildingKind].footprintH
            : 1;
        if (tileX >= ent.x && tileX < ent.x + w && tileY >= ent.y && tileY < ent.y + h) {
          targetEnemyId = ent.id;
          break;
        }
      }

      globalAudioMixer.playUiClick();
      if (targetEnemyId) {
        sendMessage({
          type: "COMMAND_ATTACK",
          lobbyId,
          playerId,
          entityIds: selectedUnits,
          targetEntityId: targetEnemyId,
        });
      } else {
        sendMessage({
          type: "COMMAND_MOVE",
          lobbyId,
          playerId,
          entityIds: selectedUnits,
          targetTileX: tileX,
          targetTileY: tileY,
        });
      }
      return;
    }

    // Left-click: Place building, Repair structure, Sell structure, Force-Attack Ground, or start selection box
    if (st.placementBuilding) {
      const bKind = st.placementBuilding.kind;
      const spec = BUILDINGS[bKind];
      const repeatable = isRepeatableBuildingKind(bKind);
      const nowMs = performance.now();
      const valid = canPlaceBuildingOnGrid(
        st,
        bKind,
        tileX,
        tileY,
        pendingPlacedTilesRef.current,
        nowMs
      );
      if (!valid) {
        useRtsGameStore.setState({
          evaBannerText:
            "EVA : ZONE DE DÉPLOIEMENT INVALIDE — CLIQUEZ SUR UN EMPLACEMENT VERT PRÈS DE LA BASE",
        });
        return;
      }
      const myEcon = st.playersEconomy.get(st.playerId);
      const qSlot = myEcon?.queues.find((q) => q.category === st.placementBuilding?.category);
      const paidInQueue = qSlot?.activeItem === bKind;
      if (!paidInQueue && (myEcon?.credits ?? 0) < spec.cost) {
        useRtsGameStore.setState({
          evaBannerText:
            "EVA : CRÉDITS INSUFFISANTS POUR POSER CE PATRON (CLIC DROIT POUR DÉSÉLECTIONNER L'OUTIL)",
        });
        return;
      }
      globalAudioMixer.playUiClick();
      sendMessage({
        type: "COMMAND_PLACE_BUILDING",
        lobbyId,
        playerId,
        category: st.placementBuilding.category,
        buildingKind: bKind,
        tileX,
        tileY,
      });
      pendingPlacedTilesRef.current.set(`${tileX},${tileY}`, {
        tileX,
        tileY,
        kind: bKind,
        expiresAtMs: nowMs + 350,
      });
      lastDragPlacedTileRef.current = { tileX, tileY };
      if (!repeatable) {
        setPlacementBuilding(null);
      }
      return;
    }

    if (st.repairMode) {
      for (const ent of st.currEntities.values()) {
        if (ent.ownerId === st.playerId && ent.entityType === "BUILDING") {
          const spec = BUILDINGS[ent.kind as keyof typeof BUILDINGS];
          if (
            tileX >= ent.x &&
            tileX < ent.x + spec.footprintW &&
            tileY >= ent.y &&
            tileY < ent.y + spec.footprintH
          ) {
            globalAudioMixer.playUiClick();
            sendMessage({
              type: "COMMAND_REPAIR_BUILDING",
              lobbyId,
              playerId,
              buildingEntityId: ent.id,
            });
            break;
          }
        }
      }
      return;
    }

    if (st.sellMode) {
      for (const ent of st.currEntities.values()) {
        if (ent.ownerId === st.playerId && ent.entityType === "BUILDING") {
          const spec = BUILDINGS[ent.kind as keyof typeof BUILDINGS];
          if (
            tileX >= ent.x &&
            tileX < ent.x + spec.footprintW &&
            tileY >= ent.y &&
            tileY < ent.y + spec.footprintH
          ) {
            globalAudioMixer.playUiClick();
            sendMessage({
              type: "COMMAND_SELL_BUILDING",
              lobbyId,
              playerId,
              buildingEntityId: ent.id,
            });
            break;
          }
        }
      }
      return;
    }

    if (st.forceAttackMode || e.ctrlKey) {
      const selectedUnits = Array.from(st.selectedEntityIds);
      if (selectedUnits.length > 0) {
        globalAudioMixer.playUiClick();
        sendMessage({
          type: "COMMAND_ATTACK_GROUND",
          lobbyId,
          playerId,
          entityIds: selectedUnits,
          targetTileX: tileX,
          targetTileY: tileY,
        });
        return;
      }
    }

    dragStartRef.current = { x: sx, y: sy };
    dragCurrRef.current = { x: sx, y: sy };
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    pointerCanvasRef.current = { x: sx, y: sy, inside: true };
    const { tileX, tileY } = cameraRef.current.screenToTile(sx, sy);
    hoverTileRef.current = { tileX, tileY };
    if (dragStartRef.current) {
      dragCurrRef.current = { x: sx, y: sy };
    }
    if ((e.buttons & 1) === 1) {
      const st = useRtsGameStore.getState();
      if (
        st.placementBuilding &&
        isRepeatableBuildingKind(st.placementBuilding.kind) &&
        (tileX !== lastDragPlacedTileRef.current.tileX ||
          tileY !== lastDragPlacedTileRef.current.tileY)
      ) {
        const bKind = st.placementBuilding.kind;
        const spec = BUILDINGS[bKind];
        const nowMs = performance.now();
        const myEcon = st.playersEconomy.get(st.playerId);
        const qSlot = myEcon?.queues.find((q) => q.category === st.placementBuilding?.category);
        const paidInQueue = qSlot?.activeItem === bKind;
        if (
          (paidInQueue || (myEcon?.credits ?? 0) >= spec.cost) &&
          canPlaceBuildingOnGrid(st, bKind, tileX, tileY, pendingPlacedTilesRef.current, nowMs)
        ) {
          globalAudioMixer.playUiClick();
          sendMessage({
            type: "COMMAND_PLACE_BUILDING",
            lobbyId,
            playerId,
            category: st.placementBuilding.category,
            buildingKind: bKind,
            tileX,
            tileY,
          });
          pendingPlacedTilesRef.current.set(`${tileX},${tileY}`, {
            tileX,
            tileY,
            kind: bKind,
            expiresAtMs: nowMs + 350,
          });
          lastDragPlacedTileRef.current = { tileX, tileY };
        }
      }
    }
  }

  function handleCanvasMouseLeave(): void {
    pointerCanvasRef.current.inside = false;
    lastDragPlacedTileRef.current = { tileX: -1, tileY: -1 };
  }

  function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (e.button === 0) {
      lastDragPlacedTileRef.current = { tileX: -1, tileY: -1 };
    }
    if (e.button !== 0 || !dragStartRef.current || !dragCurrRef.current) return;
    const start = dragStartRef.current;
    const end = dragCurrRef.current;
    dragStartRef.current = null;
    dragCurrRef.current = null;

    const st = useRtsGameStore.getState();
    const cam = cameraRef.current;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const picked = new Set<string>();
    const isClick = maxX - minX < 6 && maxY - minY < 6;

    for (const ent of st.currEntities.values()) {
      if (ent.ownerId !== st.playerId) continue;
      const screenX = (ent.x * TILE_PIXEL_SIZE - cam.x) * cam.zoom;
      const screenY = (ent.y * TILE_PIXEL_SIZE - cam.y) * cam.zoom;
      const sizePx = TILE_PIXEL_SIZE * cam.zoom;

      if (isClick) {
        const wPx =
          ent.entityType === "BUILDING"
            ? BUILDINGS[ent.kind as BuildingKind].footprintW * sizePx
            : sizePx;
        const hPx =
          ent.entityType === "BUILDING"
            ? BUILDINGS[ent.kind as BuildingKind].footprintH * sizePx
            : sizePx;
        if (
          start.x >= screenX &&
          start.x <= screenX + wPx &&
          start.y >= screenY &&
          start.y <= screenY + hPx
        ) {
          picked.add(ent.id);
          break;
        }
      } else if (ent.entityType === "UNIT") {
        if (
          screenX + sizePx * 0.5 >= minX &&
          screenX + sizePx * 0.5 <= maxX &&
          screenY + sizePx * 0.5 >= minY &&
          screenY + sizePx * 0.5 <= maxY
        ) {
          picked.add(ent.id);
        }
      }
    }

    setSelectedEntities(picked);
  }

  function handleLeave(): void {
    sendMessage({
      type: "LOBBY_LEAVE",
      lobbyId,
      playerId,
    });
    useRtsGameStore.setState({ currentLobbyId: null });
    router.push("/");
  }

  function handleCycleZoom(): void {
    globalAudioMixer.playUiClick();
    const next = cameraRef.current.cycleZoom();
    setZoomLevel(next);
  }

  function handleSelectZoom(targetZoom: number): void {
    globalAudioMixer.playUiClick();
    const next = cameraRef.current.setZoom(targetZoom);
    setZoomLevel(next);
  }

  function handleCenterOnBase(): void {
    globalAudioMixer.playUiClick();
    const st = useRtsGameStore.getState();
    for (const ent of st.currEntities.values()) {
      if (ent.ownerId === st.playerId && ent.kind === "CONSTRUCTION_YARD") {
        cameraRef.current.centerOnTile(ent.x + 1, ent.y + 1);
        return;
      }
    }
    for (const ent of st.currEntities.values()) {
      if (ent.ownerId === st.playerId) {
        cameraRef.current.centerOnTile(ent.x, ent.y);
        return;
      }
    }
    cameraRef.current.centerOnTile(8, 8);
  }

  function handleSelectAllCombatUnits(): void {
    globalAudioMixer.playUiClick();
    const st = useRtsGameStore.getState();
    const combatIds = new Set<string>();
    const allUnitIds = new Set<string>();
    for (const ent of st.currEntities.values()) {
      if (ent.ownerId === st.playerId && ent.entityType === "UNIT") {
        allUnitIds.add(ent.id);
        if (ent.kind !== "HARVESTER" && ent.kind !== "MCV") {
          combatIds.add(ent.id);
        }
      }
    }
    const targetSet = combatIds.size > 0 ? combatIds : allUnitIds;
    setSelectedEntities(targetSet);
    useRtsGameStore.setState({
      evaBannerText:
        targetSet.size > 0
          ? `EVA : ${targetSet.size} UNITÉ(S) SÉLECTIONNÉE(S) — TOUCHEZ LA CARTE POUR DÉPLACER OU ATTAQUER`
          : "EVA : AUCUNE UNITÉ DISPONIBLE SUR LE SECTEUR",
    });
  }

  function startHoldPanKey(key: string, nudgeX: number, nudgeY: number): void {
    cameraRef.current.pan(nudgeX, nudgeY);
    keysPressedRef.current.add(key);
  }

  function stopHoldPanKey(key: string): void {
    keysPressedRef.current.delete(key);
  }

  function handleCanvasTouchStart(e: React.TouchEvent<HTMLCanvasElement>): void {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();

    if (e.touches.length >= 2) {
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      const midX = (t0.clientX + t1.clientX) * 0.5 - rect.left;
      const midY = (t0.clientY + t1.clientY) * 0.5 - rect.top;
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      touchStateRef.current = {
        active: true,
        startX: midX,
        startY: midY,
        lastX: midX,
        lastY: midY,
        movedDistance: 999,
        isTwoFinger: true,
        pinchStartDist: Math.max(10, dist),
        pinchStartZoom: cameraRef.current.zoom,
      };
      dragStartRef.current = null;
      dragCurrRef.current = null;
      return;
    }

    const t0 = e.touches[0];
    if (!t0) return;
    const sx = t0.clientX - rect.left;
    const sy = t0.clientY - rect.top;

    touchStateRef.current = {
      active: true,
      startX: sx,
      startY: sy,
      lastX: sx,
      lastY: sy,
      movedDistance: 0,
      isTwoFinger: false,
      pinchStartDist: 0,
      pinchStartZoom: cameraRef.current.zoom,
    };

    hoverTileRef.current = cameraRef.current.screenToTile(sx, sy);

    if (touchMode === "SELECT" && !useRtsGameStore.getState().placementBuilding) {
      dragStartRef.current = { x: sx, y: sy };
      dragCurrRef.current = { x: sx, y: sy };
    }
  }

  function handleCanvasTouchMove(e: React.TouchEvent<HTMLCanvasElement>): void {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();

    if (e.touches.length >= 2) {
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      const midX = (t0.clientX + t1.clientX) * 0.5 - rect.left;
      const midY = (t0.clientY + t1.clientY) * 0.5 - rect.top;
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);

      if (!touchStateRef.current.isTwoFinger) {
        touchStateRef.current.isTwoFinger = true;
        touchStateRef.current.lastX = midX;
        touchStateRef.current.lastY = midY;
        touchStateRef.current.pinchStartDist = Math.max(10, dist);
        touchStateRef.current.pinchStartZoom = cameraRef.current.zoom;
        touchStateRef.current.movedDistance = 999;
        dragStartRef.current = null;
        dragCurrRef.current = null;
        return;
      }

      const dx = midX - touchStateRef.current.lastX;
      const dy = midY - touchStateRef.current.lastY;
      cameraRef.current.pan(-dx, -dy);

      if (touchStateRef.current.pinchStartDist > 10) {
        const ratio = dist / touchStateRef.current.pinchStartDist;
        const nextZoom = cameraRef.current.setZoom(touchStateRef.current.pinchStartZoom * ratio);
        setZoomLevel(nextZoom);
      }

      touchStateRef.current.lastX = midX;
      touchStateRef.current.lastY = midY;
      return;
    }

    const t0 = e.touches[0];
    if (!t0 || touchStateRef.current.isTwoFinger) return;

    const sx = t0.clientX - rect.left;
    const sy = t0.clientY - rect.top;
    const dx = sx - touchStateRef.current.lastX;
    const dy = sy - touchStateRef.current.lastY;
    touchStateRef.current.lastX = sx;
    touchStateRef.current.lastY = sy;
    touchStateRef.current.movedDistance += Math.hypot(dx, dy);

    hoverTileRef.current = cameraRef.current.screenToTile(sx, sy);
    const st = useRtsGameStore.getState();

    if (st.placementBuilding) {
      return;
    }

    if (touchMode === "SELECT") {
      if (!dragStartRef.current) {
        dragStartRef.current = {
          x: touchStateRef.current.startX,
          y: touchStateRef.current.startY,
        };
      }
      dragCurrRef.current = { x: sx, y: sy };
      return;
    }

    if (touchStateRef.current.movedDistance > 4) {
      cameraRef.current.pan(-dx, -dy);
    }
  }

  function handleCanvasTouchEnd(e: React.TouchEvent<HTMLCanvasElement>): void {
    e.preventDefault();
    const ts = touchStateRef.current;
    if (!ts.active) return;
    if (e.touches.length > 0) return;
    touchStateRef.current.active = false;

    if (ts.isTwoFinger) {
      dragStartRef.current = null;
      dragCurrRef.current = null;
      return;
    }

    const st = useRtsGameStore.getState();
    const cam = cameraRef.current;

    // 1. Box Selection completed in SELECT mode
    if (
      touchMode === "SELECT" &&
      dragStartRef.current &&
      dragCurrRef.current &&
      ts.movedDistance > TOUCH_TAP_MAX_DISTANCE_PX
    ) {
      const minX = Math.min(dragStartRef.current.x, dragCurrRef.current.x);
      const maxX = Math.max(dragStartRef.current.x, dragCurrRef.current.x);
      const minY = Math.min(dragStartRef.current.y, dragCurrRef.current.y);
      const maxY = Math.max(dragStartRef.current.y, dragCurrRef.current.y);
      dragStartRef.current = null;
      dragCurrRef.current = null;

      const picked = new Set<string>();
      for (const ent of st.currEntities.values()) {
        if (ent.ownerId !== st.playerId || ent.entityType !== "UNIT") continue;
        const screenX = (ent.x * TILE_PIXEL_SIZE - cam.x) * cam.zoom;
        const screenY = (ent.y * TILE_PIXEL_SIZE - cam.y) * cam.zoom;
        const sizePx = TILE_PIXEL_SIZE * cam.zoom;
        if (
          screenX + sizePx * 0.5 >= minX &&
          screenX + sizePx * 0.5 <= maxX &&
          screenY + sizePx * 0.5 >= minY &&
          screenY + sizePx * 0.5 <= maxY
        ) {
          picked.add(ent.id);
        }
      }
      globalAudioMixer.playUiClick();
      setSelectedEntities(picked);
      return;
    }

    dragStartRef.current = null;
    dragCurrRef.current = null;

    if (ts.movedDistance > TOUCH_TAP_MAX_DISTANCE_PX) {
      return;
    }

    // 2. Single-finger Tap (< 14px movement): Resolve tactical action
    const sx = ts.lastX;
    const sy = ts.lastY;
    const { tileX, tileY } = cam.screenToTile(sx, sy);
    const worldTileFloatX = (cam.x + sx / cam.zoom) / TILE_PIXEL_SIZE;
    const worldTileFloatY = (cam.y + sy / cam.zoom) / TILE_PIXEL_SIZE;

    let tappedOwnUnitId: string | null = null;
    let bestOwnUnitDist = 1.35;
    let tappedOwnBuildingId: string | null = null;
    let tappedEnemyEntityId: string | null = null;
    let bestEnemyDist = 1.35;

    for (const ent of st.currEntities.values()) {
      if (ent.entityType === "UNIT") {
        const cx = ent.x + 0.5;
        const cy = ent.y + 0.5;
        const dist = Math.hypot(worldTileFloatX - cx, worldTileFloatY - cy);
        if (ent.ownerId === st.playerId) {
          if (dist <= bestOwnUnitDist) {
            bestOwnUnitDist = dist;
            tappedOwnUnitId = ent.id;
          }
        } else if (dist <= bestEnemyDist) {
          bestEnemyDist = dist;
          tappedEnemyEntityId = ent.id;
        }
      } else if (ent.entityType === "BUILDING") {
        const spec = BUILDINGS[ent.kind as BuildingKind];
        const inFootprint =
          worldTileFloatX >= ent.x - 0.35 &&
          worldTileFloatX <= ent.x + spec.footprintW + 0.35 &&
          worldTileFloatY >= ent.y - 0.35 &&
          worldTileFloatY <= ent.y + spec.footprintH + 0.35;
        if (inFootprint) {
          if (ent.ownerId === st.playerId) {
            tappedOwnBuildingId = ent.id;
          } else if (!tappedEnemyEntityId) {
            tappedEnemyEntityId = ent.id;
          }
        }
      } else if (ent.entityType === "TREE") {
        const cx = ent.x + 0.5;
        const cy = ent.y + 0.5;
        const dist = Math.hypot(worldTileFloatX - cx, worldTileFloatY - cy);
        if (dist <= bestEnemyDist) {
          bestEnemyDist = dist;
          tappedEnemyEntityId = ent.id;
        }
      }
    }

    const action = resolveTouchTapAction({
      mode: touchMode,
      hasPlacementBuilding: Boolean(st.placementBuilding),
      sellMode: st.sellMode,
      repairMode: st.repairMode,
      forceAttackMode: st.forceAttackMode,
      tappedOwnUnitId,
      tappedOwnBuildingId,
      tappedEnemyEntityId,
      selectedUnitCount: st.selectedEntityIds.size,
    });

    if (action === "PLACE_BUILDING" && st.placementBuilding) {
      const bKind = st.placementBuilding.kind;
      const spec = BUILDINGS[bKind];
      const repeatable = isRepeatableBuildingKind(bKind);
      const nowMs = performance.now();
      let deployX = tileX;
      let deployY = tileY;
      let valid = canPlaceBuildingOnGrid(
        st,
        bKind,
        deployX,
        deployY,
        pendingPlacedTilesRef.current,
        nowMs
      );
      if (!valid) {
        const centeredX = tileX - Math.floor(spec.footprintW * 0.5);
        const centeredY = tileY - Math.floor(spec.footprintH * 0.5);
        if (
          canPlaceBuildingOnGrid(
            st,
            bKind,
            centeredX,
            centeredY,
            pendingPlacedTilesRef.current,
            nowMs
          )
        ) {
          deployX = centeredX;
          deployY = centeredY;
          valid = true;
        }
      }
      hoverTileRef.current = { tileX: deployX, tileY: deployY };
      if (!valid) {
        useRtsGameStore.setState({
          evaBannerText:
            "EVA : ZONE INVALIDE — TOUCHEZ UN EMPLACEMENT VERT PRÈS DE LA BASE",
        });
        return;
      }
      const myEcon = st.playersEconomy.get(st.playerId);
      const qSlot = myEcon?.queues.find((q) => q.category === st.placementBuilding?.category);
      const paidInQueue = qSlot?.activeItem === bKind;
      if (!paidInQueue && (myEcon?.credits ?? 0) < spec.cost) {
        useRtsGameStore.setState({
          evaBannerText:
            "EVA : CRÉDITS INSUFFISANTS POUR POSER CE PATRON",
        });
        return;
      }
      globalAudioMixer.playUiClick();
      sendMessage({
        type: "COMMAND_PLACE_BUILDING",
        lobbyId,
        playerId,
        category: st.placementBuilding.category,
        buildingKind: bKind,
        tileX: deployX,
        tileY: deployY,
      });
      pendingPlacedTilesRef.current.set(`${deployX},${deployY}`, {
        tileX: deployX,
        tileY: deployY,
        kind: bKind,
        expiresAtMs: nowMs + 350,
      });
      if (!repeatable) {
        setPlacementBuilding(null);
      }
      return;
    }

    if (action === "REPAIR_BUILDING" && tappedOwnBuildingId) {
      globalAudioMixer.playUiClick();
      sendMessage({
        type: "COMMAND_REPAIR_BUILDING",
        lobbyId,
        playerId,
        buildingEntityId: tappedOwnBuildingId,
      });
      return;
    }

    if (action === "SELL_BUILDING" && tappedOwnBuildingId) {
      globalAudioMixer.playUiClick();
      sendMessage({
        type: "COMMAND_SELL_BUILDING",
        lobbyId,
        playerId,
        buildingEntityId: tappedOwnBuildingId,
      });
      return;
    }

    if (action === "ATTACK_GROUND") {
      const selectedUnits = Array.from(st.selectedEntityIds);
      if (selectedUnits.length > 0) {
        globalAudioMixer.playUiClick();
        sendMessage({
          type: "COMMAND_ATTACK_GROUND",
          lobbyId,
          playerId,
          entityIds: selectedUnits,
          targetTileX: tileX,
          targetTileY: tileY,
        });
      }
      return;
    }

    if (action === "SELECT_ENTITY") {
      const targetId = tappedOwnUnitId ?? tappedOwnBuildingId;
      if (targetId) {
        globalAudioMixer.playUiClick();
        setSelectedEntities(new Set([targetId]));
      }
      return;
    }

    if (action === "ATTACK_ENEMY" && tappedEnemyEntityId) {
      const selectedUnits = Array.from(st.selectedEntityIds);
      if (selectedUnits.length > 0) {
        globalAudioMixer.playUiClick();
        sendMessage({
          type: "COMMAND_ATTACK",
          lobbyId,
          playerId,
          entityIds: selectedUnits,
          targetEntityId: tappedEnemyEntityId,
        });
      }
      return;
    }

    if (action === "MOVE_UNITS") {
      const selectedUnits = Array.from(st.selectedEntityIds);
      if (selectedUnits.length > 0) {
        globalAudioMixer.playUiClick();
        sendMessage({
          type: "COMMAND_MOVE",
          lobbyId,
          playerId,
          entityIds: selectedUnits,
          targetTileX: tileX,
          targetTileY: tileY,
        });
      }
      return;
    }

    if (action === "CLEAR_SELECTION") {
      setSelectedEntities(new Set());
    }
  }

  // Screen 1: Asynchronous Batched OffscreenCanvas Sprite Atlas Rasterization Progress
  if (!atlas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian p-6 font-mono text-slate-100">
        <Card className="w-full max-w-lg p-6 space-y-4">
          <div className="flex items-center gap-3 text-amber-400">
            <Layers className="h-5 w-5" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Génération Procédurale OffscreenCanvas &rarr; ImageBitmap
            </h2>
          </div>
          <p className="text-xs text-slate-400">{atlasStage}</p>
          <DiscretizedProgressBar ratio={atlasProgress / 100} tone="amber" />
          <div className="flex justify-between text-xs text-slate-400">
            <span>Rastérisation Vectorielle / Bitmap 16-Angles</span>
            <span className="font-bold text-amber-300">{atlasProgress}%</span>
          </div>
        </Card>
      </div>
    );
  }

  // Screen 2: Lobby Waiting Room / Single Active Match Mutex FIFO Queue
  if (lobby && (lobby.status === "WAITING" || lobby.status === "QUEUED")) {
    return (
      <div className="min-h-dvh bg-obsidian p-3 sm:p-6 font-mono text-slate-100">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <Card className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-amber-400">{lobby.name}</h1>
                  <Badge
                    className={
                      lobby.status === "QUEUED"
                        ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                        : "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                    }
                  >
                    {lobby.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Identifiant Salon : {lobby.lobbyId} • Atlas GPU ImageBitmap chargé (100%)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleLeave}>
                  Retour Portail
                </Button>
                <Button
                  variant="tactical"
                  onClick={() =>
                    sendMessage({
                      type: "LOBBY_START_MATCH",
                      lobbyId: lobby.lobbyId,
                      playerId,
                    })
                  }
                >
                  <Play className="h-4 w-4" />
                  {overview.activeStatus === "FREE"
                    ? "Lancer la Partie (Verrou Libre)"
                    : "Rejoindre la File d'Attente Serveur"}
                </Button>
              </div>
            </div>

            {/* Mutex Queue Banner when QUEUED */}
            {lobby.status === "QUEUED" && (
              <div className="flex items-center justify-between rounded border border-amber-500/50 bg-amber-950/50 p-4 text-xs text-amber-200">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-amber-400" />
                  <div>
                    <div className="font-bold uppercase">
                      Verrou de Salon Unique Actif — En File d&apos;Attente FIFO
                    </div>
                    <div className="text-slate-300">
                      Une partie est actuellement en cours ({overview.activeLobbyName}). Votre salon démarrera automatiquement dès la libération du verrou.
                    </div>
                  </div>
                </div>
                <Badge className="border-amber-400 bg-amber-500/30 text-sm font-bold text-amber-200">
                  <Clock className="h-4 w-4" />
                  POSITION #{lobby.queuePosition ?? 1}
                </Badge>
              </div>
            )}

            {/* Players Table & Faction Switcher */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-slate-400">
                Commandants Présents ({lobby.players.length}/{lobby.maxPlayers})
              </h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {lobby.players.map((p) => (
                  <div
                    key={p.playerId}
                    className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/70 p-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FactionVectorEmblem faction={p.faction} className="h-5 w-5 shrink-0" />
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span className="font-bold">{p.commanderName}</span>
                      {p.isAi && (
                        <Badge className="border-slate-700 bg-slate-800 text-slate-300">
                          IA
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {(["GDI", "NOD", "ORDOS"] as FactionId[]).map((fid) => (
                        <button
                          key={fid}
                          type="button"
                          disabled={p.playerId !== playerId}
                          onClick={() =>
                            sendMessage({
                              type: "LOBBY_SET_FACTION",
                              lobbyId: lobby.lobbyId,
                              playerId,
                              faction: fid,
                            })
                          }
                          className={
                            p.faction === fid
                              ? `rounded border px-2 py-0.5 text-[10px] font-bold ${FACTIONS[fid].badgeClass}`
                              : "rounded border border-slate-800 px-2 py-0.5 text-[10px] text-slate-500"
                          }
                        >
                          {fid}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lobby Chat */}
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <div className="h-40 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-3 space-y-1.5 text-xs">
                {lobby.chat.map((c) => (
                  <div key={c.id}>
                    <span className="font-bold text-amber-400">[{c.commanderName}]</span>{" "}
                    <span className="text-slate-300">{c.message}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Transmettre un message tactique..."
                  className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!chatInput.trim()) return;
                    sendMessage({
                      type: "LOBBY_CHAT",
                      lobbyId: lobby.lobbyId,
                      playerId,
                      commanderName,
                      message: chatInput.trim(),
                    });
                    setChatInput("");
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Envoyer
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Screen 3: Active Tactical RTS Battlefield (1 World Canvas + Classic C&C Sidebar HUD with 1 Radar Canvas)
  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden bg-obsidian font-mono text-slate-100 select-none">
      {/* Mobile Portrait Orientation Advisory Banner (automatically hidden in Landscape & Desktop) */}
      <div className="flex sm:hidden portrait:flex landscape:hidden shrink-0 items-center justify-between border-b border-amber-500/40 bg-amber-950/90 px-3 py-1 text-[10px] text-amber-200">
        <div className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5 rotate-90 text-amber-400 shrink-0" />
          <span>Mode Paysage (Landscape) recommandé pour le commandement tactique mobile</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Tactical Viewport */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Top EVA Tactical Status Strip (Compact in Mobile Landscape) */}
          <div className="flex h-8 lg:h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-2 lg:px-4 text-[11px] lg:text-xs">
            <div className="flex min-w-0 items-center gap-1.5 text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0 text-amber-400" />
              <span className="truncate font-bold tracking-wider">{evaBannerText}</span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden xl:inline text-[11px] text-slate-400">
                Gauche/Tap : Sélection/Poser • Droite/Tap : Ordre • Glisser/WASD : Caméra
              </span>
              <Button
                variant="tactical"
                size="sm"
                onClick={handleCycleZoom}
                className="px-2 py-0.5 text-[10px] lg:text-xs"
              >
                <ZoomIn className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                {zoomLevel}x
              </Button>
              <div className="hidden sm:flex items-center gap-0.5 rounded border border-slate-800 bg-slate-900 p-0.5">
                {ZOOM_LEVELS.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => handleSelectZoom(z)}
                    className={
                      Math.abs(zoomLevel - z) < 0.01
                        ? "rounded border border-amber-400/60 bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                        : "rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }
                  >
                    {z}
                  </button>
                ))}
              </div>
              <Button
                variant={sidebarOpen ? "default" : "tactical"}
                size="sm"
                onClick={() => {
                  globalAudioMixer.playUiClick();
                  setSidebarOpen(!sidebarOpen);
                }}
                className="px-2 py-0.5 text-[10px] lg:text-xs"
              >
                {sidebarOpen ? (
                  <PanelRightClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelRightOpen className="h-3.5 w-3.5" />
                )}
                <span>{sidebarOpen ? "Carte 100%" : "Menu C&C"}</span>
              </Button>
            </div>
          </div>

          {/* Single World Canvas Element + Floating Mobile Landscape Controls */}
          <div className="relative flex-1 overflow-hidden">
            <canvas
              ref={worldCanvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onTouchStart={handleCanvasTouchStart}
              onTouchMove={handleCanvasTouchMove}
              onTouchEnd={handleCanvasTouchEnd}
              onTouchCancel={handleCanvasTouchEnd}
              onContextMenu={(e) => e.preventDefault()}
              className="h-full w-full cursor-crosshair block touch-none"
            />

            {/* Bottom-Left Tactical Camera D-Pad & Base Centering (Mobile & Desktop) */}
            <div className="absolute bottom-2 left-2 z-10 flex items-end gap-1.5 rounded border border-slate-800/90 bg-slate-950/85 p-1 backdrop-blur-sm">
              <div className="grid grid-cols-3 gap-0.5">
                <div />
                <button
                  type="button"
                  aria-label="Caméra Haut"
                  onPointerDown={() => startHoldPanKey("arrowup", 0, -64)}
                  onPointerUp={() => stopHoldPanKey("arrowup")}
                  onPointerLeave={() => stopHoldPanKey("arrowup")}
                  onPointerCancel={() => stopHoldPanKey("arrowup")}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-200 active:border-amber-400 active:bg-amber-500/20 active:text-amber-300"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <div />
                <button
                  type="button"
                  aria-label="Caméra Gauche"
                  onPointerDown={() => startHoldPanKey("arrowleft", -64, 0)}
                  onPointerUp={() => stopHoldPanKey("arrowleft")}
                  onPointerLeave={() => stopHoldPanKey("arrowleft")}
                  onPointerCancel={() => stopHoldPanKey("arrowleft")}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-200 active:border-amber-400 active:bg-amber-500/20 active:text-amber-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Centrer Base"
                  onClick={handleCenterOnBase}
                  className="flex h-7 w-7 items-center justify-center rounded border border-amber-500/50 bg-amber-500/20 text-amber-300 active:bg-amber-500/40"
                  title="Centrer sur la Base"
                >
                  <Home className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Caméra Droite"
                  onPointerDown={() => startHoldPanKey("arrowright", 64, 0)}
                  onPointerUp={() => stopHoldPanKey("arrowright")}
                  onPointerLeave={() => stopHoldPanKey("arrowright")}
                  onPointerCancel={() => stopHoldPanKey("arrowright")}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-200 active:border-amber-400 active:bg-amber-500/20 active:text-amber-300"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <div />
                <button
                  type="button"
                  aria-label="Caméra Bas"
                  onPointerDown={() => startHoldPanKey("arrowdown", 0, 64)}
                  onPointerUp={() => stopHoldPanKey("arrowdown")}
                  onPointerLeave={() => stopHoldPanKey("arrowdown")}
                  onPointerCancel={() => stopHoldPanKey("arrowdown")}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-200 active:border-amber-400 active:bg-amber-500/20 active:text-amber-300"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <div />
              </div>
            </div>

            {/* Bottom-Right Mobile Touch Command & Unit Selection Bar */}
            <div className="absolute bottom-2 right-2 z-10 flex flex-wrap items-center gap-1 rounded border border-slate-800/90 bg-slate-950/90 p-1 backdrop-blur-sm">
              {(
                [
                  { id: "AUTO", label: "Auto", icon: MousePointerClick },
                  { id: "PAN", label: "Carte", icon: Hand },
                  { id: "SELECT", label: "Cadre", icon: SquareDashedMousePointer },
                  { id: "COMMAND", label: "Ordre", icon: Crosshair },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const active = touchMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      globalAudioMixer.playUiClick();
                      setTouchMode(m.id);
                    }}
                    className={
                      active
                        ? "flex items-center gap-1 rounded border border-amber-400/70 bg-amber-500/25 px-2 py-1 text-[10px] font-bold text-amber-300"
                        : "flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                    }
                  >
                    <Icon className="h-3 w-3" />
                    <span>{m.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleSelectAllCombatUnits}
                className="flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-300 active:bg-emerald-500/35"
                title="Sélectionner toutes les unités de combat"
              >
                <Swords className="h-3 w-3" />
                <span>Armée</span>
                {selectedUnitCount > 0 && (
                  <span className="rounded bg-emerald-400/30 px-1 text-[9px] text-emerald-100">
                    {selectedUnitCount}
                  </span>
                )}
              </button>

              {selectedUnitCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    globalAudioMixer.playUiClick();
                    setSelectedEntities(new Set());
                  }}
                  className="flex items-center gap-0.5 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 hover:text-red-300"
                  title="Désélectionner"
                >
                  <X className="h-3 w-3" />
                </button>
              )}

              {hasPlacementBuilding && (
                <button
                  type="button"
                  onClick={() => {
                    globalAudioMixer.playUiClick();
                    setPlacementBuilding(null);
                  }}
                  className="flex items-center gap-1 rounded border border-red-500/60 bg-red-500/20 px-2 py-1 text-[10px] font-bold text-red-300"
                >
                  <X className="h-3 w-3" />
                  <span>Annuler Pose</span>
                </button>
              )}
            </div>

            {/* Victory / Defeat End-of-Match Overlay */}
            {winnerPlayerId && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4 sm:p-6">
                <Card className="max-w-md p-5 sm:p-6 text-center space-y-4">
                  <Trophy className="mx-auto h-10 w-10 text-amber-400" />
                  <h2 className="text-xl font-bold uppercase tracking-widest text-amber-400">
                    {winnerPlayerId === playerId ? "VICTOIRE TOTALE !" : "FIN DE L'OPÉRATION"}
                  </h2>
                  <p className="text-xs text-slate-300">
                    Le verrou de salon unique a été libéré proprement et les statistiques du commandant ont été enregistrées.
                  </p>
                  <Button variant="tactical" onClick={handleLeave} className="w-full">
                    Retourner au Portail des Salons
                  </Button>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Classic Westwood C&C Right Sidebar HUD (Collapsible in Mobile Landscape) */}
        {sidebarOpen && (
          <ClassicSidebarHud
            minimapCanvasRef={minimapCanvasRef}
            onMinimapClickTile={(tx, ty) => cameraRef.current.centerOnTile(tx, ty)}
            onLeaveMatch={handleLeave}
            zoomLevel={zoomLevel}
            onCycleZoom={handleCycleZoom}
            onSelectZoom={handleSelectZoom}
            onCloseMobile={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
