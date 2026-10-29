# Consultation du catalogue par le fondateur — 21 octobre 2026

Diagnostic en lecture seule dans Paris 2 : 400 documents approuvés avec diffusion confirmée, une fiche rejetée. Le compte fondateur conserve un rattachement à l'ancienne entreprise de démonstration dont l'abonnement Entreprise est résilié. Ajouter un lien vers l'espace Pro ne rétablissait donc pas la consultation du catalogue.

Le seul gestionnaire GET du catalogue accepte désormais le fondateur authentifié par jeton, rôle actuel relu en base et MFA vérifiée, indépendamment de cet ancien abonnement. Ce chemin donne uniquement la liste et la lecture des PDF approuvés avec diffusion confirmée. Aucun accès aux brouillons, aucune modification d'abonnement, aucun droit Shiba, paiement ou écriture client ajouté. Les autres comptes passent toujours par les contrôles entreprise et quotas existants. Les cookies seuls ne confèrent pas cet accès ; une panne de vérification refuse la requête.

Vérification : 10 tests d'accès réussis, ESLint réussi, build Vercel réussi. La consultation depuis la session réelle du fondateur reste à confirmer dans son navigateur.
