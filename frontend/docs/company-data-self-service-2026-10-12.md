# Gestion autonome des dossiers - 12 octobre 2026

## Actions du responsable
Paramètres du compte → Mes données et mes dossiers.
- Récupérer les données JSON paginées et les pièces privées en ZIP, avec vérification SHA-256 des fichiers. Plusieurs parties au-delà de 80 Mio. EXPORT-TERMINE.json confirme la fin ; les parties reçues avant une erreur restent incomplètes.
- Choisir un équipement ou tous les dossiers techniques, confirmer le nom de l’entreprise, le mot de passe et la sauvegarde des documents à conserver.
- Consulter le suivi du nettoyage des fichiers et des fiches QR. Les reprises horaires ne nécessitent pas un navigateur ouvert.

## Sécurité et portée
Compte vérifié, contrôle MFA existant, appartenance responsable admin/owner unique, entreprise dérivée du compte côté serveur. Aucun companyId/actorId du navigateur ne choisit la cible. Accès indépendant de la formule et de l’essai. Requêtes limitées techniquement.
Export : équipements, interventions, attestations chaudière, pièces privées, documents thermodynamiques, rappels et historiques d’envoi, demandes de rappel, qualifications RGE, confirmations de plaques, simulations Shiba et identifiants/rôles des membres. Les chemins de stockage et empreintes de jetons restent réservés au serveur.
Suppression transactionnelle : attestations, documents thermodynamiques, interventions, pièces privées et équipement choisi ; rappels/confirmations liés par cascades. Tous les dossiers : supprime aussi les qualifications RGE et simulations rattachées à l’entreprise.
Compte, membres, entreprise, abonnements, factures et notices partagées restent en place. Effacer les dossiers ne résilie pas l’abonnement. Blockchain irréversible. Les durées et procédures de restauration des sauvegardes restent à formaliser avant ouverture commerciale.

## Installation et reprises
Migrations 20261012153743 et 20261012161417 appliquées en production via Supabase CLI 2.75.0. Simulation ne proposait que cette migration ; historique distant conservé. Tables et RPC réservées au service_role. Marqueur de transaction autorisant l’effacement expressément demandé des attestations émises, sans neutraliser leur protection pour les autres actions.
Nettoyage Blob des chemins exactement rattachés au dossier ; aucune suppression R2 du catalogue. Nettoyage Redis contrôlant l’entreprise et l’équipement et comparant les index avant suppression. Scan borné avec curseur de reprise. Les anciennes empreintes QR ne pointant plus vers une fiche ne donnent aucun accès.
Cron horaire minute 15 sur /api/maintenance-reminders?data_cleanup=1, authentifié par CRON_SECRET configuré, sans courriel ni veille aides. Reprise quotidienne aussi. Chemins des jobs terminés effacés immédiatement, jobs terminés purgés après 7 jours, journal d’opération après 90 jours.

## Vérification
210 tests Node réussis, lint/build. PostgreSQL jetable : permissions, refus d’une autre entreprise, protections hors procédure, dossier sélectionné et suivi durable. Navigateur fictif : ZIP avec fichier vérifié, confirmations, sélection et ordinateur/mobile. Aucun dossier réel supprimé pendant les tests.
Supabase db lint --linked : aucune erreur de schéma. Advisors CLI 2.120.0 inaccessible (TransportError) ; aucun résultat favorable supposé.
PDF séparé non signé, hors des conditions. Seuls les paragraphes opérationnels d’export/effacement actualisés dans CGV/confidentialité ; CGV 2026-10-12.2 archivée et empreinte Stripe actualisée.

Complément ancien QR : effacement complet couvre les anciennes fiches de l’entreprise sans identifiant SQL ; un dossier créé ensuite est conservé. Effacement sélectionné reconnaît aussi la fiche ancienne par le numéro de série normalisé. Comparaison Lua de l’identité et de la création avant suppression ; aucun écrasement concurrent effacé par erreur.
