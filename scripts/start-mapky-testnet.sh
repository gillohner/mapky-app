#!/bin/bash
#
# Start MapKy dev environment against the local testnet.
# Thin wrapper over pubky/scripts/nexus-stack.sh.
#
# Starts: docker infra + nexusd (--features mapky, testnet config) + mapky-app dev server.

set -e

SESSION="mapky-dev"
NEXUS_STACK="/home/gil/Repositories/pubky/scripts/nexus-stack.sh"
MAPKY_APP_DIR="/home/gil/Repositories/pubky/mapky/mapky-app"

"$NEXUS_STACK" start \
    --plugin mapky \
    --mode testnet \
    --reset-cursor \
    --session "$SESSION"

# Add the frontend window to the same tmux session.
tmux new-window -t "$SESSION" -n "mapky-app"
tmux send-keys -t "$SESSION:mapky-app" "cd $MAPKY_APP_DIR" C-m
tmux send-keys -t "$SESSION:mapky-app" "sleep 8 && npm run dev" C-m

# Commands window for ad-hoc use.
tmux new-window -t "$SESSION" -n "commands"
tmux send-keys -t "$SESSION:commands" "cd $MAPKY_APP_DIR" C-m

tmux select-window -t "$SESSION:nexusd"

echo ""
echo "MapKy App will be at: http://localhost:5173"
echo ""
sleep 1
tmux attach-session -t "$SESSION"
