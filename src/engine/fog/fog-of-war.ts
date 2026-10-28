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
    const newlyExploredMap = new Map<string, number[]>();
    for (const pid of playerIds) {
      this.ensurePlayer(pid);
      this.visibleByPlayer.get(pid)!.fill(0);
      newlyExploredMap.set(pid, []);
    }

    for (const ent of entities) {
      const explored = this.exploredByPlayer.get(ent.ownerId);
      const visible = this.visibleByPlayer.get(ent.ownerId);
      const newlyExplored = newlyExploredMap.get(ent.ownerId);
      if (!explored || !visible || !newlyExplored) continue;

      const centerX =
        ent.entityType === "BUILDING" && ent.building
          ? ent.transform.x + (ent.building.footprintW - 1) * 0.5
          : ent.transform.x;
      const centerY =
        ent.entityType === "BUILDING" && ent.building
          ? ent.transform.y + (ent.building.footprintH - 1) * 0.5
          : ent.transform.y;

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

    const deltas: FogPlayerCells[] = [];
    for (const pid of playerIds) {
      const vis = this.visibleByPlayer.get(pid)!;
      const visibleIndices: number[] = [];
      for (let i = 0; i < vis.length; i++) {
        if (vis[i] === 1) visibleIndices.push(i);
      }
      deltas.push({
        playerId: pid,
        newlyExploredIndices: newlyExploredMap.get(pid) ?? [],
        visibleIndices,
      });
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
