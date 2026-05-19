#!/bin/bash

set -euo pipefail

exec /home/gil/Repositories/pubky/scripts/start-pubky-dev.sh \
  --session mapky-dev \
  --apps mapky \
  --attach
