#!/usr/bin/env bash
#
# manage.sh — start/stop/restart the built app behind a load balancer
#
# Usage:
#   ./manage.sh start [PORT]
#   ./manage.sh stop [PORT]
#   ./manage.sh restart [PORT]
#   ./manage.sh status
#   ./manage.sh logs [PORT]
#
# Configuration (env vars override the defaults below):
#   PORT=8081 ./manage.sh start
#   HOST=127.0.0.1 PORT=8081 ./manage.sh start
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_NAME="luma-middleware-hub"

# Port the instance listens on. Give each instance behind the load balancer
# its own port, e.g. ./manage.sh start 8081 / 8082 / 8083
PORT="${PORT:-8080}"

# Bind address. 0.0.0.0 = reachable from the load balancer on another host.
# Use 127.0.0.1 if the load balancer runs on this machine.
HOST="${HOST:-0.0.0.0}"

# Base path if the load balancer mounts the app under a sub-path (e.g. /hub/).
BASE_PATH="${BASE_PATH:-/}"

DIST_DIR="dist"
RUN_DIR="${RUN_DIR:-.run}"
LOG_DIR="${LOG_DIR:-logs}"
# ---------------------------------------------------------------------------

# Optional local overrides, not in git: PORT=8082 etc.
[[ -f .env.deploy ]] && source .env.deploy

# Positional port argument wins over env/default.
CMD="${1:-}"
[[ -n "${2:-}" ]] && PORT="$2"

PID_FILE="$RUN_DIR/$APP_NAME-$PORT.pid"
LOG_FILE="$LOG_DIR/$APP_NAME-$PORT.log"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid; pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

current_pid() { cat "$PID_FILE" 2>/dev/null || true; }

start() {
  if is_running; then
    warn "$APP_NAME already running on port $PORT (pid $(current_pid))"
    return 0
  fi
  rm -f "$PID_FILE"

  [[ -f "$DIST_DIR/index.html" ]] || die "no build found — run ./build.sh first"

  mkdir -p "$RUN_DIR" "$LOG_DIR"

  log "Starting $APP_NAME on $HOST:$PORT (base $BASE_PATH)"
  nohup npx vite preview \
      --host "$HOST" \
      --port "$PORT" \
      --strictPort \
      --base "$BASE_PATH" \
      >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  # Give it a moment to bind, then verify it actually came up.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.5
    is_running || break
    if curl -sf -o /dev/null "http://127.0.0.1:$PORT$BASE_PATH"; then
      log "Started (pid $(current_pid)) — http://$HOST:$PORT$BASE_PATH"
      log "Logs: $LOG_FILE"
      return 0
    fi
  done

  if is_running; then
    warn "Process is up (pid $(current_pid)) but did not answer HTTP yet — check $LOG_FILE"
    return 0
  fi
  rm -f "$PID_FILE"
  die "failed to start — see $LOG_FILE"
}

stop() {
  if ! is_running; then
    warn "$APP_NAME is not running on port $PORT"
    rm -f "$PID_FILE"
    return 0
  fi
  local pid; pid="$(current_pid)"
  log "Stopping $APP_NAME on port $PORT (pid $pid)"
  kill "$pid" 2>/dev/null || true

  for _ in $(seq 1 20); do
    is_running || break
    sleep 0.5
  done

  if is_running; then
    warn "Did not exit gracefully — sending SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.5
  fi

  rm -f "$PID_FILE"
  log "Stopped"
}

status() {
  mkdir -p "$RUN_DIR"
  local found=0
  shopt -s nullglob
  for pf in "$RUN_DIR/$APP_NAME-"*.pid; do
    found=1
    local port pid state
    port="$(basename "$pf" .pid)"; port="${port##*-}"
    pid="$(cat "$pf" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      state="running"
    else
      state="stale pidfile"
    fi
    printf 'port %-6s pid %-8s %s\n' "$port" "${pid:--}" "$state"
  done
  shopt -u nullglob
  [[ "$found" -eq 1 ]] || echo "no instances registered"
}

logs() {
  [[ -f "$LOG_FILE" ]] || die "no log file at $LOG_FILE"
  tail -f "$LOG_FILE"
}

case "$CMD" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; start ;;
  status)  status ;;
  logs)    logs ;;
  ""|-h|--help) sed -n '2,16p' "$0"; exit 0 ;;
  *) die "unknown command: $CMD (use start|stop|restart|status|logs)" ;;
esac
