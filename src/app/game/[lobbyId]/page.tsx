"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  Layers,
  Lock,
  Play,
  Send,
  ShieldCheck,
  Trophy,
  ZoomIn,
} from "lucide-react";
import {
  BASE_BUILD_RADIUS_TILES,
  BUILDINGS,
  computeEdgeScrollVelocity,
  FACTIONS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  SIM_TICK_MS,
  TILE_PIXEL_SIZE,
  ZOOM_LEVELS,
  type BuildingKind,
  type FactionId,
} from "../../../shared/constants";
import { globalAudioMixer } from "../../../audio/mixer";
import { ClassicSidebarHud } from "../../../components/hud/classic-sidebar-hud";
import { Badge, Button, Card, DiscretizedProgressBar } from "../../../components/ui/primitives";
import { TacticalCamera } from "../../../renderer/camera";
import {
  generateProceduralSpriteAtlasAsync,
  type ProceduralSpriteAtlas,
} from "../../../renderer/generator/atlas-generator";
import { renderMinimapRadar } from "../../../renderer/minimap-renderer";
import { renderTacticalWorld } from "../../../renderer/world-renderer";
import { useRtsGameStore, type RtsGameStoreState } from "../../../store/game-store";

function canPlaceBuildingOnGrid(
  st: RtsGameStoreState,
  buildingKind: BuildingKind,
  tileX: number,
  tileY: number
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

  for (let dy = 0; dy < spec.footprintH; dy++) {
    for (let dx = 0; dx < spec.footprintW; dx++) {
      const idx = (tileY + dy) * MAP_WIDTH_TILES + (tileX + dx);
      if (st.terrainGrid[idx] === 2) {
        return false;
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
      if (ent.ownerId === st.playerId) {
        const bx = ent.x + bSpec.footprintW * 0.5;
        const by = ent.y + bSpec.footprintH * 0.5;
        if (Math.hypot(cx - bx, cy - by) <= BASE_BUILD_RADIUS_TILES) {
          withinBaseRadius = true;
        }
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

  return withinBaseRadius;
}

export default function GameMatchPage() {
  const params = useParams<{ lobbyId: string }>();
  const router = useRouter();
  const lobbyId = decodeURIComponent(params.lobbyId);

  const {
    playerId,
    commanderName,
    faction,
    overview,
    evaBannerText,
    winnerPlayerId,
    connectWebSocket,
    sendMessage,
    setSelectedEntities,
    setPlacementBuilding,
  } = useRtsGameStore();

  const [atlas, setAtlas] = useState<ProceduralSpriteAtlas | null>(null);
  const [atlasProgress, setAtlasProgress] = useState(0);
  const [atlasStage, setAtlasStage] = useState("Initialisation OffscreenCanvas...");
  const [chatInput, setChatInput] = useState("");
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const worldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<TacticalCamera>(new TacticalCamera());
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragCurrRef = useRef<{ x: number; y: number } | null>(null);
  const hoverTileRef = useRef<{ tileX: number; tileY: number }>({ tileX: 6, tileY: 6 });
  const pointerCanvasRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: -1,
    y: -1,
    inside: false,
  });
  const keysPressedRef = useRef<Set<string>>(new Set());

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

  // 4. 60+ FPS Tactical World & Radar Minimap Render Loop with Tick Interpolation
  useEffect(() => {
    if (!atlas) return;
    let animId = 0;

    const renderFrame = () => {
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

      const canvas = worldCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
          canvas.width = Math.max(320, Math.floor(rect.width));
          canvas.height = Math.max(240, Math.floor(rect.height));
          cam.setViewport(canvas.width, canvas.height);
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const elapsedSinceTick = performance.now() - st.lastTickReceivedAt;
          const alpha = Math.max(0, Math.min(1, elapsedSinceTick / SIM_TICK_MS));
          const explored = st.exploredByPlayer.get(st.playerId) ?? new Set<number>();
          const visible = st.visibleByPlayer.get(st.playerId) ?? new Set<number>();

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
            const valid = canPlaceBuildingOnGrid(st, bKind, tx, ty);
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
            interpolationAlpha: alpha,
            selectedIds: st.selectedEntityIds,
            exploredCells: explored,
            visibleCells: visible,
            projectiles: st.recentProjectiles,
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
        const mCtx = miniCanvas.getContext("2d");
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
            exploredCells: st.exploredByPlayer.get(st.playerId) ?? new Set<number>(),
            visibleCells: st.visibleByPlayer.get(st.playerId) ?? new Set<number>(),
            camera: cam,
          });
        }
      }

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [atlas]);

  const lobby = overview.lobbies.find((l) => l.lobbyId === lobbyId);

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const st = useRtsGameStore.getState();
    const { tileX, tileY } = cameraRef.current.screenToTile(sx, sy);

    if (e.button === 2) {
      // Right-click: Issue Move or Attack command for selected units
      e.preventDefault();
      if (st.placementBuilding) {
        setPlacementBuilding(null);
        return;
      }
      const selectedUnits = Array.from(st.selectedEntityIds);
      if (selectedUnits.length === 0) return;

      // Check if clicking an enemy entity
      let targetEnemyId: string | null = null;
      for (const ent of st.currEntities.values()) {
        if (ent.ownerId === st.playerId) continue;
        const w = ent.entityType === "BUILDING" ? BUILDINGS[ent.kind as keyof typeof BUILDINGS].footprintW : 1;
        const h = ent.entityType === "BUILDING" ? BUILDINGS[ent.kind as keyof typeof BUILDINGS].footprintH : 1;
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

    // Left-click: Place building, Sell structure, or start selection box
    if (st.placementBuilding) {
      const valid = canPlaceBuildingOnGrid(
        st,
        st.placementBuilding.kind,
        tileX,
        tileY
      );
      if (!valid) {
        useRtsGameStore.setState({
          evaBannerText:
            "EVA : ZONE DE DÉPLOIEMENT INVALIDE — CLIQUEZ SUR UN EMPLACEMENT VERT PRÈS DE LA BASE",
        });
        return;
      }
      globalAudioMixer.playUiClick();
      sendMessage({
        type: "COMMAND_PLACE_BUILDING",
        lobbyId,
        playerId,
        category: st.placementBuilding.category,
        buildingKind: st.placementBuilding.kind,
        tileX,
        tileY,
      });
      setPlacementBuilding(null);
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

    dragStartRef.current = { x: sx, y: sy };
    dragCurrRef.current = { x: sx, y: sy };
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    pointerCanvasRef.current = { x: sx, y: sy, inside: true };
    hoverTileRef.current = cameraRef.current.screenToTile(sx, sy);
    if (dragStartRef.current) {
      dragCurrRef.current = { x: sx, y: sy };
    }
  }

  function handleCanvasMouseLeave(): void {
    pointerCanvasRef.current.inside = false;
  }

  function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>): void {
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
        if (
          start.x >= screenX &&
          start.x <= screenX + sizePx &&
          start.y >= screenY &&
          start.y <= screenY + sizePx
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
      <div className="min-h-screen bg-obsidian p-6 font-mono text-slate-100">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card className="p-6 space-y-5">
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
    <div className="flex h-screen w-screen overflow-hidden bg-obsidian font-mono text-slate-100">
      {/* Main Tactical Viewport */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Top EVA Tactical Status Strip */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 text-xs">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="font-bold tracking-wider">{evaBannerText}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden xl:inline text-[11px] text-slate-400">
              Clic Gauche : Sélection/Poser • Clic Droit : Ordre/Annuler • WASD : Caméra
            </span>
            <Button
              variant="tactical"
              size="sm"
              onClick={handleCycleZoom}
            >
              <ZoomIn className="h-3.5 w-3.5" />
              Zoom {zoomLevel}x
            </Button>
            <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 p-0.5">
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
          </div>
        </div>

        {/* Single World Canvas Element */}
        <div className="relative flex-1 overflow-hidden">
          <canvas
            ref={worldCanvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
            onContextMenu={(e) => e.preventDefault()}
            className="h-full w-full cursor-crosshair block"
          />

          {/* Victory / Defeat End-of-Match Overlay */}
          {winnerPlayerId && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-6">
              <Card className="max-w-md p-6 text-center space-y-4">
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

      {/* Classic Westwood C&C Right Sidebar HUD */}
      <ClassicSidebarHud
        minimapCanvasRef={minimapCanvasRef}
        onMinimapClickTile={(tx, ty) => cameraRef.current.centerOnTile(tx, ty)}
        onLeaveMatch={handleLeave}
        zoomLevel={zoomLevel}
        onCycleZoom={handleCycleZoom}
        onSelectZoom={handleSelectZoom}
      />
    </div>
  );
}
