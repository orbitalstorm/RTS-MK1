# Changelog — RTS-MK1

All notable changes to **RTS-MK1** (`https://rts-mk1.orbital8.cloud`) follow strict non-reusable `v1.x.y` versioning.

## [v1.0.0] — 2026-10-28

### Added
- **Agent 01 (`src/shared/`)**: Strict Zod validation schemas (`commands`, `deltas`, `lobby`, `profile`, `env`), inferred TypeScript types (`strict: true`, zero `any`), and full Command & Conquer / Dune 2000 unit, structure, tech-tree, and faction balance constants (`GDI`, `NOD`, `ORDOS`).
- **Agent 02 (`src/engine/`)**: Deterministic 20 Hz ECS simulation engine (`simulation.ts`), binary-heap A* pathfinding with deterministic spatial tile reservation (`pathfinding/`), two-layer Shroud & Fog of War (`fog/`), Harvester-Refinery-Silo economy loop, power deficit penalties, 4 parallel production queues (`BUILDING`, `DEFENSE`, `INFANTRY`, `VEHICLE`), skirmish AI controller, and compact Zod-validated Delta + Snapshot generation.
- **Agent 03 (`src/server/`, `src/app/api/`)**: Single Active Match Mutex (`lobby-manager.ts`) enforcing at most 1 active (`STARTING` / `IN_PROGRESS`) match with ordered FIFO `QUEUED` lobby rank broadcasting and a 10s/60s `ping/pong` Watchdog automatic lock release; authoritative WebSocket server (`ws-server.ts`) on `/ws`; persistent SQLite WAL commander profile & match history database (`src/server/db/`).
- **Agent 04 (`src/app/`, `src/components/`, `src/store/`)**: Portal, live server mutex badge & lobby browser, waiting/queue room, Classic Westwood C&C / Dune 2000 sidebar HUD (`src/components/hud/`) with radar canvas slot, discretized Tailwind power & progress bars, 100% Tailwind CSS with zero inline `style` attributes, and Zustand store bridge (`src/store/game-store.ts`).
- **Agent 05 (`src/renderer/`)**: Asynchronous batched `OffscreenCanvas` -> `ImageBitmap` procedural vector/bitmap sprite atlas generator (`generator/atlas-generator.ts`) across 16 rotation angles and faction team color masks with explicit GPU `.close()` cleanup; orthogonal camera (`camera.ts`); 60+ FPS linear-interpolated tactical world canvas renderer (`world-renderer.ts`); real-time radar minimap renderer (`minimap-renderer.ts`).
- **Agent 06 (`src/audio/`)**: Procedural Web Audio API sound synthesizer (`synthesizer.ts`), 4-bus mixer (`mixer.ts`) with strict 4-instance / 80ms polyphony limiter and automatic EVA ducking, and camera-relative stereo panning & distance attenuation (`spatial.ts`).
- **Agent 07 (`Dockerfile.web`, `Dockerfile.ws`, `docker-compose.yml`, `infra/`)**: Multi-container Docker Compose infrastructure (`reverse-proxy`, `web`, `ws-server`, `db`) tagged `v1.0.0`, non-root user execution, CPU/RAM limits, Zod environment validation, and HTTPS + `/ws` deployment on `https://rts-mk1.orbital8.cloud`.
