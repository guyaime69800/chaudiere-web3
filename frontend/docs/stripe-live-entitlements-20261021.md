# Traitement Stripe réel — 21 octobre 2026

## État livré

Le code prépare la chaîne commande serveur → Checkout Stripe → notification signée →
relecture Stripe → transaction de droits. L'ouverture commerciale reste fermée.

- `server/billing-live.js` : entreprise unique issue du jeton vérifié, email confirmé, MFA,
  rôle responsable pour Pro, SIRET validé et entreprise approuvée, exclusion des démonstrations,
  limite de requêtes, contrôle du compte et du prix réels, CGV actuelles et consentement Stripe.
- Commande enregistrée avant création du Checkout. Un identifiant UUID de commande stable sert
  de clé d'idempotence Stripe. Une session Pro ouverte est réutilisée ; un échec de sauvegarde
  peut être repris avec la même clé. La commande et le destinataire sont vérifiés côté serveur.
- Les recharges vérifient aussi que la place du membre est active. Aucun montant, prix,
  entreprise ou URL de retour fourni par le navigateur ne détermine l'attribution des droits.
- `stripe-live-reconciliation.js` : journal durable, relecture de l'état Stripe courant après
  acquisition d'un verrou d'entreprise, bail de 90 secondes avec jeton vérifié à l'écriture.
  Une ancienne notification de facture payée ne réactive pas une souscription désormais annulée.
- Pro et sièges : prix autorisés exclusivement, facture payée, quantité effectivement couverte,
  bornes de période contrôlées. Aucune place en attente de paiement n'est ajoutée.
- Les abonnements pilotés par Stripe sont identifiés par `stripe_live_managed` et le contrôle
  serveur vérifie l'échéance payée. Les abonnements manuels n'ont pas été convertis.
- Crédits : registre PostgreSQL, unicité par session et par paiement, solde durable par membre,
  consommation atomique après épuisement du quota mensuel, restitution idempotente si la question échoue.
  Les remboursements partiels révoquent les crédits correspondants ; une dette est conservée
  si les crédits remboursés ont déjà été consommés. Un litige ne recrédite jamais automatiquement.
- Chaque transaction applique les droits et marque l'événement traité ensemble. Les échecs
  restent rejouables. Une tâche toutes les cinq minutes reprend dix notifications en attente,
  avec report des tentatives pour ne pas bloquer la file sur une liaison inconnue.
- Les notifications sans liaison serveur restent en attente. Elles ne créent jamais de liaison
  client/entreprise à partir de leurs seules métadonnées.

## Base Supabase

Migration `20261021102225_stripe_live_entitlements.sql`, générée par le CLI, testée dans
PGlite, puis appliquée au seul projet `tsyukqcyfxcrjrhopvpv` et enregistrée dans son historique.
Copie identique dans `supabase-production/migrations/`.

Les six nouvelles tables sont privées avec RLS ; aucun SELECT utilisateur ni INSERT public.
Les quatre fonctions sont SECURITY INVOKER et réservées au service. Le rapport Advisors
`stripe-live-supabase-advisors-20261021.json` n'ajoute aucun signalement sur ces objets Stripe.
Vérification en ligne après migration : zéro liaison client, commande, achat de crédits ou
abonnement Stripe géré. Aucun paiement réel ni attribution de droits n'a été créé.

## Activation séparée

Ces trois variables ne sont pas ajoutées ni activées par ce travail :

- `CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED=true` : réception signée.
- `CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED=true` : traitement et registre des crédits.
- `CARNETPASS_LIVE_BILLING_ENABLED=true` : création des paiements.

Le secret de signature et la clé API restent uniquement dans Vercel. La tâche de reprise
exige en plus le bearer `CRON_SECRET`. Le domaine public reste sur son déploiement précédent.

## Audit réel des permissions de la clé

Exécuté en GET uniquement dans le build isolé `dpl_9jEj5NZooNmpnohuWKcJYB4UTUR8` :

| Ressource | Résultat |
| --- | --- |
| Payment Intents | 200 |
| Checkout Sessions | 200 |
| Subscriptions | 200 |
| Invoices | 200 |
| Charges and Refunds | **403 — lecture manquante** |
| Payment Disputes | **403 — lecture manquante** |

Ajouter seulement la lecture pour ces deux dernières ressources, puis refaire cet audit.
Le contenu des objets et des secrets n'est pas affiché. Aucune permission d'écriture n'a été
testée sur Stripe réel par création d'un objet pendant cette préparation.

### Recontrôle après modification de la clé

Guy a ajouté les deux lectures à la clé existante, sans rotation. Nouvel audit réel
dans `dpl_4kWEYEF7hACFhmFsfGpTtHtgHnQm` : **les six ressources répondent 200**,
`readPermissionsReady=true`, `purchasesEnabled=false`.
Le compte et les quatre prix ont également été revalidés par cet audit.
Aucun paiement ni objet client n'a été créé ; aucune clé n'a été extraite.
Les permissions de lecture ne bloquent donc plus la suite. Les autres étapes avant ouverture
énumérées ci-dessous restent nécessaires (interfaces, portail et places, reprise et vérification complète).

Déploiement final isolé : `dpl_FQp89WGefSECuBhHKxWRVndHi6EL`,
`https://carnetpass-bs6y4ewwq-chaudiere-web3.vercel.app` (build réussi, non promu).
Vérification HTTP : achats et recharges 503, webhook désactivé 503, reprise sans secret cron 401,
administration anonyme 401. Le domaine public conserve la présentation 200 et l'espace pro en maintenance 503.
Le script `verify-stripe-closed-deployment.mjs` permet de reproduire ces vérifications sans secret.

## Tests et limites avant ouverture

64 tests Node passent : fermeture par défaut, autorisations et CGV, persistance avant Stripe,
reprise avec même clé d'idempotence, contrôle des montants, paiement impayé, chronologie des
notifications, signatures, isolation client, crédits et régressions du parcours Preview.
Le test SQL vérifie transaction, bail concurrent, remplacement d'un bail expiré, absence
de double crédit, remboursement unique, dette et absence de modification après un échec.
ESLint passe. Le test ancien de recharge attend désormais la version CGV actuelle,
déjà contrôlée séparément avec son archive, au lieu d'une date périmée codée en dur.

Il reste avant ouverture :

1. Corriger les deux lectures de la clé et recontrôler les permissions.
2. Raccorder explicitement l'affichage des achats réels dans les interfaces ; les commandes
   serveur préparées restent volontairement fermées et les interfaces conservent la préouverture.
3. Terminer le portail live, l'ajout de places avec récapitulatif de prorata et la réduction
   à la prochaine échéance avec choix des membres conservés. Le traitement des sièges payés
   est prêt ; leur modification commerciale reste à raccorder au parcours live.
4. Prévoir la reprise d'un ancien abonnement résilié (actuellement bloquée pour éviter un doublon).
5. Traiter manuellement les remboursements d'abonnements et les restitutions après litige gagné :
   ils ne sont pas automatiquement interprétés comme une autorisation de prolonger l'accès.
6. Vérifier l'ensemble des contrôles d'accès du produit, les factures et les cas exceptionnels
   en environnement de test représentatif. Aucun paiement réel de bout en bout n'a été effectué.
7. Activer séparément la réception, le traitement puis la vente après validation de ces étapes.

Sources consultées : documentation Stripe des Webhooks, Checkout Session, Subscription,
PaymentIntent et Invoice ; documentation Supabase RPC/Database Functions et règles Postgres
sur l'ordre des verrous. Version API des requêtes live fixée à `2026-08-26.dahlia`.
