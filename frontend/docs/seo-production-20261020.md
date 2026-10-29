# SEO — mise en production du 20 octobre 2026

Guy a validé la présentation et autorisé sa mise en production après la Preview. Déploiement `dpl_TH6e7YxWK1WvNEderYRsUtWoC85F`, promu sur `https://www.carnetpass.fr`.

Le build de production a réussi. Onze contrôles HTTP ont réussi sur le déploiement immuable avant promotion, puis sur le domaine public après promotion : accueil et FAQ en 200, contenu HTML et canonical présents, accueil index/follow, données structurées analysables ; robots.txt et sitemap XML en 200, sept URL publiques dans le sitemap ; espaces applicatifs, recherche et inscriptions en 503 de maintenance ; administration et API administrative sans session en 401 ; connexion privée disponible en 200 et noindex. Le domaine sans www conserve sa redirection 308 vers www.

Aucune modification du drapeau de maintenance, des paiements, des données ou du DNS. Aucun accès authentifié du fondateur testé sur le site réel pendant ce déploiement ; les scénarios d’habilitation restent couverts par les contrôles locaux documentés dans le bilan Preview.

Preuves : `C:\dev\chaudiere-web3\tmp\output\seo-20261020\release-immutable.json` et `release-production.json`.

Action manuelle restante : inspecter l’accueil et soumettre `https://www.carnetpass.fr/sitemap.xml` dans Google Search Console, depuis une propriété vérifiée. Aucune soumission ou demande d’indexation effectuée par l’agent. Aucun délai d’indexation ni changement de l’aperçu IA garanti.
