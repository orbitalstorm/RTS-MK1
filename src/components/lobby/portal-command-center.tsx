"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Dices,
  FolderKanban,
  Hash,
  Map as MapIcon,
  Play,
  Radio,
  RefreshCw,
  Shield,
  Swords,
} from "lucide-react";
import {
  APP_VERSION,
  FACTIONS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  type FactionId,
} from "../../shared/constants";
import { generateRandomMapSeed, normalizeMapSeed } from "../../shared/map-generator";
import type { CustomMapSummary } from "../../shared/schemas/custom-map";
import type { ClientMessage } from "../../shared/schemas/commands";
import {
  setActiveVectorVariantConfig,
  type VectorVariantsState,
} from "../../shared/schemas/vector-variants";
import { useRtsGameStore } from "../../store/game-store";
import { FactionVectorEmblem } from "../hud/leonardo-icons";
import { Badge, Button, Card } from "../ui/primitives";

function resolveProceduralSeed(rawInput: string): number | undefined {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return undefined;
  }
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && asNum > 0) {
    return normalizeMapSeed(Math.floor(asNum));
  }
  return normalizeMapSeed(trimmed);
}

export function PortalCommandCenter() {
  const router = useRouter();
  const playerId = useRtsGameStore((s) => s.playerId);
  const commanderName = useRtsGameStore((s) => s.commanderName);
  const faction = useRtsGameStore((s) => s.faction);
  const wsConnected = useRtsGameStore((s) => s.wsConnected);
  const currentLobbyId = useRtsGameStore((s) => s.currentLobbyId);
  const lastError = useRtsGameStore((s) => s.lastError);
  const setCommanderIdentity = useRtsGameStore((s) => s.setCommanderIdentity);
  const connectWebSocket = useRtsGameStore((s) => s.connectWebSocket);
  const sendMessage = useRtsGameStore((s) => s.sendMessage);

  const [nameInput, setNameInput] = useState(commanderName);
  const [selectedFaction, setSelectedFaction] = useState<FactionId>(faction);
  const [seedInput, setSeedInput] = useState<string>("20260731");
  const [selectedMapId, setSelectedMapId] = useState<string>("");
  const [savedMaps, setSavedMaps] = useState<CustomMapSummary[]>([]);
  const [mapsLoading, setMapsLoading] = useState<boolean>(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const pendingLaunchRef = useRef(false);

  const fetchSavedMaps = useCallback(async () => {
    if (typeof fetch !== "function") return;
    setMapsLoading(true);
    try {
      const res = await fetch("/api/maps", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { ok?: boolean; maps?: CustomMapSummary[] };
      if (Array.isArray(data.maps)) {
        setSavedMaps(data.maps);
      }
    } catch {
      // Keep existing list on transient network or test-env error
    } finally {
      setMapsLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("rts_mk1_player_id")
        : null;
    const savedName =
      typeof window !== "undefined"
        ? window.localStorage.getItem("rts_mk1_commander_name")
        : null;
    const savedFaction =
      typeof window !== "undefined"
        ? (window.localStorage.getItem("rts_mk1_faction") as FactionId | null)
        : null;
    const savedSeed =
      typeof window !== "undefined"
        ? window.localStorage.getItem("rts_mk1_map_seed")
        : null;
    const savedCustomMap =
      typeof window !== "undefined"
        ? window.localStorage.getItem("rts_mk1_custom_map_id")
        : null;

    const pid = savedId || `cmd_${Math.random().toString(36).slice(2, 9)}`;
    const cname = savedName || "Commandant Solomon";
    const fac: FactionId =
      savedFaction === "GDI" || savedFaction === "NOD" || savedFaction === "ORDOS"
        ? savedFaction
        : "GDI";

    if (typeof window !== "undefined") {
      window.localStorage.setItem("rts_mk1_player_id", pid);
    }
    if (savedSeed) {
      setSeedInput(savedSeed);
    }
    if (savedCustomMap) {
      setSelectedMapId(savedCustomMap);
    }
    setNameInput(cname);
    setSelectedFaction(fac);
    setCommanderIdentity(pid, cname, fac);
    connectWebSocket();
    void fetchSavedMaps();
    if (typeof fetch === "function") {
      void fetch("/api/vector-variants", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { state?: VectorVariantsState } | null) => {
          if (data?.state) {
            setActiveVectorVariantConfig(data.state);
          }
        })
        .catch(() => {
          // Keep default vector variants on error
        });
    }
  }, [connectWebSocket, fetchSavedMaps, setCommanderIdentity]);

  useEffect(() => {
    if (currentLobbyId) {
      router.push(`/game/${encodeURIComponent(currentLobbyId)}`);
    }
  }, [currentLobbyId, router]);

  const selectedServerMap = useMemo(
    () => savedMaps.find((m) => m.id === selectedMapId) ?? null,
    [savedMaps, selectedMapId]
  );

  const effectiveProceduralSeed = useMemo(
    () => resolveProceduralSeed(seedInput),
    [seedInput]
  );

  const buildCreateLobbyCommand = useCallback(
    (cleanName: string): ClientMessage => {
      if (selectedMapId) {
        return {
          type: "LOBBY_CREATE",
          playerId,
          commanderName: cleanName,
          faction: selectedFaction,
          lobbyName: selectedServerMap
            ? `${selectedServerMap.name} (${selectedFaction})`
            : `Carte Serveur (${selectedFaction})`,
          withAiBot: true,
          autoStart: true,
          customMapId: selectedMapId,
          ...(selectedServerMap ? { mapSeed: selectedServerMap.seed } : {}),
        };
      }
      return {
        type: "LOBBY_CREATE",
        playerId,
        commanderName: cleanName,
        faction: selectedFaction,
        lobbyName: `Escarmouche Tactique (${selectedFaction})`,
        withAiBot: true,
        autoStart: true,
        ...(effectiveProceduralSeed !== undefined
          ? { mapSeed: effectiveProceduralSeed }
          : {}),
      };
    },
    [
      effectiveProceduralSeed,
      playerId,
      selectedFaction,
      selectedMapId,
      selectedServerMap,
    ]
  );

  useEffect(() => {
    if (wsConnected && pendingLaunchRef.current) {
      pendingLaunchRef.current = false;
      const cleanName = nameInput.trim() || "Commandant";
      sendMessage(buildCreateLobbyCommand(cleanName));
    }
  }, [wsConnected, nameInput, buildCreateLobbyCommand, sendMessage]);

  function handleSelectClan(fid: FactionId): void {
    setSelectedFaction(fid);
    const cleanName = nameInput.trim() || "Commandant";
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rts_mk1_faction", fid);
    }
    setCommanderIdentity(playerId, cleanName, fid);
  }

  function handleSeedChange(nextSeed: string): void {
    setSeedInput(nextSeed);
    setSelectedMapId("");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rts_mk1_map_seed", nextSeed);
      window.localStorage.removeItem("rts_mk1_custom_map_id");
    }
  }

  function handleRandomizeSeed(): void {
    const next = String(generateRandomMapSeed());
    handleSeedChange(next);
  }

  function handleSelectServerMap(mapId: string): void {
    setSelectedMapId(mapId);
    if (typeof window !== "undefined") {
      if (mapId) {
        window.localStorage.setItem("rts_mk1_custom_map_id", mapId);
      } else {
        window.localStorage.removeItem("rts_mk1_custom_map_id");
      }
    }
  }

  function handleLaunchMatch(): void {
    const cleanName = nameInput.trim() || "Commandant";
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rts_mk1_commander_name", cleanName);
      window.localStorage.setItem("rts_mk1_faction", selectedFaction);
    }
    setCommanderIdentity(playerId, cleanName, selectedFaction);
    setIsLaunching(true);

    if (!wsConnected) {
      pendingLaunchRef.current = true;
      connectWebSocket();
      return;
    }

    sendMessage(buildCreateLobbyCommand(cleanName));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-obsidian text-slate-100 font-sans">
      {/* Minimal Tactical Header */}
      <header className="border-b border-slate-800 bg-tactical px-4 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded border border-amber-500/50 bg-amber-500/10 text-amber-400">
              <Swords className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base sm:text-lg font-bold tracking-widest text-amber-400">
                RTS-MK1
              </h1>
              <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                v{APP_VERSION}
              </Badge>
            </div>
          </div>

          <Badge
            className={
              wsConnected
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-amber-500/50 bg-amber-500/15 text-amber-300"
            }
          >
            <Radio className="h-3.5 w-3.5" />
            {wsConnected ? "Serveur prêt" : "Connexion..."}
          </Badge>
        </div>
      </header>

      {/* Centered Quick-Launch Clan & Map Selection Screen */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center p-4 sm:p-6">
        <Card className="p-5 sm:p-8 space-y-6 border-slate-800 bg-slate-950/90">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-1 text-xs font-bold tracking-wide text-amber-300">
              <Shield className="h-4 w-4" />
              <span>Déploiement tactique immédiat</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-bold tracking-wide text-slate-100">
              Sélectionnez votre clan
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Choisissez votre faction d&apos;allégeance, configurez le numéro de seed ou sélectionnez une carte enregistrée du serveur.
            </p>
          </div>

          {lastError && (
            <div className="rounded border border-red-500/50 bg-red-950/50 px-3 py-2 text-center text-xs sm:text-sm text-red-200">
              {lastError}
            </div>
          )}

          {/* 3-Column Clan Selection Grid */}
          <div
            data-testid="clan-selection-grid"
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            {(Object.keys(FACTIONS) as FactionId[]).map((fid) => {
              const spec = FACTIONS[fid];
              const active = selectedFaction === fid;
              const bonusLabel =
                fid === "GDI"
                  ? "Blindage lourd (+10%)"
                  : fid === "NOD"
                    ? "Vitesse d'assaut (+15%)"
                    : "Récolte (+15%) & Vitesse (+8%)";

              return (
                <button
                  key={fid}
                  type="button"
                  data-testid={`clan-card-${fid}`}
                  onClick={() => handleSelectClan(fid)}
                  className={
                    active
                      ? `group relative flex flex-col items-center rounded-md border-2 p-6 text-center transition shadow-lg ${spec.badgeClass}`
                      : "group relative flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
                  }
                >
                  <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-md border border-slate-800 bg-slate-950 p-2 shadow-inner">
                    <FactionVectorEmblem
                      faction={fid}
                      className="h-16 w-16 transition-transform duration-150 group-hover:scale-110"
                    />
                  </div>

                  <div className="text-base sm:text-lg font-bold tracking-wide text-slate-100">
                    {spec.name}
                  </div>

                  <p className="mt-1.5 text-xs sm:text-sm text-slate-200 opacity-95">
                    {spec.motto}
                  </p>

                  <div className="mt-4 w-full border-t border-slate-800/80 pt-3">
                    <span className="inline-block rounded border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-xs font-bold tracking-wide text-slate-100">
                      {bonusLabel}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold">
                    {active ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        Clan sélectionné
                      </span>
                    ) : (
                      <span className="text-slate-400 group-hover:text-slate-200">
                        Choisir {fid}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Battlefield Configuration: Procedural Seed OR Saved Server Map (from Editor) */}
          <div
            data-testid="map-configuration-panel"
            className="rounded-md border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MapIcon className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-100">
                  Théâtre d&apos;opérations : Numéro de Seed ou Carte Enregistrée
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {selectedMapId ? (
                  <Badge
                    data-testid="active-map-mode-badge"
                    className="border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                  >
                    Carte Serveur : {selectedServerMap?.name ?? selectedMapId}
                  </Badge>
                ) : (
                  <Badge
                    data-testid="active-map-mode-badge"
                    className="border-amber-500/50 bg-amber-500/15 text-amber-300"
                  >
                    Seed Procédural #{effectiveProceduralSeed ?? "Auto"} ({MAP_WIDTH_TILES}×{MAP_HEIGHT_TILES})
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Left Column: Procedural Seed Number Input */}
              <div
                className={
                  !selectedMapId
                    ? "rounded-md border border-amber-500/60 bg-slate-950/90 p-3.5 space-y-2.5"
                    : "rounded-md border border-slate-800 bg-slate-950/50 p-3.5 space-y-2.5"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="map-seed-input"
                    className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-300"
                  >
                    <Hash className="h-4 w-4" />
                    <span>Numéro de Seed (Génération Procédurale)</span>
                  </label>
                  <button
                    type="button"
                    data-testid="mode-procedural-seed"
                    onClick={() => handleSelectServerMap("")}
                    className={
                      !selectedMapId
                        ? "rounded border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300"
                        : "rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300 hover:border-amber-500/50 hover:text-amber-200"
                    }
                  >
                    {!selectedMapId ? "Mode actif" : "Utiliser le Seed"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="map-seed-input"
                    data-testid="map-seed-input"
                    type="text"
                    inputMode="numeric"
                    value={seedInput}
                    onChange={(e) => handleSeedChange(e.target.value)}
                    placeholder="Ex: 20260731"
                    maxLength={24}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs sm:text-sm font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="random-seed-button"
                    onClick={handleRandomizeSeed}
                    title="Générer un numéro de seed aléatoire"
                    className="shrink-0 border border-slate-700 bg-slate-900 text-amber-300 hover:border-amber-500/50"
                  >
                    <Dices className="h-4 w-4" />
                    <span>Aléatoire</span>
                  </Button>
                </div>

                <p className="text-xs text-slate-400">
                  Entrez un numéro de seed pour générer une carte {MAP_WIDTH_TILES}×{MAP_HEIGHT_TILES} reproductible à l&apos;identique (minerai, argent, forêts, lacs).
                </p>
              </div>

              {/* Right Column: Saved Server Map Selector (from Map Editor) */}
              <div
                className={
                  selectedMapId
                    ? "rounded-md border border-cyan-500/60 bg-slate-950/90 p-3.5 space-y-2.5"
                    : "rounded-md border border-slate-800 bg-slate-950/50 p-3.5 space-y-2.5"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="saved-map-select"
                    className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-cyan-300"
                  >
                    <FolderKanban className="h-4 w-4" />
                    <span>Carte Enregistrée du Serveur (Éditeur)</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="refresh-maps-button"
                    onClick={() => void fetchSavedMaps()}
                    title="Actualiser la liste des cartes du serveur"
                    className="h-7 px-2 text-xs border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${mapsLoading ? "animate-spin" : ""}`} />
                    <span>Actualiser</span>
                  </Button>
                </div>

                <select
                  id="saved-map-select"
                  data-testid="saved-map-select"
                  value={selectedMapId}
                  onChange={(e) => handleSelectServerMap(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="">
                    — Génération Procédurale (Utiliser le numéro de Seed) —
                  </option>
                  {savedMaps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.width}×{m.height} • {m.spawnCount} spawns • Seed #{m.seed})
                    </option>
                  ))}
                </select>

                <p className="text-xs text-slate-400">
                  Sélectionnez une carte publiée depuis l&apos;Éditeur de Cartes (`devtools-rts-mk1`) ou parmi les cartes officielles du serveur.
                </p>
              </div>
            </div>

            {/* Interactive Saved Server Maps Cards Grid */}
            {savedMaps.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-bold">
                    Cartes disponibles sur le serveur ({savedMaps.length}) :
                  </span>
                  {selectedMapId && (
                    <button
                      type="button"
                      onClick={() => handleSelectServerMap("")}
                      className="text-amber-300 underline hover:text-amber-200"
                    >
                      Revenir au Seed procédural
                    </button>
                  )}
                </div>

                <div
                  data-testid="saved-maps-grid"
                  className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {savedMaps.map((m) => {
                    const isSelected = selectedMapId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`saved-map-card-${m.id}`}
                        onClick={() =>
                          handleSelectServerMap(isSelected ? "" : m.id)
                        }
                        className={
                          isSelected
                            ? "flex flex-col justify-between rounded border-2 border-cyan-400 bg-cyan-950/35 p-3 text-left transition shadow"
                            : "flex flex-col justify-between rounded border border-slate-800 bg-slate-950/80 p-3 text-left transition hover:border-slate-600 hover:bg-slate-900"
                        }
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-xs sm:text-sm text-slate-100 truncate">
                              {m.name}
                            </span>
                            <Badge className="shrink-0 border-cyan-500/40 bg-cyan-500/15 text-xs text-cyan-200">
                              {m.width}×{m.height}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            Par {m.author} • Seed #{m.seed}
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-2 text-xs text-slate-300">
                          <span className="rounded bg-slate-900 px-1.5 py-0.5 font-semibold text-amber-300">
                            {m.spawnCount} spawns
                          </span>
                          <span className="rounded bg-slate-900 px-1.5 py-0.5">
                            {Math.round(m.oreTotalCredits / 1000)}k cr
                          </span>
                          <span className="rounded bg-slate-900 px-1.5 py-0.5">
                            {m.silverDepositCount} Ag
                          </span>
                          <span className="rounded bg-slate-900 px-1.5 py-0.5">
                            {m.treeCount} arbres
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Direct Launch Action Bar */}
          <div className="flex flex-col items-stretch justify-between gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5 sm:max-w-xs w-full">
              <label
                htmlFor="commander-callsign-input"
                className="shrink-0 text-xs sm:text-sm font-bold text-slate-300"
              >
                Commandant :
              </label>
              <input
                id="commander-callsign-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={32}
                placeholder="Indicatif..."
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <Button
              variant="tactical"
              size="lg"
              data-testid="quick-launch-button"
              disabled={isLaunching}
              onClick={handleLaunchMatch}
              className="w-full sm:w-auto sm:min-w-64 text-sm sm:text-base font-bold"
            >
              <Play className="h-5 w-5" />
              {isLaunching
                ? "Déploiement en cours..."
                : selectedServerMap
                  ? `Lancer sur ${selectedServerMap.name} (${selectedFaction})`
                  : `Lancer la partie (${selectedFaction})`}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
