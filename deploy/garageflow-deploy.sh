#!/bin/sh
# Déploiement de GarageFlow sur le VPS, appelé par GitHub Actions.
#
# Installé dans /usr/local/bin/garageflow-deploy et lié à la clé SSH de
# déploiement par une commande forcée dans ~/.ssh/authorized_keys :
#
#   restrict,command="/usr/local/bin/garageflow-deploy" ssh-ed25519 AAAA... github-actions-deploy-garageflow
#
# La clé ne peut donc rien faire d'autre que lancer ce script : pas de shell,
# pas de redirection de port. Le seul argument accepté est le SHA du commit
# (SSH_ORIGINAL_COMMAND), l'image arrive compressée sur l'entrée standard.
#
# Étapes : chargement de l'image, bascule du tag dans .env, redémarrage du
# conteneur, vérification HTTP. En cas d'échec, retour au tag précédent.
set -eu

DIR=/var/www/garageflow
LOG="$DIR/deploy.log"
PORT=3031
# Une image décompressée pèse ~2,3 Go ; on garde la précédente pour le retour arrière.
MIN_FREE_KB=4000000

log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }

SHA="${SSH_ORIGINAL_COMMAND:-}"
case "$SHA" in
  "" | *[!0-9a-f]*) echo "Commande refusée : un SHA de commit est attendu." >&2; exit 2 ;;
esac
[ "${#SHA}" -eq 40 ] || { echo "Commande refusée : SHA de 40 caractères attendu." >&2; exit 2; }

# Deux déploiements simultanés se marcheraient dessus dans .env.
exec 9>/tmp/garageflow-deploy.lock
flock -n 9 || { echo "Un déploiement est déjà en cours." >&2; exit 3; }

cd "$DIR"
PREV=$(sed -n 's/^GARAGEFLOW_TAG=//p' .env)
log "début ${SHA} (actuel : ${PREV:-aucun})"

LIBRE=$(df --output=avail -k / | tail -1 | tr -d ' ')
if [ "$LIBRE" -lt "$MIN_FREE_KB" ]; then
  log "échec : espace disque insuffisant (${LIBRE} Ko libres)"
  exit 4
fi

gunzip -c | docker load >/dev/null
docker image inspect "garageflow:${SHA}" >/dev/null 2>&1 || { log "échec : image garageflow:${SHA} absente après chargement"; exit 5; }

set_tag() { sed -i "s/^GARAGEFLOW_TAG=.*/GARAGEFLOW_TAG=$1/" .env; }

# Le conteneur applique les migrations puis démarre Next : on attend que
# l'accueil et la connexion répondent réellement avant de valider.
repond() {
  i=0
  while [ "$i" -lt 45 ]; do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/" && curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/login"; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  return 1
}

set_tag "$SHA"
# Un échec ici est traité comme un échec de vérification : retour arrière.
docker compose up -d app >/dev/null 2>&1 || true

if repond; then
  log "succès ${SHA}"
else
  log "échec : ${SHA} ne répond pas, retour à ${PREV}"
  docker compose logs --tail 40 app >>"$LOG" 2>&1 || true
  if [ -n "$PREV" ]; then
    set_tag "$PREV"
    docker compose up -d app >/dev/null 2>&1
    # Une migration déjà appliquée par la nouvelle version n'est pas annulée :
    # les migrations doivent rester compatibles avec la version précédente.
    repond && log "retour arrière effectué sur ${PREV}" || log "ALERTE : ${PREV} ne répond pas non plus"
  fi
  exit 1
fi

# Ménage : on ne garde que la version en ligne et la précédente.
docker images garageflow --format '{{.Tag}}' | while read -r tag; do
  [ "$tag" = "$SHA" ] || [ "$tag" = "$PREV" ] || docker rmi "garageflow:${tag}" >/dev/null 2>&1 || true
done
docker image prune -f >/dev/null 2>&1 || true
