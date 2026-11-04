#!/bin/sh
# Vérification du contrôle d'accès sur un site déployé, en lecture seule.
#
#   sh scripts/verifier-acces-production.sh https://garageflow.aaweb.fr
#   GF_COOKIE='gf_session=…' sh scripts/verifier-acces-production.sh https://garageflow.aaweb.fr
#
# Sans cookie : contrôles en visiteur anonyme. Avec GF_COOKIE (session d'un
# compte garage de test, sans rôle plateforme) : contrôles en compte garage.
# Aucune redirection d'authentification n'est suivie : c'est le corps brut de
# chaque réponse qui est inspecté, en document HTML et en flux RSC.
# Aucune écriture : uniquement des GET, et deux POST refusés par conception.
set -u
BASE="${1:-https://garageflow.aaweb.fr}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
# Données qui ne doivent jamais sortir d'une page protégée pour un non-admin (le titre de page, statique, n'en fait pas partie).
SENSIBLE='Revenu mensuel|Garages inscrits|Abonnés actifs|En essai|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'

ok() { printf "PASS  %s\n" "$1"; }
ko() { printf "FAIL  %s\n" "$1"; FAIL=1; }

# get <chemin> <variante: doc|rsc> [cookie] : écrit le corps, renvoie "statut location".
get() {
  path="$1"; variant="$2"; cookie="${3:-}"
  set -- -s -o "$TMP/body" -w "%{http_code} %{redirect_url}" --max-time 20
  [ "$variant" = rsc ] && set -- "$@" -H "RSC: 1"
  [ -n "$cookie" ] && set -- "$@" -H "Cookie: $cookie"
  res=$(curl "$@" "$BASE$path")
  # Rebond technique de Next vers « ?_rsc=… » (même chemin) : suivi pour lire la vraie charge RSC.
  case "$res" in
    "307 "*"_rsc"*) url=${res#307 }; res=$(curl "$@" "$url") ;;
  esac
  printf "%s" "$res"
}

check_redirect() {
  label="$1"; path="$2"; cookie="$3"; expect_to="$4"
  for v in doc rsc; do
    res=$(get "$path" "$v" "$cookie")
    status=${res%% *}; loc=${res#* }
    # Redirection HTTP 307, ou, pour une requête RSC, redirection inscrite dans la charge (NEXT_REDIRECT).
    redirected=0
    if [ "$status" = 307 ] && printf "%s" "$loc" | grep -q "$expect_to"; then redirected=1; fi
    if [ "$v" = rsc ] && [ "$status" = 200 ] && grep -q "NEXT_REDIRECT;[a-z]*;$expect_to" "$TMP/body"; then redirected=1; fi
    if [ "$redirected" = 1 ] && ! grep -Eq "$SENSIBLE" "$TMP/body"; then
      ok "$label $path ($v) -> $status $expect_to, corps sans donnée"
    else
      ko "$label $path ($v) -> $status $loc ; donnée trouvée : $(grep -Eo "$SENSIBLE" "$TMP/body" | head -1)"
    fi
  done
}

echo "== Visiteur anonyme ($BASE)"
for p in /admin "/admin?q=a" /app/atelier /app/clients /app/vehicules /app/dossiers /app/equipe /app/parametres /app/abonnement /app/dossiers/new; do
  check_redirect "anonyme" "$p" "" "/login"
done

res=$(get /api/export doc)
[ "${res%% *}" = 401 ] && ! grep -Eq "$SENSIBLE" "$TMP/body" && ok "anonyme /api/export -> 401" || ko "anonyme /api/export -> ${res%% *}"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X POST "$BASE/api/upload")
[ "$code" = 403 ] && ok "anonyme POST /api/upload -> 403" || ko "anonyme POST /api/upload -> $code"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/api/files/inexistant.jpg")
case "$code" in 403|404) ok "anonyme /api/files sans signature -> $code" ;; *) ko "anonyme /api/files sans signature -> $code" ;; esac
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X POST "$BASE/api/stripe/webhook")
[ "$code" = 400 ] && ok "POST /api/stripe/webhook sans signature -> 400" || ko "POST /api/stripe/webhook sans signature -> $code"

if [ -n "${GF_COOKIE:-}" ]; then
  echo "== Compte garage sans rôle plateforme"
  check_redirect "garage" /admin "$GF_COOKIE" "/app/atelier"
  check_redirect "garage" "/admin?q=a" "$GF_COOKIE" "/app/atelier"
else
  echo "(GF_COOKIE absent : contrôles en compte garage non exécutés)"
fi

[ "$FAIL" = 0 ] && echo "Résultat : tout est bloqué." || echo "Résultat : AU MOINS UN CONTRÔLE ÉCHOUE."
exit "$FAIL"
