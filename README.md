# RTS-MK1 (`v1.0.0`) — Classic Multiplayer & Skirmish RTS

- **Production URL:** [https://rts-mk1.orbital8.cloud](https://rts-mk1.orbital8.cloud)
- **WebSocket Endpoint:** `wss://rts-mk1.orbital8.cloud/ws`
- **GitHub Repository:** [https://github.com/orbitalstorm/RTS-MK1](https://github.com/orbitalstorm/RTS-MK1)

## Architecture (`v1.0.0`)

1. **`src/shared/` [Agent 01 — Lead System Architect]**
   - `zod` validation schemas (`commands.ts`, `deltas.ts`, `lobby.ts`, `profile.ts`, `env.ts`), inferred TypeScript `strict: true` types (zero `any`), and full Command & Conquer / Dune 2000 faction (`GDI`, `NOD`, `ORDOS`), building, and unit balance constants.
2. **`src/engine/` [Agent 02 — Core RTS Simulation & ECS Engineer]**
   - Deterministic 20 Hz (`50 ms/tick`) ECS simulation loop (`simulation.ts`), binary-heap A* pathfinding with spatial tile reservation (`pathfinding/astar.ts`), two-layer Shroud & Fog of War (`fog/fog-of-war.ts`), Harvester-Refinery-Silo economy loop, power deficit penalties, 4 parallel production queues, skirmish AI, and compact Zod-validated Delta + Snapshot generation.
3. **`src/server/` & `src/app/api/` [Agent 03 — Multiplayer Netcode & Backend Engineer]**
   - **Single Active Match Mutex (`lobby-manager.ts`)**: Enforces at most 1 active (`STARTING` / `IN_PROGRESS`) match at a time, places additional lobbies into an ordered `QUEUED` FIFO queue with live rank updates, and runs a 10s/60s `ping/pong` Watchdog for automatic lock release.
   - Authoritative WebSocket server (`ws-server.ts`) and persistent SQLite WAL database (`src/server/db/index.ts`).
4. **`src/app/`, `src/components/`, `src/store/` [Agent 04 — UI/UX Frontend Engineer]**
   - Next.js App Router portal, live Server Mutex telemetry badge, lobby browser, waiting room, Classic Westwood C&C right sidebar HUD (`classic-sidebar-hud.tsx`), discretized Tailwind progress/power bars, 100% Tailwind CSS with zero inline `style` attributes, and Zustand bridge (`game-store.ts`).
5. **`src/renderer/` [Agent 05 — Hybrid OffscreenCanvas Visual Pipeline Engineer]**
   - Asynchronous batched `OffscreenCanvas` &rarr; `ImageBitmap` procedural vector/bitmap sprite atlas generator (`generator/atlas-generator.ts`) across 16 rotation angles and faction team colors with explicit GPU `.close()` memory cleanup, orthogonal camera (`camera.ts`), 60+ FPS linear-interpolated tactical world canvas renderer (`world-renderer.ts`), and radar minimap canvas renderer (`minimap-renderer.ts`).
6. **`src/audio/` [Agent 06 — Audio Engine & Procedural Sound Designer]**
   - Web Audio API procedural sound synthesizer (`synthesizer.ts`), 4-bus mixer (`mixer.ts`) with strict 4-instance / 80ms polyphony limiter and automatic EVA ducking, and camera-relative stereo panning & distance attenuation (`spatial.ts`).
7. **`Dockerfile.web`, `Dockerfile.ws`, `docker-compose.yml`, `infra/` [Agent 07 — DevOps & VPS Docker Infrastructure Engineer]**
   - Multi-container Docker Compose deployment (`reverse-proxy`, `web`, `ws-server`, `db`) tagged `v1.0.0`, non-root user execution, CPU/RAM resource limits, and HTTPS + `/ws` routing on `rts-mk1.orbital8.cloud`.
