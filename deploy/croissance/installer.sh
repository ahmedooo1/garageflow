#!/bin/sh
# Tâches planifiées de la prospection sur le VPS (systemd), à lancer en root
# depuis une copie du dépôt :
#
#   sudo sh deploy/croissance/installer.sh              installe et vérifie, sans rien planifier
#   sudo sh deploy/croissance/installer.sh --activer    puis planifie les cinq tâches
#   sudo sh deploy/croissance/installer.sh --desactiver arrête la planification
#
# Le secret GROWTH_CRON_SECRET est lu dans /var/www/garageflow/.env et n'est
# jamais affiché. La vérification finale lance une simulation (`score`,
# --dry-run) qui n'écrit qu'une ligne d'exécution dans la base.
# Aucune tâche n'envoie de message à un prospect.
set -eu
[ "$(id -u)" = 0 ] || { echo "À lancer en root (sudo)." >&2; exit 1; }
ICI=$(cd "$(dirname "$0")" && pwd)
APP=/var/www/garageflow
JOBS="discovery enrich score drafts weekly-report"
TIMERS=""
for j in $JOBS; do TIMERS="$TIMERS garageflow-growth-$j.timer"; done

if [ "${1:-}" = "--desactiver" ]; then
  # shellcheck disable=SC2086
  systemctl disable --now $TIMERS
  echo "Planification arrêtée. Aucune tâche ne sera plus lancée automatiquement."
  exit 0
fi

# 1. Compte de service, sans shell ni répertoire personnel.
id garageflow-growth >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin garageflow-growth

# 2. Secret partagé avec l'application.
secret=$(sed -n 's/^GROWTH_CRON_SECRET=//p' "$APP/.env" | tail -n 1 | tr -d "\"'")
if [ "${#secret}" -lt 32 ]; then
  cat >&2 <<EOF
GROWTH_CRON_SECRET absent de $APP/.env, ou de moins de 32 caractères. Pour le créer sans l'afficher :
  umask 077; printf 'GROWTH_CRON_SECRET=%s\n' "\$(openssl rand -hex 32)" >> $APP/.env
Puis faites-le passer au service « app » de $APP/docker-compose.yml (ligne
« GROWTH_CRON_SECRET: \${GROWTH_CRON_SECRET} » sous environment, sauf si le service lit déjà .env),
relancez : cd $APP && docker compose up -d --no-deps app
et relancez ce script.
EOF
  exit 2
fi
install -d -m 750 -o root -g garageflow-growth /etc/garageflow-growth
# printf est interne au shell : le secret n'apparaît dans aucune ligne de commande.
(umask 027; printf 'Authorization: Bearer %s\n' "$secret" >/etc/garageflow-growth/auth.header)
unset secret
chown root:garageflow-growth /etc/garageflow-growth/auth.header
chmod 640 /etc/garageflow-growth/auth.header

# 3. L'application voit-elle le secret ? (test dans le conteneur, rien n'est affiché)
if ! (cd "$APP" && docker compose exec -T app sh -c '[ "${#GROWTH_CRON_SECRET}" -ge 32 ]'); then
  echo "Le conteneur « app » ne reçoit pas GROWTH_CRON_SECRET : voir l'étape 2 ci-dessus (docker-compose.yml)." >&2
  exit 3
fi

# 4. Script et unités.
install -m 755 -o root -g root "$ICI/garageflow-growth" /usr/local/bin/garageflow-growth
install -m 644 -o root -g root "$ICI/garageflow-growth@.service" /etc/systemd/system/
for t in $TIMERS; do install -m 644 -o root -g root "$ICI/$t" /etc/systemd/system/; done
systemctl daemon-reload

# 5. Vérification de bout en bout, avec le compte de service : simulation sans écriture métier.
echo "Simulation « score » (compte de service) :"
if ! runuser -u garageflow-growth -- /usr/local/bin/garageflow-growth score --dry-run; then
  echo "" >&2
  echo "Échec : 401 = secret différent entre .env et le conteneur ; 404 = secret absent du conteneur ; connexion refusée = application arrêtée." >&2
  exit 4
fi
echo ""

if [ "${1:-}" = "--activer" ]; then
  # shellcheck disable=SC2086
  systemctl enable --now $TIMERS
  echo "Planification active :"
else
  echo "Installé, rien n'est planifié. Pour activer : sudo sh $0 --activer"
fi
systemctl list-timers --all 'garageflow-growth-*' --no-pager
