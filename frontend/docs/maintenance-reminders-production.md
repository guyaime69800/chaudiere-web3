# Rappels Shiba Bot — mise en production Paris 2

Cette procédure concerne le projet Supabase Production `tsyukqcyfxcrjrhopvpv`
et le projet Vercel `chaudiere-web3` qui sert `www.carnetpass.fr`.
Le code et les migrations préparés localement ne prouvent pas que la base en ligne
a été modifiée. Relever l'heure et le résultat de chaque étape dans le journal de livraison.

## 1. Préparer et sauvegarder

1. Vérifier dans Supabase que le projet sélectionné est `tsyukqcyfxcrjrhopvpv`
   et créer une sauvegarde récupérable ou un point de restauration avant le SQL.
2. Vérifier que les migrations Paris 2 antérieures sont présentes : tables
   `equipments`, `companies`, `company_members`, `subscriptions`,
   `company_verifications`, `interventions`, fonction `is_company_member`.
3. Garder `VITE_REMINDERS_PRODUCTION_ENABLED` et
   `REMINDERS_PRODUCTION_ENABLED` absents ou différents de `true` jusqu'à la fin
   des contrôles. Garder `PUBLIC_REMINDERS_ENABLED` désactivé.

## 2. Appliquer le schéma

Deux méthodes exclusives :

- **Supabase SQL Editor** : ouvrir
  `supabase-production/maintenance-reminders-rollout.sql`, copier le fichier
  complet, l'exécuter **une seule fois** dans le projet Production. Les huit
  étapes forment une seule transaction. Si une erreur apparaît, ne pas
  continuer : noter le message et vérifier qu'aucune table du lot n'a été créée.
- **Supabase CLI** : appliquer, dans l'ordre, les huit fichiers
  `supabase-production/migrations/20261006000100_*.sql` à
  `20261006000800_*.sql`, avec le suivi des migrations du projet. Ne pas ensuite
  exécuter le script SQL Editor. Les fichiers source du pilote Preview sous
  `supabase/migrations/20261001_02` à `_08` ont le même contenu mais des noms
  de migration antérieurs au schéma Production ; ne pas les rejouer en Production.

Le lot crée les rappels professionnels, les tentatives d'envoi, l'audit, la
confirmation de l'entretien et les déclencheurs. Il crée aussi les tables
et fonctions des rappels particuliers, indispensables à la compilation du
déclencheur, sans activer leur interface ni leurs envois.

Si les sept premières étapes ont déjà été appliquées en Production avant le
correctif de l'essai Découverte, exécuter **seulement**
`supabase-production/migrations/20261006000800_reminder_discovery_eligibility.sql`.
Ne pas rejouer le bundle dans cette situation.

Exécuter ensuite `supabase-production/verify-maintenance-reminders.sql` dans
le même projet. Les six tables doivent indiquer `table_exists = true` et
`rls_enabled = true`, les sept fonctions `function_exists = true`, et les deux
déclencheurs `installed = true`. Vérifier aussi qu'un utilisateur anonyme ne
peut pas lire `maintenance_reminders` et qu'un membre ne voit que ses rappels.

## 3. Configurer Vercel Production

Configurer ces variables dans **Production** du projet `chaudiere-web3` :

| Variable | Valeur attendue |
| --- | --- |
| `VITE_REMINDERS_PRODUCTION_ENABLED` | `true`, seulement après vérification SQL |
| `REMINDERS_PRODUCTION_ENABLED` | `true`, seulement après vérification de l'e-mail |
| `VITE_SUPABASE_URL` | `https://tsyukqcyfxcrjrhopvpv.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clé publique du même projet |
| `SUPABASE_SECRET_KEY` | clé serveur du même projet, secrète |
| `RESEND_API_KEY` | clé serveur Resend autorisée à envoyer depuis le domaine vérifié |
| `REMINDER_FROM_EMAIL` | adresse expéditrice vérifiée dans Resend |
| `CRON_SECRET` | secret aléatoire de 32 caractères minimum, côté serveur |

Ne jamais mettre `SUPABASE_SECRET_KEY`, `RESEND_API_KEY` ou `CRON_SECRET` dans
une variable `VITE_…` ou dans Git. Les paramètres Polygon du CarnetPass déjà
opérationnels sont distincts de ces paramètres de rappel.

Après chaque changement de variables Production, créer un **nouveau
déploiement Production** et vérifier qu'il est `Ready` et `Current` sur
`www.carnetpass.fr`. Le cron Vercel `/api/maintenance-reminders` est défini
dans `vercel.json` à `0 8 * * *` (UTC), soit 10 h à Paris en été et 9 h en hiver.
Sur le plan Hobby, son déclenchement peut arriver dans l'heure qui suit.
Vercel ajoute `Authorization: Bearer <CRON_SECRET>` ; une requête sans ce secret
doit être refusée.

## 4. Vérifier le parcours réel

1. Sur `www.carnetpass.fr/espace-pro`, ouvrir un équipement avec CarnetPass
   actif. Vérifier l'onglet **Rappels** et « Programmer avec Shiba Bot ».
2. Créer un rappel d'entretien puis un rappel de dépannage avec une date
   future, confirmer l'adresse du compte, retrouver les deux dans la fiche,
   modifier puis annuler un rappel. Tester aussi l'accès avec un autre compte
   et une session déconnectée.
3. Vérifier dans Supabase `maintenance_reminders` et
   `maintenance_reminder_audit` : objet, type, destinataire, état et auteur.
4. Tester un e-mail réel avec un rappel de faible anticipation et la tâche
   planifiée. Ne jamais antidater ni modifier directement les lignes de
   Production pour forcer un envoi. Contrôler le résultat dans Vercel Logs,
   `maintenance_reminder_attempts` et Resend. `accepted` signifie accepté
   par Resend ; cela ne garantit pas la remise ou la lecture.
5. Confirmer un véritable entretien avec preuve Polygon. Seuls les rappels
   de type entretien doivent passer à `review_required`. Un dépannage reste
   actif. La prochaine date d'entretien se confirme manuellement.

Si l'envoi ne passe pas, remettre `REMINDERS_PRODUCTION_ENABLED` à `false` et
redéployer, tout en conservant les rappels déjà enregistrés pour diagnostic.
Si l'interface pose problème, remettre aussi
`VITE_REMINDERS_PRODUCTION_ENABLED` à `false` et redéployer.

## Limites fonctionnelles

Shiba prépare seulement des demandes simples avec date explicite ou délai en
jours/mois ; la personne confirme avant l'enregistrement. Ce module ne déduit
pas automatiquement la périodicité d'un PDF constructeur et n'envoie pas de
SMS. L'option de rappel QR du particulier reste fermée tant que son parcours
distinct n'a pas été validé en Production.
