#!/bin/bash
#
# Start MapKy dev environment against real staging homeservers (DHT).
# Thin wrapper over pubky/scripts/nexus-stack.sh.
#
# Starts: neo4j + redis + nexusd (--features mapky, staging config) + mapky-app dev server.
# No local homeserver — signup/login go through the staging homeserver via mainline DHT.

set -e

SESSION="mapky-dev"
NEXUS_STACK="/home/gil/Repositories/pubky/scripts/nexus-stack.sh"
MAPKY_APP_DIR="/home/gil/Repositories/pubky/mapky/mapky-app"

"$NEXUS_STACK" start \
    --plugin mapky \
    --mode staging \
    --config config-local/staging \
    --session "$SESSION"

# Add the frontend window.
tmux new-window -t "$SESSION" -n "mapky-app"
tmux send-keys -t "$SESSION:mapky-app" "cd $MAPKY_APP_DIR" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo 'Staging env vars expected in .env:'" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo '  VITE_PUBKY_ENV=staging'" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo '  VITE_PUBKY_HOMESERVER=ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'" C-m
tmux send-keys -t "$SESSION:mapky-app" "echo '  VITE_PUBKY_RELAY=https://httprelay.staging.pubky.app/link'" C-m
tmux send-keys -t "$SESSION:mapky-app" "sleep 8 && npm run dev" C-m

# Commands window.
tmux new-window -t "$SESSION" -n "commands"
tmux send-keys -t "$SESSION:commands" "cd $MAPKY_APP_DIR" C-m

tmux select-window -t "$SESSION:nexusd"

echo ""
echo "MapKy App will be at: http://localhost:5173"
echo "Staging mode: DHT-connected homeservers (ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy)"
echo ""
sleep 1
tmux attach-session -t "$SESSION"
