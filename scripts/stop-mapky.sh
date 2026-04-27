#!/bin/bash
#
# Stop MapKy dev environment.
# Thin wrapper over pubky/scripts/nexus-stack.sh.

SESSION="mapky-dev"
NEXUS_STACK="/home/gil/Repositories/pubky/scripts/nexus-stack.sh"

"$NEXUS_STACK" stop --session "$SESSION"
