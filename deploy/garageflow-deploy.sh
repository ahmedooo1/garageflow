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
# Périmètre : uniquement le projet Compose de /var/www/garageflow, le service
# « app », et les images nommées « garageflow ». Aucune commande ne supprime
# de volume ni ne modifie la base, hormis les migrations appliquées par
# l'application elle-même au démarrage.
set -eu
# Journal et sauvegardes lisibles par le seul propriétaire.
umask 077

DIR=/var/www/garageflow
LOG="$DIR/deploy.log"
BACKUPS="$DIR/backups"
PORT=3031
# Une image décompressée pèse ~2,3 Go ; on garde la précédente pour le retour arrière.
MIN_FREE_KB=4000000
BACKUPS_GARDEES=5

log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }

SHA="${SSH_ORIGINAL_COMMAND:-}"
case "$SHA" in
  "" | *[!0-9a-f]*) echo "Commande refusée : un SHA de commit est attendu." >&2; exit 2 ;;
esac
[ "${#SHA}" -eq 40 ] || { echo "Commande refusée : SHA de 40 caractères attendu." >&2; exit 2; }

# Un deuxième déploiement attend la fin du premier (20 min au plus) au lieu
# de modifier .env en même temps que lui.
exec 9>/tmp/garageflow-deploy.lock
flock -w 1200 9 || { echo "Un autre déploiement occupe le verrou depuis 20 min, abandon." >&2; exit 3; }

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

# Sauvegarde de la base avant que la nouvelle version n'applique ses
# migrations. Lecture seule sur la base ; jamais restaurée automatiquement.
mkdir -p "$BACKUPS"
DUMP="$BACKUPS/avant-${SHA}.dump"
if ! docker compose exec -T db pg_dump -U garageflow -Fc garageflow >"$DUMP" 2>>"$LOG"; then
  rm -f "$DUMP"
  log "échec : sauvegarde de la base impossible, rien n'a été changé"
  exit 6
fi
log "sauvegarde $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))"
# On ne garde que les dernières sauvegardes, dans ce dossier uniquement.
ls -1t "$BACKUPS"/avant-*.dump 2>/dev/null | tail -n +$((BACKUPS_GARDEES + 1)) | while read -r ancien; do
  rm -f "$ancien"
done

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

# --no-deps : seul le conteneur de l'application est recréé, jamais la base.
relancer_app() { docker compose up -d --no-deps app >/dev/null 2>&1 || true; }

set_tag "$SHA"
relancer_app

if repond; then
  log "succès ${SHA}"
else
  log "échec : ${SHA} ne répond pas, retour à ${PREV}"
  if [ -n "$PREV" ]; then
    # Retour arrière = ancienne image seulement. La base reste telle quelle :
    # les migrations doivent donc être compatibles avec la version précédente
    # (vérifié en CI par scripts/verifier-migrations.mjs). En cas de besoin,
    # restauration manuelle depuis la sauvegarde ci-dessus.
    set_tag "$PREV"
    relancer_app
    if repond; then log "retour arrière effectué sur ${PREV}"; else log "ALERTE : ${PREV} ne répond pas non plus"; fi
  fi
  exit 1
fi

# Ménage : uniquement les images « garageflow », sauf la version en ligne et
# la précédente. Aucun nettoyage global de Docker.
docker images garageflow --format '{{.Tag}}' | while read -r tag; do
  [ "$tag" = "$SHA" ] || [ "$tag" = "$PREV" ] || docker rmi "garageflow:${tag}" >/dev/null 2>&1 || true
done
