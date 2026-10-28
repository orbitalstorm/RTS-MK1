"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Award,
  Cpu,
  Lock,
  Play,
  PlusCircle,
  Radio,
  Shield,
  Swords,
  Unlock,
  Users,
} from "lucide-react";
import { APP_VERSION, FACTIONS, type FactionId } from "../../shared/constants";
import type { CommanderProfile, MatchRecord } from "../../shared/schemas/profile";
import { useRtsGameStore } from "../../store/game-store";
import { FactionVectorEmblem } from "../hud/leonardo-icons";
import { Badge, Button, Card } from "../ui/primitives";

export function PortalCommandCenter() {
  const router = useRouter();
  const playerId = useRtsGameStore((s) => s.playerId);
  const commanderName = useRtsGameStore((s) => s.commanderName);
  const faction = useRtsGameStore((s) => s.faction);
  const wsConnected = useRtsGameStore((s) => s.wsConnected);
  const overview = useRtsGameStore((s) => s.overview);
  const currentLobbyId = useRtsGameStore((s) => s.currentLobbyId);
  const lastError = useRtsGameStore((s) => s.lastError);
  const setCommanderIdentity = useRtsGameStore((s) => s.setCommanderIdentity);
  const connectWebSocket = useRtsGameStore((s) => s.connectWebSocket);
  const sendMessage = useRtsGameStore((s) => s.sendMessage);

  const [nameInput, setNameInput] = useState(commanderName);
  const [selectedFaction, setSelectedFaction] = useState<FactionId>(faction);
  const [lobbyNameInput, setLobbyNameInput] = useState("Opération Tiberium Dawn");
  const [withAiBot, setWithAiBot] = useState(true);
  const [leaderboard, setLeaderboard] = useState<CommanderProfile[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchRecord[]>([]);

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

    const pid = savedId || `cmd_${Math.random().toString(36).slice(2, 9)}`;
    const cname = savedName || "Commandant Solomon";
    const fac: FactionId =
      savedFaction === "GDI" || savedFaction === "NOD" || savedFaction === "ORDOS"
        ? savedFaction
        : "GDI";

    if (typeof window !== "undefined") {
      window.localStorage.setItem("rts_mk1_player_id", pid);
    }
    setNameInput(cname);
    setSelectedFaction(fac);
    setCommanderIdentity(pid, cname, fac);
    connectWebSocket();

    void fetch(`/api/profile?playerId=${encodeURIComponent(pid)}`)
      .then((r) => r.json())
      .then((data: { leaderboard?: CommanderProfile[]; recentMatches?: MatchRecord[] }) => {
        if (data.leaderboard) setLeaderboard(data.leaderboard);
        if (data.recentMatches) setRecentMatches(data.recentMatches);
      })
      .catch(() => undefined);
  }, [connectWebSocket, setCommanderIdentity]);

  useEffect(() => {
    if (currentLobbyId) {
      router.push(`/game/${encodeURIComponent(currentLobbyId)}`);
    }
  }, [currentLobbyId, router]);

  function handleSaveProfile(): void {
    const cleanName = nameInput.trim() || "Commandant";
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rts_mk1_commander_name", cleanName);
      window.localStorage.setItem("rts_mk1_faction", selectedFaction);
    }
    setCommanderIdentity(playerId, cleanName, selectedFaction);
    void fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        commanderName: cleanName,
        preferredFaction: selectedFaction,
      }),
    })
      .then((r) => r.json())
      .then((data: { leaderboard?: CommanderProfile[] }) => {
        if (data.leaderboard) setLeaderboard(data.leaderboard);
      })
      .catch(() => undefined);
  }

  function handleCreateLobby(autoLaunchSkirmish: boolean): void {
    const cleanName = nameInput.trim() || "Commandant";
    setCommanderIdentity(playerId, cleanName, selectedFaction);
    sendMessage({
      type: "LOBBY_CREATE",
      playerId,
      commanderName: cleanName,
      faction: selectedFaction,
      lobbyName: autoLaunchSkirmish
        ? `Escarmouche Tactique (${selectedFaction})`
        : lobbyNameInput.trim() || "Secteur Alpha",
      withAiBot: autoLaunchSkirmish ? true : withAiBot,
    });
  }

  function handleJoinLobby(lobbyId: string): void {
    const cleanName = nameInput.trim() || "Commandant";
    setCommanderIdentity(playerId, cleanName, selectedFaction);
    sendMessage({
      type: "LOBBY_JOIN",
      lobbyId,
      playerId,
      commanderName: cleanName,
      faction: selectedFaction,
    });
  }

  const isServerFree = overview.activeStatus === "FREE";

  return (
    <div className="min-h-screen bg-obsidian text-slate-100 font-mono">
      {/* Top Command Header */}
      <header className="border-b border-slate-800 bg-tactical px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded border border-amber-500/50 bg-amber-500/10 text-amber-400">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-widest text-amber-400">
                  RTS-MK1 // COMMAND &amp; CONQUER ENGINE
                </h1>
                <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                  v{APP_VERSION}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                Pipeline Hybride OffscreenCanvas 16-Angles • Simulation Déterministe 20 Hz • Mutex Salon Unique
              </p>
            </div>
          </div>

          {/* Single Active Match Mutex Live Telemetry Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              className={
                wsConnected
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-red-500/50 bg-red-500/15 text-red-300"
              }
            >
              <Radio className="h-3.5 w-3.5" />
              {wsConnected ? "WS /ws CONNECTÉ" : "RECONNEXION WS..."}
            </Badge>

            <div
              className={
                isServerFree
                  ? "flex items-center gap-2 rounded border border-emerald-500/50 bg-emerald-950/60 px-3 py-1.5 text-xs text-emerald-200"
                  : "flex items-center gap-2 rounded border border-amber-500/50 bg-amber-950/60 px-3 py-1.5 text-xs text-amber-200"
              }
            >
              {isServerFree ? (
                <>
                  <Unlock className="h-4 w-4 text-emerald-400" />
                  <span>VERROU SERVEUR : LIBRE (0 SALON ACTIF)</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-amber-400" />
                  <span>
                    VERROU OCCUPÉ : {overview.activeLobbyName ?? overview.activeLobbyId} • FILE :{" "}
                    {overview.queuedLobbyIds.length} EN ATTENTE
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        {/* Left Column: Commander Profile & Faction Selector */}
        <section className="space-y-6 lg:col-span-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold uppercase text-amber-400">
                <Shield className="h-4 w-4" />
                Profil Commandant
              </div>
              <span className="text-[11px] text-slate-500">ID: {playerId}</span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase text-slate-400">
                Indicatif Tactique
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={32}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase text-slate-400">
                Faction d&apos;Allégeance
              </label>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(FACTIONS) as FactionId[]).map((fid) => {
                  const spec = FACTIONS[fid];
                  const active = selectedFaction === fid;
                  return (
                    <button
                      key={fid}
                      type="button"
                      onClick={() => setSelectedFaction(fid)}
                      className={
                        active
                          ? `flex items-center gap-3 rounded border p-3 text-left transition ${spec.badgeClass}`
                          : "flex items-center gap-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-left text-slate-300 hover:border-slate-700"
                      }
                    >
                      <FactionVectorEmblem
                        faction={fid}
                        className="h-10 w-10 shrink-0 rounded border border-slate-800/80 bg-slate-950/90 p-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex w-full items-center justify-between">
                          <span className="text-xs font-bold">{spec.name}</span>
                          {active && <Badge className="border-current">ACTIF</Badge>}
                        </div>
                        <span className="mt-1 block text-[11px] opacity-80">{spec.motto}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={handleSaveProfile} className="w-full">
              Enregistrer le Profil Commandant
            </Button>
          </Card>

          {/* Top Commanders Leaderboard */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 text-sm font-bold uppercase text-amber-400">
              <Award className="h-4 w-4" />
              Classement des Commandants
            </div>
            <div className="space-y-2">
              {leaderboard.map((cmd, idx) => (
                <div
                  key={cmd.playerId}
                  className="flex items-center justify-between rounded border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-400">#{idx + 1}</span>
                    <span className="font-semibold text-slate-200">{cmd.commanderName}</span>
                    <Badge className={FACTIONS[cmd.preferredFaction].badgeClass}>
                      {cmd.preferredFaction}
                    </Badge>
                  </div>
                  <div className="text-right text-[11px] text-slate-400">
                    <span className="text-emerald-400 font-semibold">{cmd.wins}V</span> /{" "}
                    <span className="text-red-400">{cmd.losses}D</span> •{" "}
                    <span>{cmd.oreHarvested.toLocaleString()} cr.</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Right Column: Single Active Match Mutex Control & Lobby Browser */}
        <section className="space-y-6 lg:col-span-8">
          {/* Quick Create / Instant Skirmish Launch */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold uppercase text-emerald-400">
                <PlusCircle className="h-4 w-4" />
                Déploiement de Salon &amp; Escarmouche Immédiate
              </div>
              <Button variant="tactical" onClick={() => handleCreateLobby(true)}>
                <Play className="h-3.5 w-3.5" />
                Lancer un Salon Solo vs IA
              </Button>
            </div>

            {lastError && (
              <div className="rounded border border-red-500/50 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                {lastError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-6 space-y-1.5">
                <label className="block text-xs uppercase text-slate-400">
                  Nom du Salon Tactique
                </label>
                <input
                  type="text"
                  value={lobbyNameInput}
                  onChange={(e) => setLobbyNameInput(e.target.value)}
                  maxLength={40}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-3 flex items-end">
                <button
                  type="button"
                  onClick={() => setWithAiBot(!withAiBot)}
                  className={
                    withAiBot
                      ? "flex h-9 w-full items-center justify-center gap-2 rounded border border-cyan-500/50 bg-cyan-500/20 px-3 text-xs text-cyan-200"
                      : "flex h-9 w-full items-center justify-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-xs text-slate-400"
                  }
                >
                  <Cpu className="h-3.5 w-3.5" />
                  {withAiBot ? "Bot IA : OUI" : "Bot IA : NON"}
                </button>
              </div>

              <div className="md:col-span-3 flex items-end">
                <Button
                  variant="default"
                  onClick={() => handleCreateLobby(false)}
                  className="w-full"
                >
                  Créer le Salon
                </Button>
              </div>
            </div>
          </Card>

          {/* Active & Waiting Lobbies Browser */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold uppercase text-amber-400">
                <Users className="h-4 w-4" />
                Navigateur de Salons ({overview.lobbies.length})
              </div>
              <span className="text-xs text-slate-400">
                Limite stricte : 1 salon en état IN_PROGRESS simultané • File FIFO automatique
              </span>
            </div>

            {overview.lobbies.length === 0 ? (
              <div className="rounded border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
                Aucun salon ouvert pour le moment. Créez un salon ci-dessus ou lancez une escarmouche contre l&apos;IA.
              </div>
            ) : (
              <div className="space-y-3">
                {overview.lobbies.map((lobby) => (
                  <div
                    key={lobby.lobbyId}
                    className="flex flex-wrap items-center justify-between gap-4 rounded border border-slate-800 bg-slate-900/70 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">{lobby.name}</span>
                        <Badge
                          className={
                            lobby.status === "IN_PROGRESS"
                              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                              : lobby.status === "QUEUED"
                              ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                              : lobby.status === "WAITING"
                              ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                              : "border-slate-700 bg-slate-800 text-slate-400"
                          }
                        >
                          {lobby.status}
                          {lobby.queuePosition !== null ? ` (RANG #${lobby.queuePosition})` : ""}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>
                          Joueurs : {lobby.players.length}/{lobby.maxPlayers}
                        </span>
                        <span>•</span>
                        {lobby.players.map((p) => (
                          <span key={p.playerId} className="text-slate-300">
                            {p.commanderName} ({p.faction})
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {lobby.status !== "FINISHED" && (
                        <Button
                          variant="tactical"
                          size="sm"
                          onClick={() => handleJoinLobby(lobby.lobbyId)}
                        >
                          Rejoindre / Observer
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent Battles Archive */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 text-sm font-bold uppercase text-slate-300">
              <Activity className="h-4 w-4 text-emerald-400" />
              Journal des Opérations Récentes
            </div>
            {recentMatches.length === 0 ? (
              <p className="text-xs text-slate-500">
                Les rapports de victoire seront archivés automatiquement à l&apos;issue des parties.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {recentMatches.map((m) => (
                  <div
                    key={m.matchId}
                    className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{m.lobbyName}</div>
                      <div className="text-[11px] text-slate-400">
                        Vainqueur : {m.winnerCommander} ({m.winnerFaction})
                      </div>
                    </div>
                    <Badge className="border-slate-700 bg-slate-900 text-slate-300">
                      {Math.round(m.durationTicks / 20)}s
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </main>
    </div>
  );
}
