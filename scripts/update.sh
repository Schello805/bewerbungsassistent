#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="bewerbungsassistent"
APP_DIR="${APP_DIR:-/opt/bewerbungsassistent}"
SERVICE_USER="${SERVICE_USER:-bewerbungsassistent}"
BRANCH="${BRANCH:-main}"
APP_ONLY=false

if [[ "${1:-}" == "--app-only" ]]; then
  APP_ONLY=true
fi

log() { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
success() { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[FEHLER]\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${APP_ONLY}" == true ]]; then
    return
  fi
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Bitte als root ausführen, z. B. mit: sudo bash scripts/update.sh"
  fi
}

check_installation() {
  [[ -d "${APP_DIR}/.git" ]] || fail "Kein Git-Repository gefunden unter ${APP_DIR}. Erst Installation ausführen."
  if [[ "${APP_ONLY}" != true ]]; then
    id "${SERVICE_USER}" >/dev/null 2>&1 || fail "Service-User fehlt: ${SERVICE_USER}"
  fi
  success "Installation gefunden: ${APP_DIR}"
}

update_repository() {
  log "Hole aktuelle Version von GitHub ..."
  git -C "${APP_DIR}" fetch origin "${BRANCH}"
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
  if [[ "${APP_ONLY}" != true ]]; then
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
  fi
  success "Quellcode aktualisiert."
}

install_dependencies_and_build() {
  log "Installiere/aktualisiere Node-Abhängigkeiten ..."
  if [[ "${APP_ONLY}" == true ]]; then
    cd "${APP_DIR}" && npm ci
  else
    runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && npm ci"
  fi
  success "Abhängigkeiten aktuell."

  log "Erstelle neuen Produktionsbuild ..."
  if [[ "${APP_ONLY}" == true ]]; then
    cd "${APP_DIR}" && npm run build
  else
    runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && npm run build"
  fi
  success "Build erfolgreich."
}

health_check() {
  if [[ "${APP_ONLY}" == true ]]; then
    return
  fi

  local port
  port="$(get_service_port)"
  log "Prüfe App-Erreichbarkeit auf http://127.0.0.1:${port}/api/health ..."
  for attempt in {1..30}; do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null; then
      success "Healthcheck erfolgreich."
      return
    fi
    if ! systemctl is-active --quiet "${APP_NAME}.service"; then
      warn "Service ist während des Healthchecks gestoppt. Zeige letzte Logs."
      journalctl -u "${APP_NAME}.service" -n 60 --no-pager || true
      fail "Healthcheck fehlgeschlagen, weil der Service nicht läuft."
    fi
    printf '.'
    sleep 1
    if [[ "${attempt}" -eq 30 ]]; then
      printf '\n'
    fi
  done
  journalctl -u "${APP_NAME}.service" -n 60 --no-pager || true
  fail "Healthcheck fehlgeschlagen. Die App ist nach 30 Sekunden nicht erreichbar."
}

restart_service() {
  if [[ "${APP_ONLY}" == true ]]; then
    success "App-only Update abgeschlossen. Der laufende Serverprozess startet anschließend neu."
    return
  fi
  log "Starte Service neu ..."
  systemctl daemon-reload
  systemctl restart "${APP_NAME}.service"
  sleep 2

  if systemctl is-active --quiet "${APP_NAME}.service"; then
    success "Update abgeschlossen. Service läuft."
  else
    systemctl status "${APP_NAME}.service" --no-pager || true
    fail "Service läuft nach dem Update nicht."
  fi
}

get_service_port() {
  local port=""
  if command -v systemctl >/dev/null 2>&1; then
    port="$(systemctl show "${APP_NAME}.service" -p Environment --value 2>/dev/null | tr ' ' '\n' | awk -F= '$1=="PORT" {print $2}' | tail -1 || true)"
  fi
  printf '%s' "${port:-${PORT:-5173}}"
}

print_summary() {
  local port ip
  port="$(get_service_port)"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  printf '\n'
  printf 'Aktualisierte App: %s\n' "${APP_DIR}"
  printf 'Lokale URL:       http://localhost:%s/\n' "${port}"
  if [[ -n "${ip}" ]]; then
    printf 'Netzwerk-URL:     http://%s:%s/\n' "${ip}" "${port}"
  fi
  if [[ "${APP_ONLY}" != true ]]; then
    printf '\nLogs ansehen:\n  journalctl -u %s -f\n' "${APP_NAME}"
  else
    printf '\nApp-only Update: Der laufende Prozess startet sich über die App neu.\n'
  fi
}

main() {
  log "Starte Update von ${APP_NAME}."
  require_root
  check_installation
  update_repository
  install_dependencies_and_build
  restart_service
  health_check
  print_summary
}

main "$@"
