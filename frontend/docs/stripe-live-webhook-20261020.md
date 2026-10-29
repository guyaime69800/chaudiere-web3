# Webhook Stripe réel : réception préparée, non activée

## Fait

- `/api/stripe-webhook` conserve son gestionnaire Preview et délègue en production au nouveau gestionnaire live.
- Lecture du corps brut limitée à 256 Kio avant concaténation ; HMAC SHA-256, comparaison constante,
  horodatage de livraison à ±300 secondes et prise en charge de plusieurs signatures pendant une rotation.
- Rejet du mode test, des événements Connect d'un autre compte et des contextes d'organisation.
- Production uniquement, branche main, base de production exacte, activation explicite et secret dédiés requis.
- Journal Supabase privé : identifiant de compte, événement, objet, type, version API et horodatage.
  Pas de corps Stripe complet, adresse, email, donnée de carte ni secret stocké dans ce journal.
- RPC réservée au service, RLS activée, aucun accès anon/authenticated. Un doublon n'ajoute pas de ligne.
  Une identité contradictoire pour le même événement échoue. Un échec SQL renvoie 503 à Stripe.
- Réponse 200 seulement après enregistrement durable, ou pour un type d'événement non pris en charge.

## Limites et état d'activation

Cette étape journalise les notifications et laisse leur statut `pending`.
Elle n'attribue PAS encore d'abonnement, de siège ou de crédit.
Le traitement doit relire les objets Stripe et utiliser une liaison serveur entre entreprise,
client, commande et abonnement ; les métadonnées du webhook ne suffisent pas à accorder un droit.
Le consommateur durable, son mécanisme de reprise et l'attribution atomique restent à implémenter.
Ne pas activer la réception en production ni ouvrir les paiements avant ce raccordement.

Migration générée avec le CLI officiel Supabase :
`supabase/migrations/20261020164021_stripe_live_event_inbox.sql`.
Testée sur PostgreSQL embarqué PGlite, puis appliquée le 20 octobre au projet
`tsyukqcyfxcrjrhopvpv` (CarnetPass Production Paris 2). Historique enregistré avec
`migration repair 20261020164021 --status applied`, après application explicite du seul fichier SQL.
Aucune nouvelle destination Stripe, variable Vercel ou promotion n'a été créée pour cette étape.

Vérification réelle : RLS active, anon sans lecture, authenticated sans écriture ni exécution
de la RPC, service_role autorisé. Test d'insertion, doublon et conflit exécuté avec une
notification synthétique dans une transaction entièrement annulée ; aucun événement client créé.

Le problème de transport du CLI a été résolu en donnant à son runtime les certificats
publics du magasin de confiance Windows via `SSL_CERT_FILE`, sans désactiver TLS ni extraire de secret.
Le contrôle Supabase Advisors ne signale pas le journal ou sa RPC. Son rapport complet
`stripe-live-supabase-advisors-20261020.json` contient des avertissements sur des fonctions existantes
SECURITY DEFINER et la protection des mots de passe compromis ; ces fonctions n'ont pas été modifiées.

Déploiement isolé prêt : `dpl_DGBMqwQuhgpFBoCf7qfqZjUrPK1v`,
`https://carnetpass-6ukgztefr-chaudiere-web3.vercel.app`.
POST sans signature : 503 LIVE_WEBHOOK_UNAVAILABLE (configuration volontairement désactivée).
Administration anonyme : 401. Espace pro du domaine public : 503 de maintenance.
Le domaine public n'a pas été promu vers ce déploiement.

## Configuration ultérieure (pas encore à activer)

- Destination Stripe : événements Snapshot du compte de production, URL
  `https://www.carnetpass.fr/api/stripe-webhook`.
- Secret de signature de cette destination : `STRIPE_LIVE_WEBHOOK_SECRET`, Secret Vercel,
  Production uniquement. Ce secret `whsec_…` est distinct de la clé API `rk_live_…`.
- `CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED=true` seulement après migration, traitement et tests.
- `STRIPE_EXPECTED_ACCOUNT_ID` et `SUPABASE_SECRET_KEY` déjà prévus ; aucune clé publique ne remplace ces secrets.
- Événements : liste exacte exportée dans `server/lib/stripe-live-webhook.js`.

## Tests

```text
node --test server/lib/stripe-live-webhook.test.js server/lib/stripe-production-catalog.test.js server/billing.test.js
```

16 tests passent. Le script `scripts/verify-stripe-live-inbox-sql.mjs`, avec
`CARNETPASS_SQL_TEST_MODULE` pointant sur PGlite, confirme les permissions réelles SQL,
la détection des doublons et le rejet des conflits. ESLint passe sur les modules modifiés.

Sources vérifiées : documentation Stripe Webhooks (corps brut, signature, doublons et ordre non garanti),
documentation Supabase Database Functions (RPC, droits EXECUTE). Changelog Supabase consulté,
dont les changements TLS du 12 octobre et PostgreSQL du 25 septembre 2026 : pas de changement
de syntaxe nécessaire pour cette migration sans extension.
