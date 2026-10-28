# Changelog — RTS-MK1

All notable changes to **RTS-MK1** (`https://rts-mk1.orbital8.cloud`) follow strict non-reusable `v1.x.y` versioning.

## [v1.1.0] — 2026-10-28

### Added
- **Smooth Edge-of-Screen Camera Auto-Scroll (`src/shared/constants/index.ts`, `src/app/game/[lobbyId]/page.tsx`)**: Added progressive quadratic edge-of-screen camera panning (`computeEdgeScrollVelocity`, `EDGE_SCROLL_MARGIN_PX = 36`, `EDGE_SCROLL_MAX_SPEED_PX = 3.2`) when the cursor enters a 36px viewport border zone, ensuring gentle, non-violent camera movement without interfering with box-selection drags.
- **Tactical Camera Zoom Selector (`1`, `1.25`, `1.5`, `1.75`, `2`)**: Added `ZOOM_LEVELS` (`[1, 1.25, 1.5, 1.75, 2]`) in `src/shared/constants/index.ts`, center-preserving `setZoom()` and `cycleZoom()` in `src/renderer/camera.ts`, and interactive Zoom cycle + direct level selector buttons (`1`, `1.25`, `1.5`, `1.75`, `2`) in both the top tactical viewport bar (`src/app/game/[lobbyId]/page.tsx`) and the classic sidebar HUD (`src/components/hud/classic-sidebar-hud.tsx`).
- **Ghost Building Sprite & Placement Validation Preview**: Rendered the faction-colored building sprite preview inside `renderTacticalWorld` (`src/renderer/world-renderer.ts`) and synchronized client-side placement validation (`canPlaceBuildingOnGrid`) with server-side footprint, unit-occupancy, and base build radius rules (`BASE_BUILD_RADIUS_TILES = 16`).

### Fixed
- **Root-Cause Building Deployment Delta Synchronization & Friendly Unit Relocation (`src/engine/simulation.ts`)**: Fixed the tick lifecycle in `RtsSimulation.stepTick()` where `createdThisTick`, `destroyedThisTick`, `acousticEventsThisTick`, and `ent.dirty` were cleared at the *beginning* of `stepTick()` instead of at the *end* after serializing `TickDelta`. WebSocket commands (`COMMAND_PLACE_BUILDING`, `COMMAND_SELL_BUILDING`) executed between 20 Hz ticks now reliably include the deployed or sold building in the next `SIM_DELTA` packet (`delta.created` / `delta.destroyedIds`). Friendly mobile units standing on a new building footprint are also automatically relocated to the nearest free perimeter tile instead of silently blocking deployment.

## [v1.0.0] — 2026-10-28

### Added
- **Agent 01 (`src/shared/`)**: Strict Zod validation schemas (`commands`, `deltas`, `lobby`, `profile`, `env`), inferred TypeScript types (`strict: true`, zero `any`), and full Command & Conquer / Dune 2000 unit, structure, tech-tree, and faction balance constants (`GDI`, `NOD`, `ORDOS`).
- **Agent 02 (`src/engine/`)**: Deterministic 20 Hz ECS simulation engine (`simulation.ts`), binary-heap A* pathfinding with deterministic spatial tile reservation (`pathfinding/`), two-layer Shroud & Fog of War (`fog/`), Harvester-Refinery-Silo economy loop, power deficit penalties, 4 parallel production queues (`BUILDING`, `DEFENSE`, `INFANTRY`, `VEHICLE`), skirmish AI controller, and compact Zod-validated Delta + Snapshot generation.
- **Agent 03 (`src/server/`, `src/app/api/`)**: Single Active Match Mutex (`lobby-manager.ts`) enforcing at most 1 active (`STARTING` / `IN_PROGRESS`) match with ordered FIFO `QUEUED` lobby rank broadcasting and a 10s/60s `ping/pong` Watchdog automatic lock release; authoritative WebSocket server (`ws-server.ts`) on `/ws`; persistent SQLite WAL commander profile & match history database (`src/server/db/`).
- **Agent 04 (`src/app/`, `src/components/`, `src/store/`)**: Portal, live server mutex badge & lobby browser, waiting/queue room, Classic Westwood C&C / Dune 2000 sidebar HUD (`src/components/hud/`) with radar canvas slot, discretized Tailwind power & progress bars, 100% Tailwind CSS with zero inline `style` attributes, and Zustand store bridge (`src/store/game-store.ts`).
- **Agent 05 (`src/renderer/`)**: Asynchronous batched `OffscreenCanvas` -> `ImageBitmap` procedural vector/bitmap sprite atlas generator (`generator/atlas-generator.ts`) across 16 rotation angles and faction team color masks with explicit GPU `.close()` cleanup; orthogonal camera (`camera.ts`); 60+ FPS linear-interpolated tactical world canvas renderer (`world-renderer.ts`); real-time radar minimap renderer (`minimap-renderer.ts`).
- **Agent 06 (`src/audio/`)**: Procedural Web Audio API sound synthesizer (`synthesizer.ts`), 4-bus mixer (`mixer.ts`) with strict 4-instance / 80ms polyphony limiter and automatic EVA ducking, and camera-relative stereo panning & distance attenuation (`spatial.ts`).
- **Agent 07 (`Dockerfile.web`, `Dockerfile.ws`, `docker-compose.yml`, `infra/`)**: Multi-container Docker Compose infrastructure (`reverse-proxy`, `web`, `ws-server`, `db`) tagged `v1.0.0`, non-root user execution, CPU/RAM limits, Zod environment validation, and HTTPS + `/ws` deployment on `https://rts-mk1.orbital8.cloud`.
