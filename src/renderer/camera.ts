import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE_PIXEL_SIZE,
} from "../shared/constants";

export class TacticalCamera {
  public x = 0;
  public y = 0;
  public zoom = 1.0;
  public viewportWidth = 960;
  public viewportHeight = 640;

  public setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.clamp();
  }

  public pan(dxPixels: number, dyPixels: number): void {
    this.x += dxPixels / this.zoom;
    this.y += dyPixels / this.zoom;
    this.clamp();
  }

  public centerOnTile(tileX: number, tileY: number): void {
    const worldX = tileX * TILE_PIXEL_SIZE;
    const worldY = tileY * TILE_PIXEL_SIZE;
    this.x = worldX - this.viewportWidth / (2 * this.zoom);
    this.y = worldY - this.viewportHeight / (2 * this.zoom);
    this.clamp();
  }

  public adjustZoom(delta: number): void {
    const prevCenterTile = this.screenToTile(
      this.viewportWidth * 0.5,
      this.viewportHeight * 0.5
    );
    this.zoom = Math.max(0.65, Math.min(1.75, Number((this.zoom + delta).toFixed(2))));
    this.centerOnTile(prevCenterTile.tileX, prevCenterTile.tileY);
  }

  public clamp(): void {
    const maxWorldW = MAP_WIDTH_TILES * TILE_PIXEL_SIZE;
    const maxWorldH = MAP_HEIGHT_TILES * TILE_PIXEL_SIZE;
    const maxX = Math.max(0, maxWorldW - this.viewportWidth / this.zoom);
    const maxY = Math.max(0, maxWorldH - this.viewportHeight / this.zoom);
    this.x = Math.max(0, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(maxY, this.y));
  }

  public screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
    const worldX = this.x + screenX / this.zoom;
    const worldY = this.y + screenY / this.zoom;
    return {
      tileX: Math.max(0, Math.min(MAP_WIDTH_TILES - 1, Math.floor(worldX / TILE_PIXEL_SIZE))),
      tileY: Math.max(0, Math.min(MAP_HEIGHT_TILES - 1, Math.floor(worldY / TILE_PIXEL_SIZE))),
    };
  }

  public getCenterTile(): { tileX: number; tileY: number } {
    return this.screenToTile(this.viewportWidth * 0.5, this.viewportHeight * 0.5);
  }

  public getVisibleTileBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const minX = Math.max(0, Math.floor(this.x / TILE_PIXEL_SIZE) - 1);
    const minY = Math.max(0, Math.floor(this.y / TILE_PIXEL_SIZE) - 1);
    const maxX = Math.min(
      MAP_WIDTH_TILES - 1,
      Math.ceil((this.x + this.viewportWidth / this.zoom) / TILE_PIXEL_SIZE) + 1
    );
    const maxY = Math.min(
      MAP_HEIGHT_TILES - 1,
      Math.ceil((this.y + this.viewportHeight / this.zoom) / TILE_PIXEL_SIZE) + 1
    );
    return { minX, maxX, minY, maxY };
  }
}
