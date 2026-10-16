# Shiba Devis, aides et scan de plaque

## Fonctions

- `/shiba-devis` : questionnaire progressif, préparation et export gratuits. Simulation déterministe côté serveur, sans IA pour les montants.
- `/espace-particulier`, accueil et espace professionnel : entrées vers ce même assistant. Mascotte Shiba avec lunettes et stylo intégrée.
- Création d’équipement professionnel : photo/import, aperçu compressé, extraction, correction, choix explicite du catalogue puis préremplissage. Enregistrement par une seconde action.
- Déclaration RGE distincte de sa vérification ; justificatif facultatif dans les pièces jointes privées existantes.
- `/administration-aides` : versions, veille officielle, comparaison des textes, validation manuelle, publication, suspension et retour arrière. Vérification RGE manuelle dans l’annuaire officiel.

Montant inconnu ≠ zéro. Reste à charge uniquement avec les coûts et contributions nécessaires. CEE variables. La première règle chiffrée préparée concerne la PAC air/eau en métropole ; autres projets orientés vers les contrôles officiels. Aucun barème initial n’est publié automatiquement. Les brouillons signalent les contrôles restants, notamment les cumuls.

## Documents pendant la maintenance

Le catalogue, les pièces jointes privées et l’indexation Shiba existants sont réutilisés ; pas de second catalogue/RAG. Pour ajouter notices et vues éclatées : ouvrir `/administration-maintenance`, activer l’accès de vérification de ce navigateur, puis utiliser l’administration documentaire existante. Accès valable une heure, renouvelable. Vérifier le document publié dans le dossier du modèle et contrôler sa citation de page dans Shiba.

Ne pas cliquer « Rouvrir le site » pour tester. Les visiteurs restent en maintenance, les rappels continuent. Stripe et les droits commerciaux existants ne sont pas modifiés.

## Confidentialité

Brouillons locaux en sessionStorage, effacement et export disponibles. Simulation connectée temporaire dans Redis (30 minutes), sauvegarde seulement sur choix explicite. Historique/suppression filtrés par propriétaire côté serveur. Snapshots immuables ; recalcul = nouvelle version sauvegardée.

Scan réservé à une entreprise vérifiée, SIRET concordant et non suspendue. JPEG/PNG/WebP, 10 Mo maximum au navigateur, compression à 1600 pixels ; contrôle réel serveur, 2 Mo et 20 millions de pixels maximum. Image envoyée à OpenAI avec store:false : pas une garantie de rétention nulle chez le fournisseur. CarnetPass ne conserve pas la photo par défaut ; conservation privée sur choix explicite seulement. Ticket/empreinte de lecture temporaire pendant deux heures. Provenance enregistrée après confirmation de l’équipement. Série/photo jamais publiées. Champs illisibles laissés vides, année jamais déduite de la série. Saisie manuelle disponible en cas d’échec. Aucun crédit Shiba Bot consommé.

## Migration et configuration

`supabase/migrations/20261007111436_shiba_devis_aids_rge_scan.sql`, copie générée dans supabase-production. Sept tables avec RLS forcée, aucun accès direct anon/authenticated. Serveur authentifié, filtres d’appartenance et transitions administrateur sérialisées/journalisées.

Preview : bqqzzbwqmiyxcotvqtoc ; Production : tsyukqcyfxcrjrhopvpv. Preview a reçu les prérequis existants private_equipment_attachments (20261004194150), restrict_internal_triggers (20261004211830), puis la nouvelle migration. L’historique supabase_migrations Preview n’était pas initialisé : deltas SQL explicites, pas d’historique complet revendiqué.

Variables existantes : SUPABASE_SECRET_KEY, OPENAI_API_KEY, Redis Upstash ; publiques VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY. Les trois variables Supabase Preview couvrent désormais les branches de test ; valeurs et configuration Supabase Production conservées. Ne jamais recopier [SENSITIVE] depuis un export Vercel.

Quatre API partagent api/verify-company.js par réécriture : aucune fonction Vercel supplémentaire. Import natif @napi-rs/canvas à vérifier sur le serveur déployé. Veille via cron de rappels existant à 08:00 UTC, SHIBA_DEVIS_WATCH_ENABLED=true et CRON_SECRET requis. Intervalle initial sept jours, réglable 1–90 jours ; huit sources par passage. Une panne conserve la dernière réussite, une modification ne publie jamais de règle. Fraîcheur contrôlée avant calcul.

## Mise à jour des aides

1. Préparer les brouillons initiaux dans l’administration.
2. Vérifier les sources, distinguer consultation/date éditoriale, comparer ancien/nouveau texte.
3. Contrôler périodes, ressources, conditions, plafonds, cumuls et RGE.
4. Créer une version, noter les contrôles, valider, puis publier explicitement.
5. En cas d’erreur : suspendre ou restaurer une version archivée encore valable. Snapshots précédents conservés ; proposer un recalcul.

## Coût du scan

Modèle gpt-4.1-mini, réponse maximum 1600 tokens, un appel sans nouvelle tentative automatique. Tarifs consultés le 07/10/2026 : 0,40 USD/million de tokens en entrée, 1,60 USD/million en sortie. Ordre de grandeur : quelques millièmes de dollar pour une image/réponse courte ; estimation et non facture mesurée. Redis, stockage facultatif et infrastructure s’ajoutent. Source : https://developers.openai.com/api/docs/models/gpt-4.1-mini

Réservation atomique AVANT IA : 0,01 USD/appel, enveloppe par défaut 5 USD/jour, 20 appels/heure/utilisateur. Compteur conservateur distinct de la facture. SHIBA_SCAN_RESERVATION_MICRO_USD (minimum 10000), SHIBA_SCAN_DAILY_BUDGET_MICRO_USD (défaut 5000000 ; zéro désactive), SHIBA_SCAN_MAX_CALLS_PER_HOUR (défaut 20).

## Vérification et rollback

npm test, build Vite, ESLint ciblé, scripts/verify-shiba-devis-sql.mjs (PostgreSQL isolé) et scripts/verify-shiba-devis-ui.mjs (Chrome isolé). Photos/réponses fictives pour le navigateur : interface vérifiée, pas une mesure de précision OCR. Artifacts exclus de Git/bundle. Tests SQL : transitions, rollback, immutabilité, effacement et permissions.

Livraison : Preview → API réelles → migration additive Production → version Production préparée → vérification → domaine. Maintenance conservée à chaque étape, contrôler réponse visiteur 503 et accès administrateur.

Rollback applicatif par Vercel vers le déploiement précédent. Conserver migration additive et snapshots ; ne pas supprimer les tables. Désactiver veille/scan par variables si nécessaire. Ne jamais rouvrir automatiquement.

## Livraison Production du 07/10/2026

Version fonctionnelle 15c9834 publiée sur main ; déploiement Production READY associé à www.carnetpass.fr et carnetpass.fr. Migration additive appliquée sur Paris 2 et inscrite comme 20261007111436 dans l’historique existant. Permissions réelles confirmées : RLS forcée, aucun SELECT anon/authenticated, SELECT service_role. Conseiller Supabase : aucune erreur critique.

137 tests réussis. Build et ESLint ciblé réussis. Questionnaire et scan contrôlés dans Chrome isolé sur ordinateur/mobile avec fixtures ; calcul public contrôlé sur une API Preview réelle. Vérification du domaine Production : visiteurs et API publiques renvoient 503 ; administration-maintenance et administration-aides renvoient 200 ; API admin non connectée 401 ; tentative de route contradictoire 400. Nouveau bundle présent. Aucune erreur serveur observée dans le contrôle initial du déploiement.

La vérification Auth Preview supplémentaire n’a pas été autorisée : aucun compte client utilisé/créé. Le parcours complet connecté et la lecture IA de plaques réelles restent à confirmer par l’administrateur avec son accès de vérification. Aucun barème publié. SHIBA_DEVIS_WATCH_ENABLED=true ajouté en Production ; cette mise à jour documentaire déclenche le build qui prend en compte la nouvelle variable. Maintenance conservée, aucune réouverture effectuée. Stripe Production reste l’étape suivante, pas une fonction activée par cette livraison.


## Simplification du parcours - 2026-10-07
Le parcours /shiba-devis propose les liens officiels France Renov et RGE. Retrait du formulaire financier et de son export JSON. Conservation des anciennes simulations. Livraison en Production avec maintenance active.
