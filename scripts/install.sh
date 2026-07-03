#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="bewerbungsassistent"
REPO_URL="${REPO_URL:-https://github.com/Schello805/bewerbungsassistent.git}"
APP_DIR="${APP_DIR:-/opt/bewerbungsassistent}"
SERVICE_USER="${SERVICE_USER:-bewerbungsassistent}"
PORT="${PORT:-5173}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

log() { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
success() { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[FEHLER]\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Bitte als root ausführen, z. B. mit: sudo bash scripts/install.sh"
  fi
}

detect_os() {
  if [[ ! -r /etc/os-release ]]; then
    fail "Dieses Installationsscript erwartet Debian 13 oder Ubuntu 24.04."
  fi
  # shellcheck disable=SC1091
  source /etc/os-release
  case "${ID}:${VERSION_ID}" in
    debian:13|ubuntu:24.04) success "Unterstütztes System erkannt: ${PRETTY_NAME}" ;;
    *) warn "Nicht ausdrücklich getestetes System: ${PRETTY_NAME}. Fortsetzung auf eigenes Risiko." ;;
  esac
}

install_base_packages() {
  log "Aktualisiere Paketlisten ..."
  apt-get update

  log "Installiere Basispakete ..."
  apt-get install -y ca-certificates curl git gnupg build-essential
  success "Basispakete installiert."
}

install_nodejs() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "${major}" -ge 20 ]]; then
      success "Node.js ist bereits installiert: $(node --version)"
      return
    fi
    warn "Vorhandene Node.js-Version ist zu alt: $(node --version). Installiere Node.js ${NODE_MAJOR}."
  else
    log "Node.js ist noch nicht installiert. Installiere Node.js ${NODE_MAJOR}."
  fi

  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  success "Node.js installiert: $(node --version), npm $(npm --version)"
}

create_service_user() {
  if id "${SERVICE_USER}" >/dev/null 2>&1; then
    success "Service-User existiert bereits: ${SERVICE_USER}"
  else
    log "Erstelle Systemuser: ${SERVICE_USER}"
    useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
    success "Service-User erstellt."
  fi
}

prepare_app_directory() {
  mkdir -p "$(dirname "${APP_DIR}")"

  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Repository existiert bereits. Aktualisiere main ..."
    git -C "${APP_DIR}" fetch origin main
    git -C "${APP_DIR}" checkout main
    git -C "${APP_DIR}" pull --ff-only origin main
  elif [[ -e "${APP_DIR}" ]]; then
    fail "Zielpfad existiert bereits, ist aber kein Git-Repository: ${APP_DIR}"
  else
    log "Klonen von ${REPO_URL} nach ${APP_DIR} ..."
    git clone "${REPO_URL}" "${APP_DIR}"
  fi

  mkdir -p "${APP_DIR}/datenbasis" "${APP_DIR}/anschreiben" "${APP_DIR}/data"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
  success "App-Verzeichnis vorbereitet: ${APP_DIR}"
}

install_app_dependencies() {
  log "Installiere Node-Abhängigkeiten mit npm ci ..."
  runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && npm ci"
  success "Node-Abhängigkeiten installiert."

  log "Erstelle Produktionsbuild ..."
  runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && npm run build"
  success "Produktionsbuild erstellt."
}

write_systemd_service() {
  log "Schreibe systemd-Service: ${SERVICE_FILE}"
  cat > "${SERVICE_FILE}" <<SERVICE
[Unit]
Description=Bewerbungsassistent
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable "${APP_NAME}.service"
  success "systemd-Service eingerichtet."
}

start_service() {
  log "Starte ${APP_NAME} ..."
  systemctl restart "${APP_NAME}.service"
  sleep 2

  if systemctl is-active --quiet "${APP_NAME}.service"; then
    success "Service läuft."
  else
    systemctl status "${APP_NAME}.service" --no-pager || true
    fail "Service konnte nicht gestartet werden."
  fi
}

health_check() {
  log "Prüfe App-Erreichbarkeit auf http://127.0.0.1:${PORT}/api/health ..."
  for attempt in {1..30}; do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
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

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  success "Installation abgeschlossen."
  printf '\n'
  printf 'App-Verzeichnis: %s\n' "${APP_DIR}"
  printf 'Service:         %s.service\n' "${APP_NAME}"
  printf 'Lokale URL:      http://localhost:%s/\n' "${PORT}"
  if [[ -n "${ip}" ]]; then
    printf 'Netzwerk-URL:    http://%s:%s/\n' "${ip}" "${PORT}"
  fi
  printf '\nNützliche Befehle:\n'
  printf '  systemctl status %s --no-pager\n' "${APP_NAME}"
  printf '  journalctl -u %s -f\n' "${APP_NAME}"
  printf '  bash %s/scripts/update.sh\n' "${APP_DIR}"
}

main() {
  log "Starte Installation von ${APP_NAME}."
  require_root
  detect_os
  install_base_packages
  install_nodejs
  create_service_user
  prepare_app_directory
  install_app_dependencies
  write_systemd_service
  start_service
  health_check
  print_summary
}

main "$@"
