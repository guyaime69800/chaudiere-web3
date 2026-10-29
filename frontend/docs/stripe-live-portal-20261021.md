# Portail client : raccordement préparé le 21 octobre 2026

## Vérification distante après enregistrement des liens

Déploiement isolé `dpl_3LiMAi3QK5cFjQCK2UvNRJK82XUT` READY : https://carnetpass-jpnd8qj4n-chaudiere-web3.vercel.app. Audit Stripe en lecture seule réussi pour le compte, la configuration par défaut, les fonctionnalités, l'annulation en fin de période et les champs client. Les liens juridiques hérités restent null dans l'API ; ils sont confirmés par la capture utilisateur du portail montrant les deux URLs attendues. Le contrôle initial trop strict a été corrigé : null signifie non vérifiable par cette API ; une URL explicite incorrecte reste bloquante.

Contrôles HTTP réussis : portail et achats fermés (503), webhook fermé (503), cron et administration sans authentification refusés (401), page publique 200 et espace professionnel en maintenance 503. Aucun domaine public promu, aucun interrupteur activé. Le parcours authentifié créant une véritable session de portail reste non testé ; aucun client réel n'a été créé pour cette vérification.

Le bouton « Gérer mon abonnement » utilise deux actions dédiées de `/api/billing` : `portal-status` (GET) et `portal` (POST). Aucun identifiant client transmis par le navigateur n'est utilisé. L'utilisateur confirmé et sa double authentification sont contrôlés, puis son appartenance unique et son rôle owner/admin. Le client Stripe provient uniquement de `stripe_live_customers` pour cette entreprise et ce compte Stripe.

Le portail nécessite `CARNETPASS_STRIPE_LIVE_PORTAL_ENABLED=true` ainsi que les interrupteurs webhook et traitement. L'interrupteur des achats reste indépendant. Aucun interrupteur ni variable distante n'a été modifié pendant cette étape.

Avant de créer la session : vérification du compte, du client live et de la configuration active par défaut. Annulation en fin de période obligatoire ; changement de formule et lien public de connexion désactivés ; factures et mise à jour du paiement activées. Configuration explicitement attachée à la session, retour imposé à `/parametres-compte`, URL Stripe vérifiée. Aucun abonnement actif n'est exigé pour permettre la gestion d'un compte impayé ou résilié.

Vérification locale : 8 tests Node réussis (portail, achats et factures), ESLint réussi et build réussi avec une clé publique factice de compilation. Ce build n'est pas un test authentifié connecté à Supabase. Aucun client Stripe réel ni session réelle créé. Aucun déploiement réalisé pour cette modification. La configuration effective Stripe et le parcours authentifié restent à vérifier avant activation.
