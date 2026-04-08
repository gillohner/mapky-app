#!/bin/bash

# Start MapKy development environment with local testnet
# Usage: ./scripts/start-mapky-testnet.sh
#
# Services started:
#   Docker: homeserver, Neo4j, Redis, PostgreSQL, pkarr
#   Native: nexusd (with mapky plugin, testnet config)
#   Native: mapky-app dev server
#
# Prerequisites:
#   - Docker running
#   - tmux installed
#   - Rust toolchain (for nexusd)
#   - Node.js (for mapky-app)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOCKER_DIR="/home/gil/Repositories/pubky/pubky-docker"
NEXUS_DIR="/home/gil/Repositories/pubky/pubky-nexus"
MAPKY_APP_DIR="/home/gil/Repositories/pubky/mapky/mapky-app"
TESTNET_HS="8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo"
NEXUS_URL="http://localhost:8080"
SESSION="mapky-dev"

echo -e "${GREEN}Starting MapKy Development Environment (testnet)${NC}"
echo "================================================="

# Check prerequisites
for cmd in tmux docker cargo npm; do
    if ! command -v "$cmd" &> /dev/null; then
        echo -e "${RED}Error: $cmd is not installed${NC}"
        exit 1
    fi
done

# Kill existing session
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo -e "${YELLOW}Killing existing $SESSION session...${NC}"
    tmux kill-session -t "$SESSION"
fi

# ---- Step 1: Start Docker infrastructure ----
echo -e "${GREEN}[1/4] Starting Docker infrastructure...${NC}"
cd "$DOCKER_DIR"
docker compose up -d homeserver nexus-neo4j redis postgres pkarr

echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# Verify services
for svc in homeserver nexus-neo4j redis; do
    if ! docker ps --format '{{.Names}}' | grep -q "$svc"; then
        echo -e "${RED}Error: $svc is not running${NC}"
        exit 1
    fi
done
echo -e "${GREEN}Docker services running${NC}"

# ---- Step 2: Clean stale homeservers from Redis ----
echo -e "${GREEN}[2/4] Cleaning stale homeserver data...${NC}"
STALE_COUNT=0
while IFS= read -r key; do
    hs_id="${key#Homeserver:}"
    if [ "$hs_id" != "$TESTNET_HS" ]; then
        docker exec redis redis-cli DEL "$key" > /dev/null 2>&1
        STALE_COUNT=$((STALE_COUNT + 1))
    fi
done < <(docker exec redis redis-cli KEYS "Homeserver:*" 2>/dev/null)

if [ "$STALE_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}Removed $STALE_COUNT stale homeserver(s) from Redis${NC}"
fi

# Reset cursor on testnet homeserver to replay from start
if docker exec redis redis-cli EXISTS "Homeserver:$TESTNET_HS" 2>/dev/null | grep -q "1"; then
    docker exec redis redis-cli JSON.SET "Homeserver:$TESTNET_HS" '.cursor' '"0"' > /dev/null 2>&1
    echo -e "${GREEN}Reset testnet homeserver cursor to 0${NC}"
else
    echo -e "${YELLOW}Testnet homeserver not in Redis yet (will be created on first run)${NC}"
fi

# Clean stale homeservers from Neo4j
docker exec nexus-neo4j cypher-shell -u neo4j -p 12345678 \
    "MATCH (h:Homeserver) WHERE h.id <> '$TESTNET_HS' DETACH DELETE h" > /dev/null 2>&1
echo -e "${GREEN}Cleaned Neo4j stale homeservers${NC}"

# ---- Step 3: Create tmux session ----
echo -e "${GREEN}[3/4] Starting services in tmux...${NC}"
tmux new-session -d -s "$SESSION" -n "nexusd"

# Window 1: nexusd with mapky plugin (testnet config)
tmux send-keys -t "$SESSION:nexusd" "cd $NEXUS_DIR" C-m
tmux send-keys -t "$SESSION:nexusd" "cargo run -p nexusd --features mapky -- -c config-local/testnet" C-m

# Window 2: mapky frontend
tmux new-window -t "$SESSION" -n "mapky-app"
tmux send-keys -t "$SESSION:mapky-app" "cd $MAPKY_APP_DIR" C-m
tmux send-keys -t "$SESSION:mapky-app" "sleep 8 && npm run dev" C-m

# Window 3: commands/logs
tmux new-window -t "$SESSION" -n "commands"
tmux send-keys -t "$SESSION:commands" "cd $MAPKY_APP_DIR" C-m

# ---- Step 4: Print info ----
echo ""
echo -e "${GREEN}[4/4] Environment started in tmux session '$SESSION'${NC}"
echo ""
echo "Services:"
echo "  Homeserver:     http://localhost:6286 (testnet)"
echo "  HTTP Relay:     http://localhost:15412/link"
echo "  Neo4j Browser:  http://localhost:7474 (neo4j/12345678)"
echo "  Redis:          localhost:6379"
echo "  Nexus API:      $NEXUS_URL"
echo "  Swagger:        $NEXUS_URL/swagger-ui/"
echo "  MapKy App:      http://localhost:5173"
echo ""
echo "Tmux Controls:"
echo "  Attach:         tmux attach -t $SESSION"
echo "  Switch windows: Ctrl+b [1-3]"
echo "  Detach:         Ctrl+b d"
echo "  Kill:           tmux kill-session -t $SESSION"
echo ""
echo -e "${YELLOW}Note: In testnet mode, all users are on the local homeserver.${NC}"
echo -e "${YELLOW}The watcher monitors it automatically — no manual ingest needed.${NC}"
echo ""

sleep 1
tmux attach-session -t "$SESSION"
