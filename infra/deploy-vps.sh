#!/usr/bin/env bash
set -euo pipefail

echo "[RTS-MK1 v1.0.0] Building and launching containers on ai-network..."
docker compose -f docker-compose.prod.yml up -d --build
echo "[RTS-MK1 v1.0.0] Deployment complete."
