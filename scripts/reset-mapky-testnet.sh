#!/bin/bash

# Fully reset MapKy testnet data (wipes Neo4j, Redis, homeserver DB)
# Usage: ./scripts/reset-mapky-testnet.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOCKER_DIR="/home/gil/Repositories/pubky/pubky-docker"
SESSION="mapky-dev"

echo -e "${RED}FULL RESET WARNING${NC}"
echo "This will:"
echo "  - Stop all services"
echo "  - Wipe Neo4j graph database"
echo "  - Wipe Redis cache"
echo "  - Wipe homeserver PostgreSQL"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION"
fi

cd "$DOCKER_DIR"
docker compose down -v 2>/dev/null

# Clean nexus files
rm -rf /tmp/nexus-files/

echo ""
echo -e "${GREEN}Full reset complete${NC}"
echo "Run ./scripts/start-mapky-testnet.sh to start fresh."
