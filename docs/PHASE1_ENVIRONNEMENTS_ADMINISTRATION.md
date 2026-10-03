# Phase 1 — environnements et administration

État observé le 3 octobre 2026. Ce document distingue les vérifications publiques des contrôles qui exigent un accès Vercel/Supabase authentifié. Aucune opération de production n'est autorisée par cette phase.

## Contrôles publics reproductibles

Depuis `frontend`, lancer `npm run audit:environments`. Cette commande ne demande aucune clé et ne modifie aucune donnée. Elle vérifie les garde-fous publics actuels. `npm run audit:production-readiness` ajoute un contrôle bloquant de la future base Supabase Production distincte ; il doit rester en échec tant que la nouvelle application n'est pas publiée en Production.

Constats au 3 octobre 2026 :

- `https://test.carnetpass.fr/administration-interne` répond en HTTP 200. L'API `/api/platform-admin` répond en 401 sans session : le contrôle d'accès est actif, mais un compte administrateur n'a pas été testé par cet audit.
- L'API `/api/platform-admin` de `www.carnetpass.fr` répond en 404 : l'administration des données réelles n'est pas encore publiée.
- Le bundle principal Preview contient la référence publique du projet Supabase `bqqzzbwqmiyxcotvqtoc`.
- Le bundle principal Production consulté ne contient aucune référence de projet Supabase. Après comparaison avec la branche `main` distante (`c5a6692`, 1er septembre 2026), c'est cohérent : cette ancienne version ne contient pas encore `@supabase/supabase-js`. L'absence de référence dans le bundle **ne prouve donc pas** qu'une variable Vercel est manquante. La configuration future reste à vérifier avant publication.

Un résultat positif de ce script ne suffit pas pour une mise en production : il ne vérifie ni les secrets serveur, ni l'application des migrations, ni les droits réels des comptes internes.

## Conservation du lien d'administration de test

Le lien `https://test.carnetpass.fr/administration-interne` peut rester l'adresse stable des essais si le domaine reste affecté à la branche `feature/documentation-multi-docs`, si cette branche continue d'exister et si ses variables pointent vers le projet Supabase Preview prévu. Le serveur exige actuellement `VERCEL_ENV=preview`, cette branche et cette référence Supabase ; changer l'un des trois désactive l'API d'administration. Ne pas promouvoir une Preview en Production.

L'administration de test agit sur la base de test. Elle ne doit pas servir à modifier les données réelles après lancement. Le besoin confirmé est une administration des données réelles à l'adresse `https://www.carnetpass.fr/administration-interne`, avec la même interface de gestion mais reliée à la base Production. Le code prépare cet accès sans l'activer : par défaut l'API Production renvoie 404. Le serveur n'accepte l'ouverture que sur la branche `main`, avec `CARNETPASS_PRODUCTION_ADMIN_ENABLED=true` et `CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF` égal à la référence du projet Production utilisé par `VITE_SUPABASE_URL`. La référence Preview est toujours refusée. Ces deux variables doivent être limitées à l'environnement Vercel **Production** et ne doivent pas être configurées maintenant tant que les contrôles ci-dessous ne sont pas terminés.

## Vérifications authentifiées restantes

1. Dans Vercel, relever les **noms et portées** des variables de Preview et Production : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, ainsi que les variables Stripe propres à chaque environnement. Ne pas transmettre les valeurs secrètes. Déterminer si un projet Supabase Production distinct existe déjà avant de prévoir sa configuration.
2. Confirmer que le domaine de test est toujours assigné à la branche Preview et que la Production est construite depuis `main` ; noter les SHA effectivement servis. Une ancienne copie locale de `.env.preview.local` n'est pas une preuve de la configuration Vercel actuelle.
3. Dans Supabase, inventorier les projets réellement utilisés et les migrations appliquées. Le dépôt contient 38 fichiers SQL, mais il ne faut pas les appliquer en bloc sans comparer l'état réel de chaque base. Vérifier particulièrement les rôles internes et l'accès Entreprise avant tout test d'écriture.
4. Avec deux comptes Preview distincts, vérifier que le fondateur accède à l'administration, qu'un compte normal reçoit 403, et que l'ajout/retrait d'un collaborateur respecte les rôles. Tester les opérations d'entreprise sur des données de démonstration, puis contrôler la trace d'audit. Prévoir un compte fondateur Production confirmé et son rôle `platform_admins` dans la base Production ; ne jamais copier les données ou les droits de Preview en bloc.
5. Préparer la future version Production avec son projet Supabase distinct et ses variables correctement ciblées. Après autorisation explicite de production, publier le nouveau code, tester d'abord la connexion, puis seulement activer le verrou d'administration et vérifier les accès fondateur/compte ordinaire ainsi qu'une opération de gestion sur une fiche prévue pour ce test.

Ne pas déclarer la phase 1 terminée tant que ces contrôles ne sont pas documentés avec leurs résultats.
