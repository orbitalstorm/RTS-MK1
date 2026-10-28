import {
  FACTIONS,
  type BuildingKind,
  type FactionId,
  type UnitKind,
} from "../../shared/constants";

export type VectorDrawingContext =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

/**
 * Draws a chamfered (beveled) octagonal rectangle path for military hard-surface armor plates.
 */
function traceChamferedRect(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  chamfer: number
): void {
  const c = Math.min(chamfer, w * 0.45, h * 0.45);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/**
 * Draws hazard chevron stripes inside a rectangular zone.
 */
function drawHazardStripes(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  stripeWidth: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = "#eab308";
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = "#18181b";
  const total = w + h;
  for (let offset = -h; offset < total; offset += stripeWidth * 2) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + h);
    ctx.lineTo(x + offset + stripeWidth, y + h);
    ctx.lineTo(x + offset + stripeWidth + h, y);
    ctx.lineTo(x + offset + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws structural rivets at the 4 corners of a plate.
 */
function drawCornerRivets(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  inset: number,
  radius: number
): void {
  const coords: Array<[number, number]> = [
    [x + inset, y + inset],
    [x + w - inset, y + inset],
    [x + inset, y + h - inset],
    [x + w - inset, y + h - inset],
  ];
  for (const [rx, ry] of coords) {
    ctx.beginPath();
    ctx.arc(rx, ry, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(rx - radius * 0.25, ry - radius * 0.25, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#94a3b8";
    ctx.fill();
  }
}

/**
 * Draws parallel thermal exhaust louvers / cooling vents.
 */
function drawVentLouvers(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number
): void {
  ctx.fillStyle = "#090d16";
  ctx.fillRect(x, y, w, h);
  const step = h / (count + 1);
  for (let i = 1; i <= count; i++) {
    const ly = y + i * step;
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = Math.max(1, step * 0.35);
    ctx.beginPath();
    ctx.moveTo(x + 1, ly);
    ctx.lineTo(x + w - 1, ly);
    ctx.stroke();
  }
}

/**
 * 1. High-Precision Vector Terrain Tile Renderer
 */
export function drawLeonardoTerrainTile(
  ctx: VectorDrawingContext,
  kind: number,
  sizePx: number
): void {
  const s = sizePx;
  const u = s / 64; // Normalized unit scale relative to 64px high-DPI tile

  if (kind === 0) {
    // Arid tactical desert: deep ochre/amber gradient, Bezier dune strata, angular pebbles with cast shadows & warm highlights
    const bgGrad = ctx.createLinearGradient(0, 0, s, s);
    bgGrad.addColorStop(0, "#33281b");
    bgGrad.addColorStop(0.55, "#292015");
    bgGrad.addColorStop(1, "#1f1810");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, s, s);

    // Wind-rippled Bezier sand dune strata
    const dunes: Array<{ y0: number; cy1: number; cy2: number; y1: number; alpha: number }> = [
      { y0: 14 * u, cy1: 8 * u, cy2: 20 * u, y1: 14 * u, alpha: 0.14 },
      { y0: 34 * u, cy1: 27 * u, cy2: 41 * u, y1: 34 * u, alpha: 0.11 },
      { y0: 52 * u, cy1: 46 * u, cy2: 58 * u, y1: 52 * u, alpha: 0.12 },
    ];
    for (const d of dunes) {
      ctx.beginPath();
      ctx.moveTo(0, d.y0);
      ctx.bezierCurveTo(s * 0.33, d.cy1, s * 0.66, d.cy2, s, d.y1);
      ctx.lineTo(s, d.y1 + 5 * u);
      ctx.bezierCurveTo(s * 0.66, d.cy2 + 4 * u, s * 0.33, d.cy1 + 4 * u, 0, d.y0 + 5 * u);
      ctx.closePath();
      ctx.fillStyle = `rgba(245, 196, 115, ${d.alpha})`;
      ctx.fill();

      // Specular crest line
      ctx.beginPath();
      ctx.moveTo(0, d.y0);
      ctx.bezierCurveTo(s * 0.33, d.cy1, s * 0.66, d.cy2, s, d.y1);
      ctx.strokeStyle = "rgba(253, 224, 171, 0.16)";
      ctx.lineWidth = 1 * u;
      ctx.stroke();
    }

    // Angular desert pebbles with drop shadows & warm NW specular edge
    const pebbles: Array<{ x: number; y: number; r: number }> = [
      { x: 14 * u, y: 21 * u, r: 2.6 * u },
      { x: 47 * u, y: 15 * u, r: 2.1 * u },
      { x: 26 * u, y: 45 * u, r: 3.1 * u },
      { x: 52 * u, y: 48 * u, r: 1.9 * u },
    ];
    for (const p of pebbles) {
      // Shadow
      ctx.beginPath();
      ctx.moveTo(p.x + p.r * 0.3, p.y + p.r * 0.9);
      ctx.lineTo(p.x + p.r * 1.4, p.y + p.r * 0.6);
      ctx.lineTo(p.x + p.r * 0.6, p.y - p.r * 0.3);
      ctx.closePath();
      ctx.fillStyle = "rgba(10, 8, 5, 0.5)";
      ctx.fill();

      // Faceted rock body
      ctx.beginPath();
      ctx.moveTo(p.x - p.r, p.y + p.r * 0.3);
      ctx.lineTo(p.x - p.r * 0.3, p.y - p.r);
      ctx.lineTo(p.x + p.r, p.y - p.r * 0.2);
      ctx.lineTo(p.x + p.r * 0.4, p.y + p.r);
      ctx.closePath();
      ctx.fillStyle = "#57452e";
      ctx.fill();

      // NW specular facet
      ctx.beginPath();
      ctx.moveTo(p.x - p.r, p.y + p.r * 0.3);
      ctx.lineTo(p.x - p.r * 0.3, p.y - p.r);
      ctx.lineTo(p.x + p.r * 0.2, p.y);
      ctx.closePath();
      ctx.fillStyle = "#856a47";
      ctx.fill();
    }
  } else if (kind === 1) {
    // Rock / reinforced concrete foundation plateau: beveled modular slabs, expansion joints, corner rivets, micro-cracks
    const slabGrad = ctx.createLinearGradient(0, 0, s, s);
    slabGrad.addColorStop(0, "#333c4a");
    slabGrad.addColorStop(0.5, "#28303d");
    slabGrad.addColorStop(1, "#1e242e");
    ctx.fillStyle = slabGrad;
    ctx.fillRect(0, 0, s, s);

    // Dark expansion joint grid
    ctx.strokeStyle = "#11161d";
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(0.8 * u, 0.8 * u, s - 1.6 * u, s - 1.6 * u);

    // Inner beveled octagonal armor slab
    traceChamferedRect(ctx, 4 * u, 4 * u, s - 8 * u, s - 8 * u, 6 * u);
    const innerGrad = ctx.createLinearGradient(4 * u, 4 * u, s - 4 * u, s - 4 * u);
    innerGrad.addColorStop(0, "#384252");
    innerGrad.addColorStop(1, "#252c37");
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
    ctx.lineWidth = 1 * u;
    ctx.stroke();

    // Cross stress seam
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    ctx.lineWidth = 1 * u;
    ctx.beginPath();
    ctx.moveTo(4 * u, s * 0.5);
    ctx.lineTo(s - 4 * u, s * 0.5);
    ctx.moveTo(s * 0.5, 4 * u);
    ctx.lineTo(s * 0.5, s - 4 * u);
    ctx.stroke();

    // Zenital NW rim lighting
    ctx.strokeStyle = "rgba(226, 232, 240, 0.28)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(4 * u, s - 10 * u);
    ctx.lineTo(4 * u, 10 * u);
    ctx.lineTo(10 * u, 4 * u);
    ctx.lineTo(s - 10 * u, 4 * u);
    ctx.stroke();

    // 4 Corner anchor rivets
    drawCornerRivets(ctx, 4 * u, 4 * u, s - 8 * u, s - 8 * u, 6 * u, 1.8 * u);

    // Subtle micro-fissure
    ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
    ctx.lineWidth = 0.9 * u;
    ctx.beginPath();
    ctx.moveTo(18 * u, 14 * u);
    ctx.lineTo(23 * u, 21 * u);
    ctx.lineTo(20 * u, 26 * u);
    ctx.stroke();
  } else if (kind === 2) {
    // Impassable canyon ridge: multi-layered stratified cliffs, deep crevices, sharp rim-lit rock ridges
    const cliffGrad = ctx.createLinearGradient(0, 0, s, s);
    cliffGrad.addColorStop(0, "#0b0e14");
    cliffGrad.addColorStop(0.5, "#1e2530");
    cliffGrad.addColorStop(1, "#07090d");
    ctx.fillStyle = cliffGrad;
    ctx.fillRect(0, 0, s, s);

    // Deep abyssal crevice shadow
    ctx.beginPath();
    ctx.moveTo(4 * u, s - 4 * u);
    ctx.lineTo(18 * u, 10 * u);
    ctx.lineTo(48 * u, 6 * u);
    ctx.lineTo(s - 4 * u, s - 6 * u);
    ctx.closePath();
    ctx.fillStyle = "#06080c";
    ctx.fill();

    // Primary stratified rock mass (Left-to-Center escarpment)
    ctx.beginPath();
    ctx.moveTo(3 * u, s - 5 * u);
    ctx.lineTo(12 * u, 14 * u);
    ctx.lineTo(34 * u, 7 * u);
    ctx.lineTo(42 * u, 28 * u);
    ctx.lineTo(28 * u, s - 5 * u);
    ctx.closePath();
    const rockGrad1 = ctx.createLinearGradient(6 * u, 8 * u, 38 * u, s - 5 * u);
    rockGrad1.addColorStop(0, "#4b5563");
    rockGrad1.addColorStop(0.6, "#374151");
    rockGrad1.addColorStop(1, "#1f2937");
    ctx.fillStyle = rockGrad1;
    ctx.fill();

    // Secondary jagged crag (Right escarpment)
    ctx.beginPath();
    ctx.moveTo(26 * u, s - 4 * u);
    ctx.lineTo(36 * u, 20 * u);
    ctx.lineTo(54 * u, 11 * u);
    ctx.lineTo(s - 4 * u, s - 6 * u);
    ctx.closePath();
    const rockGrad2 = ctx.createLinearGradient(30 * u, 12 * u, s - 4 * u, s - 4 * u);
    rockGrad2.addColorStop(0, "#374151");
    rockGrad2.addColorStop(1, "#111827");
    ctx.fillStyle = rockGrad2;
    ctx.fill();

    // Crisp NW Rim Lighting along protruding rock ridges
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(5 * u, s - 7 * u);
    ctx.lineTo(12 * u, 14 * u);
    ctx.lineTo(34 * u, 7 * u);
    ctx.moveTo(28 * u, s - 6 * u);
    ctx.lineTo(36 * u, 20 * u);
    ctx.lineTo(54 * u, 11 * u);
    ctx.stroke();

    // Internal geological strata lines
    ctx.strokeStyle = "rgba(17, 24, 39, 0.85)";
    ctx.lineWidth = 1.1 * u;
    ctx.beginPath();
    ctx.moveTo(10 * u, 30 * u);
    ctx.lineTo(26 * u, 22 * u);
    ctx.lineTo(38 * u, 34 * u);
    ctx.moveTo(33 * u, 42 * u);
    ctx.lineTo(48 * u, 32 * u);
    ctx.stroke();
  } else {
    // kind === 3: Rich Crystalline Tiberium / Spice Deposit
    // Dark fractured mineral bed
    const bedGrad = ctx.createRadialGradient(s * 0.5, s * 0.5, 4 * u, s * 0.5, s * 0.5, s * 0.65);
    bedGrad.addColorStop(0, "#132a20");
    bedGrad.addColorStop(0.55, "#1f1d16");
    bedGrad.addColorStop(1, "#181510");
    ctx.fillStyle = bedGrad;
    ctx.fillRect(0, 0, s, s);

    // Tectonic ground fractures glowing with subsurface emerald energy
    ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
    ctx.lineWidth = 1.3 * u;
    ctx.beginPath();
    ctx.moveTo(10 * u, 14 * u);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.lineTo(54 * u, 18 * u);
    ctx.moveTo(14 * u, 50 * u);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.lineTo(50 * u, 52 * u);
    ctx.stroke();

    // Cluster of 7 hexagonal beveled crystal prisms
    const crystals: Array<{ x: number; y: number; len: number; w: number; angle: number }> = [
      { x: 18 * u, y: 20 * u, len: 13 * u, w: 4.5 * u, angle: -0.45 },
      { x: 44 * u, y: 18 * u, len: 14 * u, w: 4.8 * u, angle: 0.52 },
      { x: 16 * u, y: 42 * u, len: 12 * u, w: 4.2 * u, angle: -1.1 },
      { x: 46 * u, y: 44 * u, len: 13 * u, w: 4.6 * u, angle: 1.05 },
      { x: 28 * u, y: 48 * u, len: 11 * u, w: 4.0 * u, angle: -0.15 },
      { x: 35 * u, y: 16 * u, len: 11 * u, w: 3.8 * u, angle: 0.12 },
      { x: 32 * u, y: 32 * u, len: 16 * u, w: 5.8 * u, angle: -0.18 },
    ];

    for (const c of crystals) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);

      // Cast shadow
      ctx.beginPath();
      ctx.moveTo(-c.w * 0.6, c.len * 0.35);
      ctx.lineTo(c.w * 1.1, c.len * 0.5);
      ctx.lineTo(c.w * 0.8, -c.len * 0.45);
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fill();

      // Main hexagonal prism body (#10b981 -> #22c55e)
      ctx.beginPath();
      ctx.moveTo(0, -c.len * 0.65);
      ctx.lineTo(c.w, -c.len * 0.25);
      ctx.lineTo(c.w * 0.85, c.len * 0.45);
      ctx.lineTo(0, c.len * 0.6);
      ctx.lineTo(-c.w * 0.85, c.len * 0.45);
      ctx.lineTo(-c.w, -c.len * 0.25);
      ctx.closePath();
      const cGrad = ctx.createLinearGradient(-c.w, -c.len * 0.6, c.w, c.len * 0.6);
      cGrad.addColorStop(0, "#34d399");
      cGrad.addColorStop(0.5, "#10b981");
      cGrad.addColorStop(1, "#047857");
      ctx.fillStyle = cGrad;
      ctx.fill();
      ctx.strokeStyle = "#064e3b";
      ctx.lineWidth = 0.9 * u;
      ctx.stroke();

      // Left sunlit specular facet (#86efac)
      ctx.beginPath();
      ctx.moveTo(0, -c.len * 0.65);
      ctx.lineTo(0, c.len * 0.6);
      ctx.lineTo(-c.w * 0.85, c.len * 0.45);
      ctx.lineTo(-c.w, -c.len * 0.25);
      ctx.closePath();
      ctx.fillStyle = "#22c55e";
      ctx.fill();

      // Incandescent core & crisp top facet highlight
      ctx.beginPath();
      ctx.moveTo(0, -c.len * 0.65);
      ctx.lineTo(c.w * 0.45, -c.len * 0.15);
      ctx.lineTo(0, c.len * 0.15);
      ctx.lineTo(-c.w * 0.55, -c.len * 0.2);
      ctx.closePath();
      ctx.fillStyle = "#86efac";
      ctx.fill();

      ctx.restore();
    }
  }
}

/**
 * 2. High-Precision 4-Layer Vector Building Renderer (All 11 BuildingKinds)
 */
export function drawLeonardoBuilding(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number
): void {
  const fSpec = FACTIONS[faction];
  const minDim = Math.min(w, h);
  const u = minDim / 64; // Proportional scale unit
  const cx = w * 0.5;
  const cy = h * 0.5;

  // ============================================================================
  // LAYER 1: FOUNDATION & CAST SHADOW (Dalle blindée biseautée, hazard stripes, boulons)
  // ============================================================================
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  traceChamferedRect(ctx, 5 * u, 6 * u, w - 7 * u, h - 7 * u, 8 * u);
  ctx.fill();

  const baseGrad = ctx.createLinearGradient(0, 0, w, h);
  baseGrad.addColorStop(0, "#334155");
  baseGrad.addColorStop(0.5, "#1e293b");
  baseGrad.addColorStop(1, "#0f172a");
  traceChamferedRect(ctx, 3 * u, 3 * u, w - 6 * u, h - 6 * u, 7 * u);
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // Outer structural armor trim in faction secondary & primary colors
  ctx.strokeStyle = fSpec.secondaryColor;
  ctx.lineWidth = 2.5 * u;
  ctx.stroke();

  traceChamferedRect(ctx, 5.5 * u, 5.5 * u, w - 11 * u, h - 11 * u, 5 * u);
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1.2 * u;
  ctx.stroke();

  // Yellow/Black Hazard Stripes on Southern Access Apron
  drawHazardStripes(ctx, w * 0.28, h - 9.5 * u, w * 0.44, 4.5 * u, 4 * u);

  // Corner Faction Armor Brackets
  ctx.fillStyle = fSpec.primaryColor;
  const bracketLen = 12 * u;
  const bracketThick = 3.5 * u;
  // Top-Left
  ctx.fillRect(4 * u, 4 * u, bracketLen, bracketThick);
  ctx.fillRect(4 * u, 4 * u, bracketThick, bracketLen);
  // Top-Right
  ctx.fillRect(w - 4 * u - bracketLen, 4 * u, bracketLen, bracketThick);
  ctx.fillRect(w - 4 * u - bracketThick, 4 * u, bracketThick, bracketLen);
  // Bottom-Left
  ctx.fillRect(4 * u, h - 4 * u - bracketThick, bracketLen, bracketThick);
  ctx.fillRect(4 * u, h - 4 * u - bracketLen, bracketThick, bracketLen);
  // Bottom-Right
  ctx.fillRect(w - 4 * u - bracketLen, h - 4 * u - bracketThick, bracketLen, bracketThick);
  ctx.fillRect(w - 4 * u - bracketThick, h - 4 * u - bracketLen, bracketThick, bracketLen);

  // Structural corner bolts
  drawCornerRivets(ctx, 6 * u, 6 * u, w - 12 * u, h - 12 * u, 5 * u, 1.8 * u);

  // ============================================================================
  // LAYER 2: PRIMARY STRUCTURE & MECHANICAL SUB-ASSEMBLIES
  // ============================================================================
  if (kind === "CONSTRUCTION_YARD") {
    // Heavy Command Hull
    traceChamferedRect(ctx, w * 0.1, h * 0.12, w * 0.8, h * 0.74, 8 * u);
    const hullGrad = ctx.createLinearGradient(w * 0.1, h * 0.12, w * 0.9, h * 0.86);
    hullGrad.addColorStop(0, "#475569");
    hullGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Illuminated Assembly Bay (Right Wing)
    ctx.fillStyle = "#091526";
    ctx.fillRect(w * 0.48, h * 0.22, w * 0.34, h * 0.52);
    const bayGlow = ctx.createRadialGradient(
      w * 0.65,
      h * 0.48,
      2 * u,
      w * 0.65,
      h * 0.48,
      w * 0.22
    );
    bayGlow.addColorStop(0, "#38bdf8");
    bayGlow.addColorStop(0.5, "rgba(14, 165, 233, 0.35)");
    bayGlow.addColorStop(1, "rgba(14, 165, 233, 0)");
    ctx.fillStyle = bayGlow;
    ctx.fillRect(w * 0.48, h * 0.22, w * 0.34, h * 0.52);

    // Armored Command Dome (Left Wing)
    traceChamferedRect(ctx, w * 0.15, h * 0.18, w * 0.32, h * 0.58, 5 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    ctx.fillStyle = fSpec.primaryColor;
    ctx.fillRect(w * 0.19, h * 0.24, w * 0.24, h * 0.22);

    // Articulated Gantry Crane with Cables & Hook
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.44, h * 0.72);
    ctx.lineTo(w * 0.78, h * 0.26);
    ctx.stroke();

    // Crane steel cables
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.44, h * 0.72);
    ctx.lineTo(w * 0.62, h * 0.42);
    ctx.lineTo(w * 0.78, h * 0.26);
    ctx.stroke();

    // Crane Hook & Turret Pivot
    ctx.beginPath();
    ctx.arc(w * 0.44, h * 0.72, 6 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#334155";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Telemetry Antenna Array
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h * 0.32);
    ctx.lineTo(w * 0.16, h * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.16, h * 0.12, 2.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  } else if (kind === "POWER_PLANT") {
    // Reactor Deck Housing
    traceChamferedRect(ctx, w * 0.12, h * 0.16, w * 0.76, h * 0.68, 6 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Copper High-Voltage Conduits
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 3.2 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.28, cy);
    ctx.lineTo(w * 0.72, cy);
    ctx.moveTo(cx, h * 0.22);
    ctx.lineTo(cx, h * 0.78);
    ctx.stroke();

    // 2 Cylindrical Plasma/Steam Turbines with Radial Cooling Fins
    const turbineCenters = [w * 0.31, w * 0.69];
    const rOuter = minDim * 0.22;
    for (const tx of turbineCenters) {
      // Turbine casing
      ctx.beginPath();
      ctx.arc(tx, cy, rOuter, 0, Math.PI * 2);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      // Radial cooling fins (8 blades)
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.4 * u;
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(ang) * rOuter * 0.35, cy + Math.sin(ang) * rOuter * 0.35);
        ctx.lineTo(tx + Math.cos(ang) * rOuter * 0.9, cy + Math.sin(ang) * rOuter * 0.9);
        ctx.stroke();
      }

      // Luminescent Cyan Energy Core
      const coreGrad = ctx.createRadialGradient(tx, cy, 1 * u, tx, cy, rOuter * 0.6);
      coreGrad.addColorStop(0, "#e0f2fe");
      coreGrad.addColorStop(0.5, "#38bdf8");
      coreGrad.addColorStop(1, "#0284c7");
      ctx.beginPath();
      ctx.arc(tx, cy, rOuter * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    }
  } else if (kind === "REFINERY") {
    // Smelting Blast Furnaces (Left section)
    traceChamferedRect(ctx, w * 0.08, h * 0.14, w * 0.5, h * 0.72, 6 * u);
    ctx.fillStyle = "#334155";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Dual Smelting Towers
    for (const fy of [h * 0.34, h * 0.66]) {
      ctx.beginPath();
      ctx.arc(w * 0.24, fy, 10 * u, 0, Math.PI * 2);
      ctx.fillStyle = fSpec.secondaryColor;
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.6 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w * 0.24, fy, 4.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316";
      ctx.fill();
    }

    // Industrial Piping connecting furnaces to hopper
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.24, h * 0.34);
    ctx.lineTo(w * 0.46, h * 0.5);
    ctx.lineTo(w * 0.24, h * 0.66);
    ctx.stroke();

    // Harvester Unloading Dock & Warning Chevron Bay (Right section)
    drawHazardStripes(ctx, w * 0.6, h * 0.16, w * 0.32, h * 0.68, 4.5 * u);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(w * 0.64, h * 0.22, w * 0.24, h * 0.56);

    // Conveyor Belt & Green Ore Hopper
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(w * 0.52, h * 0.36, w * 0.16, h * 0.28);
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(w * 0.6, h * 0.5, 5.5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(w * 0.59, h * 0.48, 2.5 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "SILO") {
    // Pressurized Brushed-Steel Cylindrical Vat
    const r = minDim * 0.34;
    const vatGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 2 * u, cx, cy, r);
    vatGrad.addColorStop(0, "#64748b");
    vatGrad.addColorStop(0.65, "#334155");
    vatGrad.addColorStop(1, "#0f172a");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = vatGrad;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Glowing Vertical Green Ore Level Gauge
    ctx.fillStyle = "#091526";
    ctx.fillRect(cx - 3.5 * u, cy - r * 0.68, 7 * u, r * 1.36);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(cx - 2 * u, cy - r * 0.5, 4 * u, r * 1.05);
    ctx.fillStyle = "#86efac";
    ctx.fillRect(cx - 1 * u, cy - r * 0.45, 2 * u, r * 0.9);

    // Upper Catwalk Bridge
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.85, cy);
    ctx.lineTo(cx + r * 0.85, cy);
    ctx.stroke();
  } else if (kind === "BARRACKS") {
    // Fortified Infantry Bunker with Ribbed Armored Roof
    traceChamferedRect(ctx, w * 0.12, h * 0.14, w * 0.76, h * 0.68, 7 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Ribbed roof plates
    ctx.fillStyle = "#334155";
    for (let ry = h * 0.22; ry <= h * 0.62; ry += h * 0.16) {
      ctx.fillRect(w * 0.18, ry, w * 0.64, h * 0.08);
    }

    // Firing Parapet & Squad Diamond Emblem
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.2);
    ctx.lineTo(w * 0.72, cy);
    ctx.lineTo(cx, h * 0.76);
    ctx.lineTo(w * 0.28, cy);
    ctx.closePath();
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Tactical Spotlight at Southern Muster Point
    ctx.beginPath();
    ctx.arc(cx, h * 0.76, 4.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#fef08a";
    ctx.fill();
  } else if (kind === "WAR_FACTORY") {
    // Heavy Industrial Shed Hangar
    traceChamferedRect(ctx, w * 0.08, h * 0.12, w * 0.84, h * 0.76, 7 * u);
    ctx.fillStyle = "#27272a";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Tank Roll-out Tracks on Eastern/Southern Apron
    ctx.fillStyle = "#18181b";
    ctx.fillRect(w * 0.3, h * 0.74, w * 0.12, h * 0.18);
    ctx.fillRect(w * 0.58, h * 0.74, w * 0.12, h * 0.18);

    // Sawtooth Industrial Shed Roof Bays
    const bayCount = 3;
    const bayW = (w * 0.72) / bayCount;
    for (let i = 0; i < bayCount; i++) {
      const bx = w * 0.14 + i * bayW;
      ctx.fillStyle = i % 2 === 0 ? "#3f3f46" : "#52525b";
      ctx.fillRect(bx, h * 0.18, bayW - 3 * u, h * 0.54);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fillRect(bx + 2 * u, h * 0.22, bayW - 7 * u, 4.5 * u);
    }

    // Twin Smokestacks on NW Corner
    for (const sx of [w * 0.18, w * 0.28]) {
      ctx.beginPath();
      ctx.arc(sx, h * 0.22, 4.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#18181b";
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
    }
  } else if (kind === "RADAR_DOME") {
    // Octagonal Armored Base
    traceChamferedRect(ctx, w * 0.14, h * 0.14, w * 0.72, h * 0.72, 12 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Geodesic Dome Understructure
    const domeR = minDim * 0.32;
    ctx.beginPath();
    ctx.arc(cx, cy, domeR, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Rotating Parabolic Dish & Cyan Sweep Grid
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.45);
    ctx.beginPath();
    ctx.ellipse(0, 0, domeR * 0.88, domeR * 0.56, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14, 165, 233, 0.22)";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Focal Tripod Struts & Receiver Feed Horn
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(-domeR * 0.65, 0);
    ctx.lineTo(0, -3 * u);
    ctx.moveTo(domeR * 0.65, 0);
    ctx.lineTo(0, -3 * u);
    ctx.moveTo(0, domeR * 0.45);
    ctx.lineTo(0, -3 * u);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -3 * u, 3 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#7dd3fc";
    ctx.fill();
    ctx.restore();
  } else if (kind === "TECH_CENTER") {
    // High-Tech Quantum Laboratory Hull
    traceChamferedRect(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 10 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // 4 Cryogenic Corner Coolers
    const cryoOffsets: Array<[number, number]> = [
      [w * 0.24, h * 0.24],
      [w * 0.76, h * 0.24],
      [w * 0.24, h * 0.76],
      [w * 0.76, h * 0.76],
    ];
    for (const [qx, qy] of cryoOffsets) {
      ctx.beginPath();
      ctx.arc(qx, qy, 6 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#0ea5e9";
      ctx.fill();
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
    }

    // Quantum Energy Dome (Violet / Cyan) & Data Beam
    const qR = minDim * 0.24;
    const qGrad = ctx.createRadialGradient(cx, cy, 2 * u, cx, cy, qR);
    qGrad.addColorStop(0, "#f0abfc");
    qGrad.addColorStop(0.55, "#a855f7");
    qGrad.addColorStop(1, "#3b0764");
    ctx.beginPath();
    ctx.arc(cx, cy, qR, 0, Math.PI * 2);
    ctx.fillStyle = qGrad;
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2 * u;
    ctx.stroke();
  } else if (kind === "GUARD_TOWER") {
    // Octagonal Concrete/Steel Casemate
    traceChamferedRect(ctx, w * 0.16, h * 0.16, w * 0.68, h * 0.68, 8 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Turret Ring & Ammo Boxes
    ctx.fillStyle = "#334155";
    ctx.fillRect(cx - 11 * u, cy - 5 * u, 22 * u, 12 * u);

    ctx.beginPath();
    ctx.arc(cx, cy + 2 * u, minDim * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Twin Vulcan Rotary Barrels pointing North
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(cx - 5 * u, h * 0.08, 3.2 * u, cy - h * 0.08);
    ctx.fillRect(cx + 1.8 * u, h * 0.08, 3.2 * u, cy - h * 0.08);

    // Optical Sensor Pod
    ctx.beginPath();
    ctx.arc(cx, cy + 2 * u, 3.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  } else if (kind === "SAM_SITE") {
    // Armored Rotary Pedestal
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Quad Surface-to-Air Missile Launcher Box
    traceChamferedRect(ctx, cx - 14 * u, cy - 12 * u, 28 * u, 24 * u, 4 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();

    // 4 Red/White Missile Warheads visible in launch tubes
    const tubeX = [cx - 9 * u, cx - 3 * u, cx + 3 * u, cx + 9 * u];
    for (const tx of tubeX) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(tx - 1.6 * u, cy - 15 * u, 3.2 * u, 9 * u);
      ctx.beginPath();
      ctx.arc(tx, cy - 15 * u, 1.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    }
  } else if (kind === "OBELISK") {
    // Brotherhood Black/Ruby Pyramidal Monolith
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.08);
    ctx.lineTo(w * 0.82, h * 0.84);
    ctx.lineTo(w * 0.18, h * 0.84);
    ctx.closePath();
    const obGrad = ctx.createLinearGradient(w * 0.18, h * 0.08, w * 0.82, h * 0.84);
    obGrad.addColorStop(0, "#27272a");
    obGrad.addColorStop(0.5, "#18181b");
    obGrad.addColorStop(1, "#450a0a");
    ctx.fillStyle = obGrad;
    ctx.fill();
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Golden/Copper Induction Coils along flanks
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2 * u;
    for (const ly of [h * 0.42, h * 0.56, h * 0.7]) {
      const span = ((ly - h * 0.08) / (h * 0.76)) * (w * 0.3);
      ctx.beginPath();
      ctx.moveTo(cx - span, ly);
      ctx.lineTo(cx + span, ly);
      ctx.stroke();
    }

    // Incandescent Ruby Focal Crystal & Specular Halo at Apex
    const halo = ctx.createRadialGradient(cx, h * 0.16, 1 * u, cx, h * 0.16, 13 * u);
    halo.addColorStop(0, "#fecaca");
    halo.addColorStop(0.4, "#ef4444");
    halo.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, h * 0.16, 13 * u, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, h * 0.16, 4.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  // ============================================================================
  // LAYER 3: MICRO-DETAILS (Fine panel lines, air vents, rivets, lit viewports)
  // ============================================================================
  drawVentLouvers(ctx, 10 * u, h - 16 * u, 12 * u, 5 * u, 3);

  // Illuminated tactical status LEDs
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(w - 16 * u, 9 * u, 4 * u, 2.2 * u);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(w - 11 * u, 9 * u, 4 * u, 2.2 * u);

  // ============================================================================
  // LAYER 4: LIGHTING & SPECULAR HIGHLIGHTS (Crisp NW Rim Lighting)
  // ============================================================================
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  ctx.moveTo(4 * u, h * 0.65);
  ctx.lineTo(4 * u, 10 * u);
  ctx.lineTo(10 * u, 4 * u);
  ctx.lineTo(w * 0.65, 4 * u);
  ctx.stroke();
}

/**
 * Helper to draw an articulated tank track with visible tread cleats.
 */
function drawDetailedTrack(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  cleatCount: number
): void {
  ctx.fillStyle = "#18181b";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#09090b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = "#3f3f46";
  const step = h / cleatCount;
  for (let i = 0; i < cleatCount; i++) {
    ctx.fillRect(x + 0.5, y + i * step + 0.8, w - 1, step * 0.45);
  }
}

/**
 * 3. High-Precision Vector Unit Body Renderer (All 9 UnitKinds)
 * Note: `ctx` is already translated to `(sizePx/2, sizePx/2)` and rotated (North = `-Y`).
 */
export function drawLeonardoUnitBody(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number
): void {
  const fSpec = FACTIONS[faction];
  const u = sizePx / 64; // Normalized unit scale relative to 64px high-DPI sprite

  if (kind === "RIFLE_INFANTRY" || kind === "ROCKET_SOLDIER" || kind === "ENGINEER") {
    // 3-Soldier Tactical Squad Formation
    const squadOffsets: Array<{ x: number; y: number }> = [
      { x: 0, y: -10 * u },
      { x: -10 * u, y: 8 * u },
      { x: 10 * u, y: 8 * u },
    ];

    for (const pos of squadOffsets) {
      ctx.save();
      ctx.translate(pos.x, pos.y);

      // Ground drop shadow
      ctx.beginPath();
      ctx.ellipse(1 * u, 2 * u, 6.5 * u, 5 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
      ctx.fill();

      // Armored Shoulder Pauldrons (Faction Primary & Secondary)
      traceChamferedRect(ctx, -6.5 * u, -3.5 * u, 13 * u, 7 * u, 2.5 * u);
      ctx.fillStyle = fSpec.secondaryColor;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1 * u;
      ctx.stroke();

      ctx.fillStyle = fSpec.primaryColor;
      ctx.fillRect(-6 * u, -2.5 * u, 3.5 * u, 5 * u);
      ctx.fillRect(2.5 * u, -2.5 * u, 3.5 * u, 5 * u);

      // Weapon / Equipment assembly pointing North (-Y)
      if (kind === "RIFLE_INFANTRY") {
        // Long-barreled pulse assault rifle with muzzle flash suppressor
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(1.5 * u, -11 * u, 2.2 * u, 9 * u);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(1.8 * u, -13 * u, 1.5 * u, 3 * u);
      } else if (kind === "ROCKET_SOLDIER") {
        // Shoulder-mounted anti-tank missile tube + red warhead tip
        ctx.fillStyle = "#334155";
        ctx.fillRect(2.2 * u, -11 * u, 3.6 * u, 14 * u);
        ctx.beginPath();
        ctx.arc(4 * u, -12 * u, 2 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      } else {
        // ENGINEER: Yellow technical satchel on back + plasma cutting torch at front
        ctx.fillStyle = "#eab308";
        ctx.fillRect(-4 * u, 2 * u, 8 * u, 4 * u);
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(2.5 * u, -8 * u, 2 * u, 0, Math.PI * 2);
        ctx.fill();
      }

      // Helmet & Optical Visor
      ctx.beginPath();
      ctx.arc(0, 0, 4.2 * u, 0, Math.PI * 2);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.1 * u;
      ctx.stroke();

      // Glowing cyan optical visor strip on north side of helmet
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(-2.5 * u, -3.8 * u, 5 * u, 1.8 * u);

      ctx.restore();
    }
    return;
  }

  if (kind === "HARVESTER") {
    // Heavy Ore Harvester: 4 articulated tracks, front mechanical claw scoop + green crystals, glass ore bin
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    traceChamferedRect(ctx, -18 * u, -22 * u, 38 * u, 46 * u, 5 * u);
    ctx.fill();

    // 4 Articulated Tracks
    drawDetailedTrack(ctx, -20 * u, -20 * u, 5 * u, 16 * u, 5);
    drawDetailedTrack(ctx, 15 * u, -20 * u, 5 * u, 16 * u, 5);
    drawDetailedTrack(ctx, -20 * u, 4 * u, 5 * u, 16 * u, 5);
    drawDetailedTrack(ctx, 15 * u, 4 * u, 5 * u, 16 * u, 5);

    // Front Mechanical Harvesting Scoop / Drill Claws (-Y)
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.moveTo(-13 * u, -19 * u);
    ctx.lineTo(-9 * u, -27 * u);
    ctx.lineTo(-5 * u, -21 * u);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(13 * u, -19 * u);
    ctx.lineTo(9 * u, -27 * u);
    ctx.lineTo(5 * u, -21 * u);
    ctx.closePath();
    ctx.fill();

    // Glowing Tiberium/Spice crystals in front jaw
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(0, -23 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(-1 * u, -24 * u, 2 * u, 0, Math.PI * 2);
    ctx.fill();

    // Main Armored Hull
    traceChamferedRect(ctx, -16 * u, -20 * u, 32 * u, 42 * u, 5 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Sloped Front Cab
    traceChamferedRect(ctx, -13 * u, -18 * u, 26 * u, 14 * u, 4 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();

    // Reinforced Glazed Ore Bin showing green Tiberium inside
    ctx.fillStyle = "#091526";
    ctx.fillRect(-11 * u, -2 * u, 22 * u, 16 * u);
    ctx.fillStyle = "#10b981";
    ctx.fillRect(-9 * u, 0, 18 * u, 12 * u);
    ctx.fillStyle = "#86efac";
    ctx.fillRect(-5 * u, 2 * u, 10 * u, 6 * u);

    // Rear Radiator Grille
    drawVentLouvers(ctx, -9 * u, 16 * u, 18 * u, 4 * u, 3);
    return;
  }

  if (kind === "RECON_BUGGY") {
    // Fast 4x4 All-Terrain Recon Buggy with lugged tires, roll cage, aggressive hood & headlights
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    traceChamferedRect(ctx, -11 * u, -16 * u, 24 * u, 34 * u, 4 * u);
    ctx.fill();

    // 4 Lugged Off-Road Tires
    drawDetailedTrack(ctx, -14 * u, -14 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, 10 * u, -14 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, -14 * u, 5 * u, 4 * u, 10 * u, 3);
    drawDetailedTrack(ctx, 10 * u, 5 * u, 4 * u, 10 * u, 3);

    // Aggressive Tapered Body
    ctx.beginPath();
    ctx.moveTo(0, -19 * u);
    ctx.lineTo(10 * u, -9 * u);
    ctx.lineTo(10 * u, 16 * u);
    ctx.lineTo(-10 * u, 16 * u);
    ctx.lineTo(-10 * u, -9 * u);
    ctx.closePath();
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();

    // Faction Primary Hood Striping
    ctx.fillStyle = fSpec.primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, -17 * u);
    ctx.lineTo(7 * u, -8 * u);
    ctx.lineTo(-7 * u, -8 * u);
    ctx.closePath();
    ctx.fill();

    // Tubular Roll Cage
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.4 * u;
    ctx.strokeRect(-6 * u, -5 * u, 12 * u, 14 * u);

    // Front Tactical Headlights
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(-6 * u, -17 * u, 3 * u, 2 * u);
    ctx.fillRect(3 * u, -17 * u, 3 * u, 2 * u);
    return;
  }

  if (kind === "MAMMOTH_TANK") {
    // Super-Heavy Quad-Track Tank with double reactive glacis & dorsal reactor
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    traceChamferedRect(ctx, -20 * u, -23 * u, 42 * u, 48 * u, 6 * u);
    ctx.fill();

    // 4 Independent Quad-Tracks
    drawDetailedTrack(ctx, -22 * u, -22 * u, 6 * u, 18 * u, 6);
    drawDetailedTrack(ctx, 16 * u, -22 * u, 6 * u, 18 * u, 6);
    drawDetailedTrack(ctx, -22 * u, 4 * u, 6 * u, 18 * u, 6);
    drawDetailedTrack(ctx, 16 * u, 4 * u, 6 * u, 18 * u, 6);

    // Heavy Armored Chassis
    traceChamferedRect(ctx, -17 * u, -20 * u, 34 * u, 42 * u, 5 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Double Reactive Front Glacis Plates
    traceChamferedRect(ctx, -14 * u, -17 * u, 28 * u, 32 * u, 4 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();

    // Dorsal Energy Core & Rear Exhaust Vents
    drawVentLouvers(ctx, -10 * u, 13 * u, 20 * u, 6 * u, 3);
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(-11 * u, -19 * u, 4 * u, 2 * u);
    ctx.fillRect(7 * u, -19 * u, 4 * u, 2 * u);
    return;
  }

  if (kind === "MCV") {
    // Giant Mobile Construction Vehicle: heavy tracks, armored cab, folded crane & assembly module
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    traceChamferedRect(ctx, -19 * u, -23 * u, 40 * u, 48 * u, 5 * u);
    ctx.fill();

    drawDetailedTrack(ctx, -21 * u, -21 * u, 5 * u, 42 * u, 11);
    drawDetailedTrack(ctx, 16 * u, -21 * u, 5 * u, 42 * u, 11);

    traceChamferedRect(ctx, -16 * u, -21 * u, 32 * u, 44 * u, 5 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Armored Front Cab with Cyan Windshield
    traceChamferedRect(ctx, -13 * u, -19 * u, 26 * u, 12 * u, 3 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(-9 * u, -17 * u, 18 * u, 3.5 * u);

    // Dorsal Assembly Module & Folded Yellow Crane Boom
    ctx.fillStyle = "#334155";
    ctx.fillRect(-12 * u, -5 * u, 24 * u, 24 * u);
    drawHazardStripes(ctx, -10 * u, 14 * u, 20 * u, 5 * u, 3.5 * u);

    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3.5 * u;
    ctx.beginPath();
    ctx.moveTo(-6 * u, 12 * u);
    ctx.lineTo(6 * u, -3 * u);
    ctx.stroke();
    return;
  }

  // MEDIUM_TANK or ARTILLERY
  const hullW = 28 * u;
  const hullH = kind === "ARTILLERY" ? 40 * u : 36 * u;

  ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
  traceChamferedRect(ctx, -hullW * 0.5 - 2 * u, -hullH * 0.5 + 2 * u, hullW + 6 * u, hullH, 4 * u);
  ctx.fill();

  // Left & Right Cleated Tracks
  drawDetailedTrack(ctx, -hullW * 0.5 - 4 * u, -hullH * 0.5 + 1 * u, 4.5 * u, hullH - 2 * u, 9);
  drawDetailedTrack(ctx, hullW * 0.5 - 0.5 * u, -hullH * 0.5 + 1 * u, 4.5 * u, hullH - 2 * u, 9);

  // Main Armored Hull
  traceChamferedRect(ctx, -hullW * 0.5, -hullH * 0.5, hullW, hullH, 4 * u);
  ctx.fillStyle = fSpec.secondaryColor;
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.6 * u;
  ctx.stroke();

  // Beveled Front Glacis & Side Skirts in Faction Primary Color
  traceChamferedRect(
    ctx,
    -hullW * 0.5 + 3 * u,
    -hullH * 0.5 + 3 * u,
    hullW - 6 * u,
    hullH - 9 * u,
    3 * u
  );
  ctx.fillStyle = fSpec.primaryColor;
  ctx.fill();

  // Rear Engine Louvers & Exhaust Pipes
  drawVentLouvers(ctx, -8 * u, hullH * 0.5 - 6 * u, 16 * u, 4 * u, 3);
}

/**
 * 4. High-Precision Vector Unit Turret Renderer
 * Note: `ctx` is already translated to `(sizePx/2, sizePx/2)` and rotated (`-Y` = aim direction).
 */
export function drawLeonardoUnitTurret(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number
): void {
  const fSpec = FACTIONS[faction];
  const u = sizePx / 64;

  if (kind === "RECON_BUGGY") {
    // Rotary Heavy Machine Gun Mount with Frontal Shield & Ammo Belt
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(-1.5 * u, -18 * u, 3 * u, 14 * u);

    // Frontal gun shield
    ctx.beginPath();
    ctx.moveTo(-6 * u, -7 * u);
    ctx.lineTo(0, -10 * u);
    ctx.lineTo(6 * u, -7 * u);
    ctx.lineTo(5 * u, -2 * u);
    ctx.lineTo(-5 * u, -2 * u);
    ctx.closePath();
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2 * u;
    ctx.stroke();

    // Brass ammo feed belt
    ctx.fillStyle = "#eab308";
    ctx.fillRect(2 * u, -5 * u, 3.5 * u, 4 * u);
    return;
  }

  if (kind === "MEDIUM_TANK") {
    // 105mm Main Cannon with Thermal Sleeve & Muzzle Brake
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(-2.2 * u, -25 * u, 4.4 * u, 18 * u);
    // Muzzle brake
    ctx.fillStyle = "#475569";
    ctx.fillRect(-3.4 * u, -27 * u, 6.8 * u, 3.5 * u);
    // Reinforced gun mantlet
    ctx.fillStyle = "#334155";
    ctx.fillRect(-4.5 * u, -12 * u, 9 * u, 5 * u);

    // Beveled Octagonal Turret
    traceChamferedRect(ctx, -9.5 * u, -9.5 * u, 19 * u, 19 * u, 4.5 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Commander's Cupola Hatch & Smoke Grenade Launchers
    ctx.beginPath();
    ctx.arc(3 * u, 2 * u, 3.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1 * u;
    ctx.stroke();
    return;
  }

  if (kind === "ARTILLERY") {
    // Long-Range Inclined Missile/Howitzer Launcher Ramp with Hydraulic Struts & Optics
    traceChamferedRect(ctx, -8.5 * u, -14 * u, 17 * u, 24 * u, 3 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Long Barrel / Launch Rail
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(-3 * u, -26 * u, 6 * u, 20 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fillRect(-5.5 * u, -11 * u, 11 * u, 16 * u);

    // Targeting Optical Sensor
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(4 * u, -13 * u, 3 * u, 3 * u);
    return;
  }

  if (kind === "MAMMOTH_TANK") {
    // Twin 120mm Heavy Cannons with Double Muzzle Brakes & Thermal Sleeves
    for (const bx of [-6 * u, 2.4 * u]) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(bx, -27 * u, 3.6 * u, 18 * u);
      ctx.fillStyle = "#475569";
      ctx.fillRect(bx - 0.8 * u, -29 * u, 5.2 * u, 3.5 * u);
    }

    // Lateral Tusk Missile Pods
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(-15 * u, -8 * u, 4 * u, 12 * u);
    ctx.fillRect(11 * u, -8 * u, 4 * u, 12 * u);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-14.5 * u, -9.5 * u, 3 * u, 2 * u);
    ctx.fillRect(11.5 * u, -9.5 * u, 3 * u, 2 * u);

    // Massive Beveled Heavy Turret
    traceChamferedRect(ctx, -11.5 * u, -11.5 * u, 23 * u, 23 * u, 5.5 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Specular NW Turret Roof Highlight
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(-8 * u, 4 * u);
    ctx.lineTo(-8 * u, -8 * u);
    ctx.lineTo(4 * u, -8 * u);
    ctx.stroke();
  }
}

/**
 * 5. Multi-Layered Vector Explosion Frame Generator (Pre-rasterized into GPU Sprite Atlas)
 */
export function drawLeonardoExplosionFrame(
  ctx: VectorDrawingContext,
  frameIndex: number,
  totalFrames: number,
  sizePx: number
): void {
  const safeTotal = Math.max(1, totalFrames);
  const progress = Math.max(0, Math.min(1, frameIndex / (safeTotal - 1 || 1)));
  const cx = sizePx * 0.5;
  const cy = sizePx * 0.5;
  const maxR = sizePx * 0.46;

  ctx.save();

  // Layer 1: Expanding supersonic shockwave ring
  const shockR = maxR * (0.25 + progress * 0.75);
  const shockAlpha = Math.max(0, (1 - progress) * 0.85);
  ctx.beginPath();
  ctx.arc(cx, cy, shockR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(254, 240, 138, ${shockAlpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, (1 - progress) * (sizePx * 0.08));
  ctx.stroke();

  // Layer 2: Anthracite smoke billows (#1e293b) expanding outward
  const smokeCount = 6;
  for (let i = 0; i < smokeCount; i++) {
    const ang = (i * Math.PI * 2) / smokeCount + progress * 0.4;
    const dist = maxR * (0.18 + progress * 0.52);
    const sx = cx + Math.cos(ang) * dist;
    const sy = cy + Math.sin(ang) * dist;
    const sr = maxR * (0.18 + progress * 0.22) * (1 - progress * 0.35);
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
  }

  // Layer 3: Red/Orange fire lobes (#ef4444 / #f97316)
  if (progress < 0.88) {
    const fireScale = Math.sin(progress * Math.PI);
    const lobeCount = 7;
    for (let i = 0; i < lobeCount; i++) {
      const ang = (i * Math.PI * 2) / lobeCount - progress * 0.25;
      const dist = maxR * 0.32 * progress;
      const fx = cx + Math.cos(ang) * dist;
      const fy = cy + Math.sin(ang) * dist;
      const fr = Math.max(1.5, maxR * 0.26 * (0.4 + fireScale * 0.6));
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? "#ef4444" : "#f97316";
      ctx.fill();
    }
  }

  // Layer 4: Incandescent geometric shrapnel sparks
  const sparkCount = 8;
  for (let i = 0; i < sparkCount; i++) {
    const ang = (i * Math.PI * 2) / sparkCount + 0.2;
    const r0 = maxR * (0.15 + progress * 0.55);
    const r1 = r0 + maxR * 0.16 * (1 - progress * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang + 0.09) * r1, cy + Math.sin(ang + 0.09) * r1);
    ctx.lineTo(cx + Math.cos(ang - 0.09) * r1, cy + Math.sin(ang - 0.09) * r1);
    ctx.closePath();
    ctx.fillStyle = "#fef08a";
    ctx.fill();
  }

  // Layer 5: White-yellow plasma core (#fef08a)
  if (progress < 0.65) {
    const coreR = Math.max(1, maxR * 0.36 * (1 - progress / 0.65));
    const coreGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, coreR);
    coreGrad.addColorStop(0, "#ffffff");
    coreGrad.addColorStop(0.55, "#fef08a");
    coreGrad.addColorStop(1, "rgba(249, 115, 22, 0)");
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();
  }

  ctx.restore();
}
