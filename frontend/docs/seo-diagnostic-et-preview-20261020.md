# CarnetPass — diagnostic SEO et Preview du 20 octobre 2026

## Périmètre et état du dépôt

Travail réalisé dans `C:\dev\chaudiere-web3\tmp\security-production-release-20261016\frontend`, la copie de livraison correspondant à la production utilisée pendant cette session. Le `frontend` de la racine est une ancienne version : ne pas le déployer par erreur. État Git examiné avant modification ; les changements préexistants (documents, import R2, catalogue, hotlines) ont été conservés. Aucun fichier tarifaire, règle Stripe, abonnement ou quota modifié. Aucun DNS modifié, aucun déploiement ou promotion en production, aucun changement du drapeau de maintenance réel.

## Constats vérifiés avant correction

| Point | Observation | Conséquence technique |
| --- | --- | --- |
| Domaine | `https://carnetpass.fr/` redirige en HTTP 308 vers `https://www.carnetpass.fr/`. | Le domaine canonique retenu reste `www`, sans changement DNS. |
| Accueil public actuel | HTTP 503, Retry-After 300, uniquement la page de maintenance. Aucun script applicatif dans cette réponse. | La présentation durable de CarnetPass n’est pas accessible au visiteur ou au moteur pendant la maintenance. JavaScript ne peut ajouter la présentation : aucun script n’est livré. |
| Métadonnées actuelles | Titre « CarnetPass · Maintenance », sans description, canonique ou données structurées dans cette réponse. | L’identité et l’utilité du service ne sont pas décrites dans ce HTML. |
| Robots et sitemap actuels | `/robots.txt` et `/sitemap.xml` renvoient la même page HTML de maintenance en 503. | Aucune directive robots ni liste XML utilisable n’est fournie. |
| HTML applicatif dans le dépôt | Avant correction, index.html contient seulement le titre CarnetPass et un conteneur root vide, puis le script React. | Les pages applicatives nécessitent JavaScript pour exposer leur contenu. Ce constat du code ne prouve pas ce que Google a effectivement rendu historiquement. |
| Pages publiques existantes | Accueil, FAQ, mentions, confidentialité, cookies, CGU et CGV dans React et des fichiers Markdown. | Ces contenus sont réutilisables sans inventer des pages concurrentes. |
| Performance applicative | La compilation constate un bundle principal d’environ 1 Mo avant compression et avertit sur les gros chunks. | Coût potentiel sur mobile pour l’application. Aucun score Lighthouse ni mesure Core Web Vitals réelle n’a été obtenu. |

La capture Google évoquée n’établit ni sa cause, ni une panne globale, ni une décision de Google. La maintenance et les métadonnées limitées sont des obstacles constatés ; leur responsabilité exacte dans le résultat Google reste une hypothèse. Aucun accès Search Console, historique d’indexation ou inspection Google n’a été fourni.

## Choix et corrections

### Présentation sans migration du projet

Les composants existants `HomeLanding`, `InfoPages` et `SiteFooter` sont pré-rendus avec React lors du build. Le script écrit un module HTML utilisé par le middleware Node déjà présent. Le serveur livre le même contenu aux personnes et aux moteurs, sans détection d’agent utilisateur. La vitrine ne charge ni React, ni Supabase, ni wallet, ni lecteur PDF dans le navigateur. L’application existante garde son architecture.

L’accueil présente chaudières, PAC, climatisation, VMC, interventions/documents, QR, Shiba Bot et Polygon. Ces fonctions sont présentes dans les composants, services documentaires et flux d’interventions existants ; aucun nouveau test d’intervention réelle ni de transaction blockchain n’a été effectué pour cette tâche. Le texte ne promet pas de certification d’intervention ou d’exactitude de l’IA. L’application est signalée fermée pendant la maintenance ; aucun bouton d’inscription ou de connexion n’est alors proposé. Les ventes restent présentées en préparation.

### Indexation

- Titres et descriptions propres aux sept pages publiques, un H1 par page, canonical sous `https://www.carnetpass.fr`, métadonnées Open Graph et Twitter.
- Organization, WebSite et WebApplication sur l’accueil, sans avis, notes, certification ou prix inventés.
- Sitemap limité à ces sept pages. Aucun QR, dossier client, URL à jeton, espace applicatif ou PDF privé.
- robots.txt de production autorise les ressources nécessaires au rendu et indique le sitemap. Les espaces sensibles restent exclus de l’exploration ; ceci complète les permissions et ne les remplace pas.
- Pages privées et shell applicatif : noindex. Toutes les réponses Preview et les domaines techniques hors domaines canoniques : X-Robots-Tag noindex,nofollow. La Preview ajoute également la balise noindex dans le HTML et Disallow / dans robots.txt ; son sitemap est vide.
- L’état de maintenance n’est pas une autorisation de publication : la version ouverte du composant ne change aucun droit. Les pages publiques sont explicitement délimitées dans une liste fermée.

### Protection de la maintenance

Les contrôles serveur des espaces et API restent en place, y compris pour les sessions ouvertes. La connexion privée reste utilisable sans lien public. Aucun bouton interne dans le HTML public. Aucun cache partagé des décisions d’autorisation : les réponses conservent no-store. Une erreur du stockage de maintenance conserve la vitrine avec un message de fermeture et bloque les fonctions applicatives.

La Preview utilise uniquement une variable de déploiement `CARNETPASS_PREVIEW_MAINTENANCE=true` pour simuler une application fermée sans écrire dans Redis de production. Cette variable est lue uniquement en Preview et n’a aucun effet sur la décision de production.

## Fichiers créés ou modifiés pour cette tâche

- `src/components/HomeLanding.jsx`, `HomeLanding.css` : contenu public et variante présentation/maintenance.
- `src/seo/render-public.jsx` : réutilisation des pages existantes pour le pré-rendu.
- `scripts/render-public-pages.mjs`, `package.json` : pré-rendu lors du prebuild, sans nouvelle dépendance.
- `server/generated/public-pages.js`, `public/shiba-assistant.webp` : sortie générée et image existante réutilisée.
- `shared/public-site-metadata.js`, `server/lib/public-site.js` : métadonnées, HTML complet, données structurées, robots et sitemap.
- `middleware.js`, `server/lib/internal-access.js`, `server/lib/maintenance-state.js` : routes publiques exactes, image publique, noindex et simulation Preview fermée.
- `src/components/AccessBoundary.jsx` : une navigation SPA vers la vitrine rejoint son document pré-rendu ; les contrôles internes restent inchangés.
- `src/main.jsx` : la recherche d’appareil existante reste accessible dans l’application par `/rechercher-appareil`, bloquée en maintenance et hors sitemap ; elle n’est pas remplacée par une nouvelle page SEO.
- `index.html` : shell applicatif explicitement noindex.
- `test/public-seo.test.js`, `test/internal-access.test.js`, `scripts/verify-internal-access-browser.mjs`, `scripts/verify-public-seo-browser.mjs`, `scripts/audit-public-seo.mjs` : vérifications adaptées à la nouvelle séparation vitrine/application.

Les textes Markdown contractuels ne sont pas modifiés ; ils sont rendus depuis les sources existantes à chaque build. Le module généré ne doit pas être corrigé manuellement.

## Contrôles effectués

- Compilation locale avec les variables de Preview : réussie. Build Vercel Preview : réussi. Avertissement existant sur les gros chunks applicatifs conservé.
- ESLint ciblé et git diff --check : réussis.
- 12 tests Node ciblés : réussis, dont cinq identités, refus d’auto-attribution de rôle, MFA, retrait effectif des permissions, maintenance, HTML et métadonnées publiques.
- Navigateur local isolé : visiteur, client Pro, collaborateur client refusés sur l’administration (401/403), opérateur et fondateur autorisés ; navigation SPA et révocation de permission vérifiées ; connexion privée vérifiée. Les comptes sont fictifs ; aucune donnée de production utilisée.
- Navigateur sur la vraie Preview : ordinateur 1440 px et mobile 390 px, JavaScript actif/inactif ; quatre scénarios réussis. Accueil 200, un H1, JSON-LD analysable, contenu dès le HTML, aucun script applicatif, navigation FAQ et application 503, aucune erreur JavaScript ni débordement horizontal. Captures inspectées visuellement.
- Audit HTTP des sept pages Preview : 200, un H1, titres/descriptions/canoniques, noindex par balise et en-tête vérifiés. Robots et sitemap répondent avec les types appropriés. Administration 401 et API facturation 503 sans session.
- Politique destinée à la production vérifiée localement avec hôte canonique : index/follow, sept URL publiques seulement, application toujours bloquée en maintenance. Ne pas enlever le noindex de Preview.
- Contrôle final du site de production : toujours 503 en maintenance, donc aucune ouverture effectuée.

Une première vérification navigateur FAQ a échoué parce que le test comptait les titres avant la fin du chargement ; l’attente explicite du H1 corrige ce test. Un premier essai de test interne utilisait une référence Supabase fictive différente de celle du bundle local ; relance réussie avec la référence publique Preview correcte et des identités toujours fictives. Ces incidents n’ont déclenché aucune modification d’autorisation.

Preuves locales : `C:\dev\chaudiere-web3\tmp\output\seo-20261020\` contient les captures, `audit-http.json`, en-têtes et HTML reçus, `verification-navigateur-local.json` et `verification-navigateur-preview.json`. La vitrine fait environ 16 Ko de HTML et n’exécute aucun bundle applicatif ; ce n’est pas une mesure de performance Google en conditions réelles.

## Aperçu consultable

https://carnetpass-82n9a7dr4-chaudiere-web3.vercel.app

Déploiement Preview final : `dpl_B9UQVAgQ7Snnxnte5oM5sp64Vjjy`. Une première Preview (`dpl_25uYz8chXGmoCp6ZPSVF5cZTYe7t`) a servi aux contrôles initiaux ; la Preview finale conserve aussi le chemin de la recherche d’appareil existante après réouverture. Aucune promotion. Le domaine de test habituel n’a pas été reconfiguré.

## Limites et validation avant production

1. Faire valider par Guy les textes et la présentation : la vitrine sera publique pendant que l’application reste fermée. Vérifier aussi les informations légales existantes, dont l’ouverture commerciale reste en préparation.
2. Obtenir son accord explicite pour déployer cette version SEO. Utiliser la copie de livraison indiquée et conserver la configuration de branche main nécessaire aux accès internes ; ne pas redéployer une ancienne version.
3. Après déploiement autorisé seulement : vérifier 308 vers www, 200 et contenu initial de la vitrine, canonical, robots/sitemap de production, noindex des espaces privés et accès fondateur. Ne pas désactiver la maintenance de l’application.
4. Dans Search Console, utiliser la propriété correspondant à www.carnetpass.fr (ou une propriété domaine déjà vérifiée), inspecter l’URL d’accueil, lancer le test en direct, contrôler le rendu HTML et les ressources, puis demander l’indexation si admissible. Soumettre `https://www.carnetpass.fr/sitemap.xml` et suivre les erreurs d’indexation. Ne soumettre aucune Preview ni URL privée. Aucune opération DNS sans autorisation.
5. Un contrôle Google des données structurées et les résultats réels d’indexation restent à faire après mise en production. Aucun délai, classement ou correction de l’aperçu IA n’est garanti.

Références officielles consultées :
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
