"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Play, Radio, Shield, Swords } from "lucide-react";
import { APP_VERSION, FACTIONS, type FactionId } from "../../shared/constants";
import { useRtsGameStore } from "../../store/game-store";
import { FactionVectorEmblem } from "../hud/leonardo-icons";
import { Badge, Button, Card } from "../ui/primitives";

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
  const [isLaunching, setIsLaunching] = useState(false);
  const pendingLaunchRef = useRef(false);

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
  }, [connectWebSocket, setCommanderIdentity]);

  useEffect(() => {
    if (currentLobbyId) {
      router.push(`/game/${encodeURIComponent(currentLobbyId)}`);
    }
  }, [currentLobbyId, router]);

  useEffect(() => {
    if (wsConnected && pendingLaunchRef.current) {
      pendingLaunchRef.current = false;
      const cleanName = nameInput.trim() || "Commandant";
      sendMessage({
        type: "LOBBY_CREATE",
        playerId,
        commanderName: cleanName,
        faction: selectedFaction,
        lobbyName: `Escarmouche Tactique (${selectedFaction})`,
        withAiBot: true,
        autoStart: true,
      });
    }
  }, [wsConnected, nameInput, playerId, selectedFaction, sendMessage]);

  function handleSelectClan(fid: FactionId): void {
    setSelectedFaction(fid);
    const cleanName = nameInput.trim() || "Commandant";
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rts_mk1_faction", fid);
    }
    setCommanderIdentity(playerId, cleanName, fid);
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

    sendMessage({
      type: "LOBBY_CREATE",
      playerId,
      commanderName: cleanName,
      faction: selectedFaction,
      lobbyName: `Escarmouche Tactique (${selectedFaction})`,
      withAiBot: true,
      autoStart: true,
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-obsidian text-slate-100 font-mono">
      {/* Minimal Tactical Header */}
      <header className="border-b border-slate-800 bg-tactical px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-amber-500/50 bg-amber-500/10 text-amber-400">
              <Swords className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-widest text-amber-400">
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
            <Radio className="h-3 w-3" />
            {wsConnected ? "SERVEUR PRÊT" : "CONNEXION..."}
          </Badge>
        </div>
      </header>

      {/* Centered Quick-Launch Clan Selection Screen */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center p-4 sm:p-6">
        <Card className="p-5 sm:p-8 space-y-6 border-slate-800 bg-slate-950/90">
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-300">
              <Shield className="h-3.5 w-3.5" />
              <span>Déploiement Tactique Immédiat</span>
            </div>
            <h2 className="text-lg sm:text-2xl font-bold uppercase tracking-wider text-slate-100">
              Sélectionnez votre Clan
            </h2>
            <p className="text-xs text-slate-400">
              Choisissez votre faction d&apos;allégeance et lancez directement l&apos;opération sur le terrain.
            </p>
          </div>

          {lastError && (
            <div className="rounded border border-red-500/50 bg-red-950/50 px-3 py-2 text-center text-xs text-red-200">
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
                  ? "Blindage Lourd (+10%)"
                  : fid === "NOD"
                    ? "Vitesse d'Assaut (+15%)"
                    : "Récolte (+15%) & Vitesse (+8%)";

              return (
                <button
                  key={fid}
                  type="button"
                  data-testid={`clan-card-${fid}`}
                  onClick={() => handleSelectClan(fid)}
                  className={
                    active
                      ? `group relative flex flex-col items-center rounded-md border-2 p-5 text-center transition shadow-lg ${spec.badgeClass}`
                      : "group relative flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/70 p-5 text-center text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
                  }
                >
                  <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-md border border-slate-800 bg-slate-950 p-2 shadow-inner">
                    <FactionVectorEmblem
                      faction={fid}
                      className="h-12 w-12 transition-transform duration-150 group-hover:scale-110"
                    />
                  </div>

                  <div className="text-sm font-bold uppercase tracking-wider text-slate-100">
                    {spec.name}
                  </div>

                  <p className="mt-1.5 text-xs text-slate-300 opacity-90">
                    {spec.motto}
                  </p>

                  <div className="mt-4 w-full border-t border-slate-800/80 pt-3">
                    <span className="inline-block rounded border border-slate-700/80 bg-slate-950/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                      {bonusLabel}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-1 text-[11px] font-bold uppercase">
                    {active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Clan Sélectionné
                      </span>
                    ) : (
                      <span className="text-slate-500 group-hover:text-slate-300">
                        Choisir {fid}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Direct Launch Action Bar */}
          <div className="flex flex-col items-stretch justify-between gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5 sm:max-w-xs w-full">
              <label
                htmlFor="commander-callsign-input"
                className="shrink-0 text-xs uppercase text-slate-400"
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
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <Button
              variant="tactical"
              size="lg"
              data-testid="quick-launch-button"
              disabled={isLaunching}
              onClick={handleLaunchMatch}
              className="w-full sm:w-auto sm:min-w-64 text-sm font-bold"
            >
              <Play className="h-4 w-4" />
              {isLaunching
                ? "DÉPLOIEMENT EN COURS..."
                : `Lancer la Partie (${selectedFaction})`}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
