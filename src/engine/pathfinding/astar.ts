export interface GridPoint {
  x: number;
  y: number;
}

interface HeapNode {
  x: number;
  y: number;
  g: number;
  f: number;
  parentIndex: number;
}

/**
 * Binary min-heap for deterministic, zero-GC-spike A* pathfinding.
 */
class BinaryMinHeap {
  private items: number[] = [];
  private fScores: number[] = [];

  public get size(): number {
    return this.items.length;
  }

  public clear(): void {
    this.items.length = 0;
    this.fScores.length = 0;
  }

  public push(nodePoolIndex: number, fScore: number): void {
    this.items.push(nodePoolIndex);
    this.fScores.push(fScore);
    this.bubbleUp(this.items.length - 1);
  }

  public pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastF = this.fScores.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.fScores[0] = lastF;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.fScores[index]! < this.fScores[parent]!) {
        this.swap(index, parent);
        index = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(index: number): void {
    const length = this.items.length;
    while (true) {
      const left = (index << 1) + 1;
      const right = left + 1;
      let smallest = index;

      if (left < length && this.fScores[left]! < this.fScores[smallest]!) {
        smallest = left;
      }
      if (right < length && this.fScores[right]! < this.fScores[smallest]!) {
        smallest = right;
      }
      if (smallest !== index) {
        this.swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  }

  private swap(a: number, b: number): void {
    const tmpItem = this.items[a]!;
    this.items[a] = this.items[b]!;
    this.items[b] = tmpItem;

    const tmpF = this.fScores[a]!;
    this.fScores[a] = this.fScores[b]!;
    this.fScores[b] = tmpF;
  }
}

/**
 * Spatial reservation table preventing vehicle/harvester overlap & deadlocks
 * without ever resorting to forced teleportation.
 */
export class SpatialReservationGrid {
  private readonly width: number;
  private readonly height: number;
  private readonly unitOccupancy: Map<number, string> = new Map();
  private readonly buildingBlocked: Uint8Array;
  private readonly terrainBlocked: Uint8Array;

  constructor(width: number, height: number, terrainGrid: readonly number[]) {
    this.width = width;
    this.height = height;
    this.buildingBlocked = new Uint8Array(width * height);
    this.terrainBlocked = new Uint8Array(width * height);
    for (let i = 0; i < terrainGrid.length; i++) {
      const tk = terrainGrid[i];
      this.terrainBlocked[i] = tk === 2 || tk === 7 ? 1 : 0;
    }
  }

  public updateTerrainTile(tileX: number, tileY: number, terrainKind: number): void {
    if (!this.inBounds(tileX, tileY)) return;
    const idx = this.index(tileX, tileY);
    this.terrainBlocked[idx] = terrainKind === 2 || terrainKind === 7 ? 1 : 0;
  }

  public index(x: number, y: number): number {
    return y * this.width + x;
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  public clearDynamic(): void {
    this.unitOccupancy.clear();
    this.buildingBlocked.fill(0);
  }

  public markBuildingFootprint(tileX: number, tileY: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const cx = tileX + dx;
        const cy = tileY + dy;
        if (this.inBounds(cx, cy)) {
          this.buildingBlocked[this.index(cx, cy)] = 1;
        }
      }
    }
  }

  public reserveUnitTile(tileX: number, tileY: number, entityId: string): boolean {
    if (!this.inBounds(tileX, tileY)) return false;
    const idx = this.index(tileX, tileY);
    if (this.terrainBlocked[idx] === 1 || this.buildingBlocked[idx] === 1) {
      return false;
    }
    const existing = this.unitOccupancy.get(idx);
    if (existing !== undefined && existing !== entityId) {
      return false;
    }
    this.unitOccupancy.set(idx, entityId);
    return true;
  }

  public releaseUnitTile(tileX: number, tileY: number, entityId: string): void {
    if (!this.inBounds(tileX, tileY)) return;
    const idx = this.index(tileX, tileY);
    if (this.unitOccupancy.get(idx) === entityId) {
      this.unitOccupancy.delete(idx);
    }
  }

  public isTilePassable(
    tileX: number,
    tileY: number,
    ignoringEntityId?: string,
    allowDynamicOccupied = false
  ): boolean {
    if (!this.inBounds(tileX, tileY)) return false;
    const idx = this.index(tileX, tileY);
    if (this.terrainBlocked[idx] === 1 || this.buildingBlocked[idx] === 1) {
      return false;
    }
    if (!allowDynamicOccupied) {
      const occ = this.unitOccupancy.get(idx);
      if (occ !== undefined && occ !== ignoringEntityId) {
        return false;
      }
    }
    return true;
  }

  public isFootprintBuildable(tileX: number, tileY: number, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const cx = tileX + dx;
        const cy = tileY + dy;
        if (!this.isTilePassable(cx, cy, undefined, false)) {
          return false;
        }
      }
    }
    return true;
  }

  public findNearestFreeDockTile(
    buildingTileX: number,
    buildingTileY: number,
    w: number,
    h: number,
    fromX: number,
    fromY: number,
    entityId?: string
  ): GridPoint | null {
    let best: GridPoint | null = null;
    let bestDist = Infinity;

    for (let dy = -1; dy <= h; dy++) {
      for (let dx = -1; dx <= w; dx++) {
        const isPerimeter = dx === -1 || dx === w || dy === -1 || dy === h;
        if (!isPerimeter) continue;
        const tx = buildingTileX + dx;
        const ty = buildingTileY + dy;
        if (this.isTilePassable(tx, ty, entityId, false)) {
          const dist = Math.hypot(tx - fromX, ty - fromY);
          if (dist < bestDist) {
            bestDist = dist;
            best = { x: tx, y: ty };
          }
        }
      }
    }
    return best;
  }
}

const DIRS_8: ReadonlyArray<{ dx: number; dy: number; cost: number }> = [
  { dx: 0, dy: -1, cost: 1.0 },
  { dx: 1, dy: 0, cost: 1.0 },
  { dx: 0, dy: 1, cost: 1.0 },
  { dx: -1, dy: 0, cost: 1.0 },
  { dx: 1, dy: -1, cost: 1.4142 },
  { dx: 1, dy: 1, cost: 1.4142 },
  { dx: -1, dy: 1, cost: 1.4142 },
  { dx: -1, dy: -1, cost: 1.4142 },
];

export class AStarPathfinder {
  private readonly width: number;
  private readonly height: number;
  private readonly closedTick: Int32Array;
  private readonly bestG: Float32Array;
  private readonly heap = new BinaryMinHeap();
  private readonly nodePool: HeapNode[] = [];
  private searchCounter = 1;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.closedTick = new Int32Array(width * height);
    this.bestG = new Float32Array(width * height);
  }

  public findPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    grid: SpatialReservationGrid,
    entityId: string,
    avoidDynamicUnits = true,
    maxIterations = 4096
  ): GridPoint[] {
    const sx = Math.round(startX);
    const sy = Math.round(startY);
    let gx = Math.round(goalX);
    let gy = Math.round(goalY);

    if (!grid.inBounds(sx, sy)) return [];

    // If destination is blocked, pick the closest passable tile around goal
    if (!grid.isTilePassable(gx, gy, entityId, !avoidDynamicUnits)) {
      const alt = this.findNearestPassable(gx, gy, sx, sy, grid, entityId, !avoidDynamicUnits);
      if (!alt) return [];
      gx = alt.x;
      gy = alt.y;
    }

    if (sx === gx && sy === gy) {
      if (Math.hypot(gx - startX, gy - startY) > 0.02) {
        return [{ x: gx, y: gy }];
      }
      return [];
    }

    this.searchCounter = (this.searchCounter + 1) & 0x3fffffff;
    const tag = this.searchCounter;
    this.heap.clear();
    this.nodePool.length = 0;

    const startIdx = grid.index(sx, sy);
    this.bestG[startIdx] = 0;
    this.closedTick[startIdx] = tag;

    const startNode: HeapNode = {
      x: sx,
      y: sy,
      g: 0,
      f: Math.hypot(gx - sx, gy - sy),
      parentIndex: -1,
    };
    this.nodePool.push(startNode);
    this.heap.push(0, startNode.f);

    let closestNodeIdx = 0;
    let closestH = startNode.f;
    let iterations = 0;

    while (this.heap.size > 0 && iterations < maxIterations) {
      iterations++;
      const currentPoolIdx = this.heap.pop()!;
      const current = this.nodePool[currentPoolIdx]!;

      if (current.x === gx && current.y === gy) {
        return this.reconstructPath(currentPoolIdx);
      }

      for (const dir of DIRS_8) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        if (!grid.isTilePassable(nx, ny, entityId, !avoidDynamicUnits)) {
          continue;
        }
        // Prevent corner-cutting across diagonal obstacles
        if (dir.dx !== 0 && dir.dy !== 0) {
          if (
            !grid.isTilePassable(current.x + dir.dx, current.y, entityId, true) ||
            !grid.isTilePassable(current.x, current.y + dir.dy, entityId, true)
          ) {
            continue;
          }
        }

        const nIdx = grid.index(nx, ny);
        const tentativeG = current.g + dir.cost;

        if (this.closedTick[nIdx] === tag && tentativeG >= this.bestG[nIdx]!) {
          continue;
        }

        this.closedTick[nIdx] = tag;
        this.bestG[nIdx] = tentativeG;

        const h = Math.hypot(gx - nx, gy - ny);
        const childPoolIdx = this.nodePool.length;
        this.nodePool.push({
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + h,
          parentIndex: currentPoolIdx,
        });
        this.heap.push(childPoolIdx, tentativeG + h);

        if (h < closestH) {
          closestH = h;
          closestNodeIdx = childPoolIdx;
        }
      }
    }

    if (closestNodeIdx !== 0) {
      return this.reconstructPath(closestNodeIdx);
    }
    return [];
  }

  private reconstructPath(poolIndex: number): GridPoint[] {
    const result: GridPoint[] = [];
    let cursor = poolIndex;
    while (cursor !== -1) {
      const node = this.nodePool[cursor]!;
      if (node.parentIndex !== -1) {
        result.push({ x: node.x, y: node.y });
      }
      cursor = node.parentIndex;
    }
    result.reverse();
    return result;
  }

  private findNearestPassable(
    gx: number,
    gy: number,
    sx: number,
    sy: number,
    grid: SpatialReservationGrid,
    entityId: string,
    allowDynamicOccupied: boolean
  ): GridPoint | null {
    for (let radius = 1; radius <= 5; radius++) {
      let best: GridPoint | null = null;
      let bestDist = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const tx = gx + dx;
          const ty = gy + dy;
          if (grid.isTilePassable(tx, ty, entityId, allowDynamicOccupied)) {
            const d = Math.hypot(tx - sx, ty - sy);
            if (d < bestDist) {
              bestDist = d;
              best = { x: tx, y: ty };
            }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }
}

export function vectorToAngleIndex16(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  // Angle 0 = North (0, -1), clockwise 0..15
  const radians = Math.atan2(dx, -dy);
  const normalized = ((radians / (Math.PI * 2)) + 1) % 1;
  return Math.round(normalized * 16) % 16;
}
