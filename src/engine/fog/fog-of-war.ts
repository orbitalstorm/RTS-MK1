import type { EcsEntity } from "../ecs/types";
import type { FogPlayerCells } from "../../shared/schemas/deltas";

/**
 * Two-layer Fog of War system per player:
 * - Shroud (0 in explored): Black veil over never-explored terrain
 * - Fog (1 in explored, 0 in visible): Grey fog masking enemy unit movements outside sight
 * - Clear (1 in explored, 1 in visible): Active line of sight
 */
export class FogOfWarManager {
  private readonly width: number;
  private readonly height: number;
  private readonly exploredByPlayer: Map<string, Uint8Array> = new Map();
  private readonly visibleByPlayer: Map<string, Uint8Array> = new Map();
  private readonly lastSightSignatureByPlayer: Map<string, number> = new Map();
  private readonly cachedVisibleIndicesByPlayer: Map<string, number[]> = new Map();

  constructor(width: number, height: number, playerIds: readonly string[]) {
    this.width = width;
    this.height = height;
    for (const pid of playerIds) {
      this.exploredByPlayer.set(pid, new Uint8Array(width * height));
      this.visibleByPlayer.set(pid, new Uint8Array(width * height));
    }
  }

  public ensurePlayer(playerId: string): void {
    if (!this.exploredByPlayer.has(playerId)) {
      this.exploredByPlayer.set(playerId, new Uint8Array(this.width * this.height));
      this.visibleByPlayer.set(playerId, new Uint8Array(this.width * this.height));
    }
  }

  public recomputeTickVisibility(
    playerIds: readonly string[],
    entities: Iterable<EcsEntity>
  ): FogPlayerCells[] {
    const entityList = Array.isArray(entities) ? (entities as EcsEntity[]) : Array.from(entities);
    const sigByPlayer = new Map<string, number>();
    const countByPlayer = new Map<string, number>();

    for (const pid of playerIds) {
      this.ensurePlayer(pid);
      sigByPlayer.set(pid, 2166136261 | 0);
      countByPlayer.set(pid, 0);
    }

    for (const ent of entityList) {
      const prevHash = sigByPlayer.get(ent.ownerId);
      if (prevHash === undefined) continue;
      const qx =
        ent.entityType === "BUILDING" && ent.building
          ? Math.round((ent.transform.x + (ent.building.footprintW - 1) * 0.5) * 2)
          : Math.round(ent.transform.x) * 2;
      const qy =
        ent.entityType === "BUILDING" && ent.building
          ? Math.round((ent.transform.y + (ent.building.footprintH - 1) * 0.5) * 2)
          : Math.round(ent.transform.y) * 2;
      const packed = ((qx & 0x7ff) << 17) | ((qy & 0x7ff) << 6) | (ent.sightRadius & 0x3f);
      const nextHash = Math.imul(prevHash ^ packed, 16777619) | 0;
      sigByPlayer.set(ent.ownerId, nextHash);
      countByPlayer.set(ent.ownerId, (countByPlayer.get(ent.ownerId) ?? 0) + 1);
    }

    const dirtyPlayers = new Set<string>();
    const newlyExploredMap = new Map<string, number[]>();

    for (const pid of playerIds) {
      const finalSig = ((sigByPlayer.get(pid) ?? 0) ^ ((countByPlayer.get(pid) ?? 0) << 24)) | 0;
      const prevSig = this.lastSightSignatureByPlayer.get(pid);
      if (prevSig !== undefined && prevSig === finalSig && this.cachedVisibleIndicesByPlayer.has(pid)) {
        continue;
      }
      this.lastSightSignatureByPlayer.set(pid, finalSig);
      dirtyPlayers.add(pid);
      this.visibleByPlayer.get(pid)!.fill(0);
      newlyExploredMap.set(pid, []);
    }

    if (dirtyPlayers.size > 0) {
      for (const ent of entityList) {
        if (!dirtyPlayers.has(ent.ownerId)) continue;
        const explored = this.exploredByPlayer.get(ent.ownerId);
        const visible = this.visibleByPlayer.get(ent.ownerId);
        const newlyExplored = newlyExploredMap.get(ent.ownerId);
        if (!explored || !visible || !newlyExplored) continue;

        const centerX =
          ent.entityType === "BUILDING" && ent.building
            ? ent.transform.x + (ent.building.footprintW - 1) * 0.5
            : Math.round(ent.transform.x);
        const centerY =
          ent.entityType === "BUILDING" && ent.building
            ? ent.transform.y + (ent.building.footprintH - 1) * 0.5
            : Math.round(ent.transform.y);

        const r = ent.sightRadius;
        const rSq = r * r;
        const minX = Math.max(0, Math.floor(centerX - r));
        const maxX = Math.min(this.width - 1, Math.ceil(centerX + r));
        const minY = Math.max(0, Math.floor(centerY - r));
        const maxY = Math.min(this.height - 1, Math.ceil(centerY + r));

        for (let ty = minY; ty <= maxY; ty++) {
          for (let tx = minX; tx <= maxX; tx++) {
            const dx = tx - centerX;
            const dy = ty - centerY;
            if (dx * dx + dy * dy <= rSq) {
              const idx = ty * this.width + tx;
              visible[idx] = 1;
              if (explored[idx] === 0) {
                explored[idx] = 1;
                newlyExplored.push(idx);
              }
            }
          }
        }
      }
    }

    const deltas: FogPlayerCells[] = [];
    for (const pid of playerIds) {
      if (dirtyPlayers.has(pid)) {
        const vis = this.visibleByPlayer.get(pid)!;
        const visibleIndices: number[] = [];
        for (let i = 0; i < vis.length; i++) {
          if (vis[i] === 1) visibleIndices.push(i);
        }
        this.cachedVisibleIndicesByPlayer.set(pid, visibleIndices);
        deltas.push({
          playerId: pid,
          newlyExploredIndices: newlyExploredMap.get(pid) ?? [],
          visibleIndices,
        });
      } else {
        deltas.push({
          playerId: pid,
          newlyExploredIndices: [],
          visibleIndices: this.cachedVisibleIndicesByPlayer.get(pid) ?? [],
        });
      }
    }
    return deltas;
  }

  public getSnapshotRecords(): {
    exploredByPlayer: Record<string, number[]>;
    visibleByPlayer: Record<string, number[]>;
  } {
    const exploredByPlayer: Record<string, number[]> = {};
    const visibleByPlayer: Record<string, number[]> = {};

    for (const [pid, arr] of this.exploredByPlayer.entries()) {
      const indices: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === 1) indices.push(i);
      }
      exploredByPlayer[pid] = indices;
    }

    for (const [pid, arr] of this.visibleByPlayer.entries()) {
      const indices: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === 1) indices.push(i);
      }
      visibleByPlayer[pid] = indices;
    }

    return { exploredByPlayer, visibleByPlayer };
  }
}
