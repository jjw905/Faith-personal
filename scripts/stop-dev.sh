#!/usr/bin/env bash
# Stop existing Next.js listeners without killing this npm script chain
set +e

if command -v lsof >/dev/null 2>&1; then
  for port in 3000 3001; do
    pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null)
    if [ -n "$pids" ]; then
      kill $pids 2>/dev/null
      sleep 0.3
      kill -9 $pids 2>/dev/null
    fi
  done
fi

exit 0
