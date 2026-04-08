#!/bin/bash

# Start MapKy development environment connected to staging homeservers
# Usage: ./scripts/start-mapky-staging.sh
#
# Services started:
#   Docker: Neo4j, Redis (no local homeserver — uses remote staging)
#   Native: nexusd (with mapky plugin, staging config)
#   Native: mapky-app dev server
#
# This mode connects to real staging homeservers via mainline DHT.
# User signup happens on the staging homeserver, not locally.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOCKER_DIR="/home/gil/Repositories/pubky/pubky-docker"
NEXUS_DIR="/home/gil/Repositories/pubky/pubky-nexus"
MAPKY_APP_DIR="/home/gil/Repositories/pubky/mapky/mapky-app"
NEXUS_URL="http://localhost:8080"
SESSION="mapky-dev"

echo -e "${GREEN}Starting MapKy Development Environment (staging)${NC}"
echo "================================================="

for cmd in tmux docker cargo npm; do
    if ! command -v "$cmd" &> /dev/null; then
        echo -e "${RED}Error: $cmd is not installed${NC}"
        exit 1
    fi
done

if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo -e "${YELLOW}Killing existing $SESSION session...${NC}"
    tmux kill-session -t "$SESSION"
fi

# ---- Step 1: Start Docker infrastructure (databases only) ----
echo -e "${GREEN}[1/3] Starting Docker databases...${NC}"
cd "$DOCKER_DIR"
docker compose up -d nexus-neo4j redis

echo -e "${YELLOW}Waiting for Neo4j and Redis...${NC}"
sleep 5

for svc in nexus-neo4j redis; do
    if ! docker ps --format '{{.Names}}' | grep -q "$svc"; then
        echo -e "${RED}Error: $svc is not running${NC}"
        exit 1
    fi
done
echo -e "${GREEN}Databases running${NC}"

# ---- Step 2: Create tmux session ----
echo -e "${GREEN}[2/3] Starting services in tmux...${NC}"
tmux new-session -d -s "$SESSION" -n "nexusd"

# Window 1: nexusd with mapky plugin (staging config)
tmux send-keys -t "$SESSION:nexusd" "cd $NEXUS_DIR" C-m
tmux send-keys -t "$SESSION:nexusd" "cargo run -p nexusd --features mapky -- -c config-local/staging" C-m

# Window 2: mapky frontend (needs staging env vars)
tmux new-window -t "$SESSION" -n "mapky-app"
tmux send-keys -t "$SESSION:mapky-app" "cd $MAPKY_APP_DIR" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo 'Using staging env — update .env if needed:'" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo '  VITE_PUBKY_ENV=staging'" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo '  VITE_PUBKY_HOMESERVER=ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo '  VITE_PUBKY_RELAY=https://httprelay.staging.pubky.app/link'" C-m
tmux send-keys -t "$SESSION:mapky-app" "sleep 8 && npm run dev" C-m

# Window 3: commands
tmux new-window -t "$SESSION" -n "commands"
tmux send-keys -t "$SESSION:commands" "cd $MAPKY_APP_DIR" C-m

# ---- Step 3: Print info ----
echo ""
echo -e "${GREEN}[3/3] Environment started in tmux session '$SESSION'${NC}"
echo ""
echo "Services:"
echo "  Neo4j Browser:  http://localhost:7474 (neo4j/12345678)"
echo "  Redis:          localhost:6379"
echo "  Nexus API:      $NEXUS_URL"
echo "  Swagger:        $NEXUS_URL/swagger-ui/"
echo "  MapKy App:      http://localhost:5173"
echo ""
echo -e "${YELLOW}Staging mode: connects to real homeservers via DHT.${NC}"
echo -e "${YELLOW}Homeserver: ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy${NC}"
echo -e "${YELLOW}User login/signup triggers ingest automatically via the app.${NC}"
echo ""
echo "Tmux Controls:"
echo "  Attach:         tmux attach -t $SESSION"
echo "  Switch windows: Ctrl+b [1-3]"
echo "  Detach:         Ctrl+b d"
echo "  Kill:           tmux kill-session -t $SESSION"
echo ""

sleep 1
tmux attach-session -t "$SESSION"
