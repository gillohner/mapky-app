#!/bin/bash

# Stop MapKy development environment
# Usage: ./scripts/stop-mapky.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SESSION="mapky-dev"
DOCKER_DIR="/home/gil/Repositories/pubky/pubky-docker"

echo -e "${GREEN}Stopping MapKy Development Environment${NC}"
echo "======================================="

if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo -e "${YELLOW}Stopping tmux session '$SESSION'...${NC}"
    tmux kill-session -t "$SESSION"
    echo -e "${GREEN}Tmux session stopped${NC}"
else
    echo -e "${YELLOW}No tmux session found${NC}"
fi

echo -e "${YELLOW}Stopping Docker services...${NC}"
cd "$DOCKER_DIR"
docker compose stop homeserver nexus-neo4j redis postgres pkarr 2>/dev/null
echo -e "${GREEN}Docker services stopped${NC}"

echo ""
echo -e "${GREEN}All services stopped${NC}"
echo ""
echo "To also remove data volumes:"
echo "  cd $DOCKER_DIR && docker compose down -v"
