# Candidat de publication — administration et documents Paris 2

Date : 5 octobre 2026. Branche candidate : `release/paris2-admin-documents`.

## État vérifié

- Supabase Production Paris 2 : `tsyukqcyfxcrjrhopvpv`. Le compte `guy@carnetpass.fr` possède le rôle `founder`.
- Les 7 fiches documentaires transférées sont présentes et conformes aux métadonnées sources ; leurs 702 extraits RAG sont présents. `distribution_confirmed_at` reste nul pour les 7 : elles sont invisibles dans le catalogue.
- Le Blob Store privé `carnetpass-documents-production` est relié au projet Vercel `chaudiere-web3` pour Production. Un PDF téléchargé depuis ce store a la taille et l'empreinte SHA-256 de la source. Les autres fichiers sont visibles dans le dossier `platform-documents/`, sans contrôle indépendant de leurs octets dans le store.
- Captures Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `BLOB_STORE_ID` et `BLOB_WEBHOOK_PUBLIC_KEY` sont configurés pour Production. Les valeurs masquées des clés ne sont pas vérifiées par ces captures.
- Le code local ouvre l'administration et l'import documentaire sur `main` uniquement avec `CARNETPASS_PRODUCTION_ADMIN_ENABLED=true` et `CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF=tsyukqcyfxcrjrhopvpv`. L'accès reste fermé par défaut.
- L'interface distingue les 7 fiches approuvées mais invisibles et permet au fondateur de confirmer individuellement leur diffusion après contrôle du droit, de la catégorie et de l'empreinte SHA-256 du PDF stocké.
- Vérifications locales : 88 tests, lint et build réussis. Aucun test connecté de l'interface Production n'est encore possible avant publication.

## Séquence de publication

1. Examiner le contenu de cette branche candidate par rapport à `main`. La branche de travail d'origine a 244 commits d'avance sur l'ancien `main` ; cette publication mettrait donc en ligne l'application CarnetPass actuelle, au-delà de l'écran admin. Vérifier les autres services nécessaires à l'application.
2. Publier le candidat en Preview Git, vérifier qu'il utilise la base Preview `bqqzzbwqmiyxcotvqtoc`, puis tester connexion fondateur, écran d'administration, accès refusé à un compte ordinaire et dépôt d'un PDF de test. Le domaine `test.carnetpass.fr` reste attaché à sa branche Preview existante.
3. Après validation du candidat, intégrer la branche dans `main` et laisser Vercel créer un déploiement Git Production. Ne pas promouvoir une Preview.
4. Ajouter les deux variables de garde d'administration dans l'environnement Vercel Production uniquement, puis redéployer `main` pour les appliquer.
5. Tester `https://www.carnetpass.fr/administration-interne` avec le fondateur et un compte sans droit. Vérifier que le dépôt apparaît dans « Documents à valider », puis tester validation, indexation, téléchargement et accès d'un professionnel vérifié. Les 7 fiches transférées restent invisibles jusqu'à leur confirmation individuelle de diffusion.

Ne pas annoncer l'administration comme disponible avant les contrôles connectés de l'étape 5.
