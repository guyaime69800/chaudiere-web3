# Rappels d'entretien — état du pilote Preview

Ce pilote reste désactivé tant que les migrations `20261001_02` à `20261001_07`
ne sont pas appliquées dans l'ordre à la base Supabase
**de test**. Ne pas les appliquer à la base de production pour valider la Preview.

## Parcours disponible après migration

1. Créer un équipement dans l'espace professionnel : son dossier s'ouvre sur
   « Entretien et rappels ».
2. Choisir explicitement la prochaine échéance, et éventuellement déclarer la
   date du dernier entretien. L'installation et une intervention en attente ne
   sont pas considérées comme un entretien confirmé.
3. Vérifier l'adresse du compte, l'équipement, la date et l'anticipation dans
   la proposition, puis confirmer. Seule l'adresse déjà vérifiée du compte
   connecté est acceptée.
4. Retrouver le rappel dans la fiche ; le modifier ou l'annuler. Le serveur et
   la base refusent les accès hors entreprise et les modifications concurrentes.
5. En Preview uniquement, un bouton permet un e-mail de test. Il ne modifie
   pas l'état de la notification normale. « Accepté par Resend » n'implique pas
   « livré » ni « lu ».
6. Sur la fiche QR publique, un visiteur peut demander un rappel à une adresse
   de test, choisir sa date et recevoir un lien de vérification à usage unique
   valable une heure. Après vérification, un lien privé permet de modifier ou
   d'annuler ce seul rappel. Aucun droit sur l'équipement n'est créé.
7. Dans le dossier pro, Shiba prépare les commandes simples de création,
   modification ou annulation. Seuls les jours, les mois calendaires et une
   date explicite sont reconnus ; les demandes ambiguës sont refusées. La
   confirmation et les contrôles d'accès restent assurés par la base.
8. Après confirmation humaine d'un entretien réellement effectué et d'une
   preuve Polygon confirmée, les rappels futurs de l'appareil passent à
   « à réévaluer ». Aucune prochaine date n'est inventée. Les réparations,
   installations, brouillons et contrôles non confirmés ne déclenchent rien.

## Configuration de test

Configurer côté serveur Preview, sans jamais exposer les valeurs dans le navigateur :

- `RESEND_API_KEY` ;
- `REMINDER_FROM_EMAIL` : expéditeur vérifié ;
- `REMINDER_TEST_EMAIL` : adresse vérifiée du compte de test autorisé ;
- `REMINDER_MANAGE_SIGNING_KEY` : secret aléatoire d'au moins 32 caractères
  pour les liens de gestion contenus dans les notifications publiques ;
- `SUPABASE_SECRET_KEY` : clé serveur du projet de test ;
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` : projet de test ;
- `VITE_PUBLIC_REMINDERS_ENABLED=true` et
  `VITE_REMINDER_PREVIEW_TEST_ENABLED=true` : affichage des deux interfaces
  pilotes, uniquement dans la configuration de build Preview. Ces indicateurs
  ne remplacent pas les contrôles serveur.

Le bouton et l'opt-in QR sont fermés côté serveur si la branche n'est pas `feature/documentation-multi-docs`,
si l'environnement n'est pas Preview, ou si Supabase n'est pas le projet de
test configuré. Aucun envoi réel aux clients n'est lancé en Preview.

## Tâche planifiée

Une tâche quotidienne Vercel est déclarée pour les déploiements Production
uniquement. Son endpoint répond sans agir tant que
`REMINDERS_PRODUCTION_ENABLED=true` **et** `CRON_SECRET` ne sont pas configurés.
L'envoi public exige en plus `PUBLIC_REMINDERS_ENABLED=true` et la clé des liens.
Il ne faut pas activer ces variables dans le cadre de ce pilote. Les rappels
arrivés à échéance sont réclamés atomiquement en base ; avant l'envoi, le
service vérifie encore l'appartenance à l'entreprise, la confirmation et
l'égalité de l'adresse e-mail, ainsi que l'état du rappel. Resend reçoit une
clé d'idempotence par rappel et version. Une erreur temporaire entraîne une
seconde tentative immédiate ; au-delà, l'état est `failed` et nécessite une
reprise contrôlée, car l'idempotence du prestataire ne dure que 24 heures.

## Non livré dans ce pilote

- Compréhension libre de toutes les formulations par un modèle de langage,
  recherche de recommandations constructeur avec page et référence exactes.
  Le module Shiba présent ici est volontairement limité à quelques intentions
  explicites et ne lit aucun PDF pour agir.
- Recalcul automatique d'une échéance récurrente après entretien : aucune
  règle de périodicité n'est encore acceptée et vérifiée par appareil ; la
  réévaluation reste manuelle. `maintenance_verified_at` est distinct du champ
  historique `validation_status`, réservé à la revue de l'IA.
- SMS, preuve de livraison/lecture des e-mails et envoi en production.

## Vérification avant d'annoncer la première livraison complète

- Appliquer les six migrations au projet Supabase de test et tester les RPC
  avec un membre autorisé, un autre membre et un visiteur anonyme.
- Tester date manquante, fin de mois, changement d'e-mail, révocation du membre,
  double clic, modification concurrente, annulation juste avant envoi.
- Tester un envoi Resend vers `REMINDER_TEST_EMAIL` et un échec simulé.
- Tester le lien de vérification expiré, sa double utilisation, la gestion par
  token et la révocation après suppression ou transfert de l'équipement.
- Vérifier le rendu mobile et la fiche QR, puis terminer le flux particulier.

Le dépôt local n'a ni CLI Supabase ni serveur PostgreSQL disponibles dans cet
environnement ; les migrations ne sont donc pas marquées comme appliquées.
