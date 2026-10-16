# Phase 1 — environnements et administration

## Mise à jour du 5 octobre 2026

Les captures Vercel fournies par le propriétaire montrent `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY` dans l'environnement **Production** uniquement. La valeur de l'URL a été saisie pour Paris 2 (`tsyukqcyfxcrjrhopvpv`) ; les captures de la liste ne permettent pas de confirmer les valeurs enregistrées des clés. Aucune publication n'a suivi cette configuration.

Contrôle connecté Preview du 5 octobre, documenté par deux captures du propriétaire : un compte administrateur ouvre `/administration-interne`, voit la mention « Environnement de test (Preview) » et charge la liste des entreprises et l'historique ; un compte Preview ordinaire ouvre la même adresse mais reçoit « Accès réservé à l'équipe CarnetPass » sans données administratives. Les rôles collaborateurs et les opérations Entreprise restent à vérifier.

Contrôle documentaire Preview du même jour, documenté par quatre autres captures du propriétaire : un PDF Atlantic est enregistré dans « Documents à valider » (1), puis apparaît publié dans les archives (7 documents au total) avec « Shiba : prêt ». Le catalogue technique affiche sa vue éclatée et la hotline. Une question sur le bornier de raccordement reçoit une réponse de Shiba avec référence de pièce et citation de la page 5. Ces captures valident le parcours visible de dépôt, publication, découverte et recherche ; elles ne constituent pas une comparaison indépendante de la réponse avec le contenu exact du PDF. Ce PDF et son index restent dans la Preview et ne sont pas transférés à Paris 2.

Contrôle local après cette mise à jour : 84 tests automatisés, `npm run lint` et `npm run build` passent. L'audit public en lecture seule confirme que la Preview sert `bqqzzbwqmiyxcotvqtoc`, que son API d'administration répond 401 sans session, et que l'API Production répond toujours 404. Le bundle Production publié ne contient toujours aucune référence Supabase. Les essais avec comptes connectés, la vérification des services de Production et la validation de la branche candidate restent nécessaires.

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

Le projet `bqqzzbwqmiyxcotvqtoc` sert à la Preview. L'ancien projet `rpwzzvreuenstsjtbzto` a été sauvegardé puis supprimé le 4 octobre ; le garde-fou d'administration Production refuse toujours sa référence. Le projet distinct `tsyukqcyfxcrjrhopvpv` (« Paris 2 ») a reçu les migrations Production auditées. La mention « main / PRODUCTION » dans le tableau de bord Supabase décrit la branche principale du projet Supabase, pas l'environnement Vercel de CarnetPass.

Le projet `bqqzzbwqmiyxcotvqtoc` reste la Preview configurée pour l'administration et les documents. Le fichier local `frontend/.env.local` peut encore contenir une ancienne référence ; il ne prouve pas la configuration en ligne. Les trois variables Supabase Production ont été ajoutées dans Vercel le 5 octobre pour Paris 2, sans nouveau déploiement.

L'ancienne base Irlande contenait des données de test et des références à des fichiers Blob. Sa sauvegarde SQL reste hors du dépôt et ne doit pas être importée dans Paris 2.

L'administration de test agit sur la base de test. Elle ne doit pas servir à modifier les données réelles après lancement. Le besoin confirmé est une administration des données réelles à l'adresse `https://www.carnetpass.fr/administration-interne`, avec la même interface de gestion mais reliée à la base Production. Le code prépare cet accès sans l'activer : par défaut l'API Production renvoie 404. Le serveur n'accepte l'ouverture que sur la branche `main`, avec `CARNETPASS_PRODUCTION_ADMIN_ENABLED=true` et `CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF` égal à la référence du projet Production utilisé par `VITE_SUPABASE_URL`. La référence Preview est toujours refusée. Ces deux variables doivent être limitées à l'environnement Vercel **Production** et ne doivent pas être configurées maintenant tant que les contrôles ci-dessous ne sont pas terminés.

## Vérifications authentifiées restantes

### Documents techniques sur Paris 2

Le propriétaire a confirmé le 5 octobre que les PDF publiés dans Paris 2 doivent être accessibles aux professionnels ayant un abonnement et une entreprise vérifiée. La préparation locale rattache l'import et le catalogue au même garde-fou que l'administration Production. Les PDF déposés restent privés et attendent une validation explicite du droit de diffusion ; seuls les documents approuvés et confirmés entrent dans le catalogue. Les nouveaux chemins Blob Production sont séparés des chemins Preview. Le catalogue Production refuse les comptes de démonstration ou en essai Découverte.

Cette préparation n'est pas publiée. Avant de l'activer : vérifier les variables Blob privées et `BLOB_WEBHOOK_PUBLIC_KEY` en Production, attribuer explicitement le rôle fondateur au compte Paris 2 prévu, tester avec deux comptes la séparation administrateur/utilisateur ordinaire, puis essayer le dépôt, la validation, le téléchargement et la lecture du PDF par un professionnel vérifié. Vérifier aussi qu'un compte non vérifié n'accède pas au catalogue. Les documents déjà présents en Preview ne sont pas copiés automatiquement vers Paris 2.

1. Dans Vercel, relever les **noms et portées** des variables de Preview et Production : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, ainsi que les variables Stripe propres à chaque environnement. Ne pas transmettre les valeurs secrètes. Déterminer si un projet Supabase Production distinct existe déjà avant de prévoir sa configuration.
2. Confirmer que le domaine de test est toujours assigné à la branche Preview et que la Production est construite depuis `main` ; noter les SHA effectivement servis. Une ancienne copie locale de `.env.preview.local` n'est pas une preuve de la configuration Vercel actuelle.
3. Dans Supabase, inventorier les projets réellement utilisés et les migrations appliquées. Le dépôt contient 38 fichiers SQL, mais il ne faut pas les appliquer en bloc sans comparer l'état réel de chaque base. Vérifier particulièrement les rôles internes et l'accès Entreprise avant tout test d'écriture.
4. Avec deux comptes Preview distincts, vérifier que le fondateur accède à l'administration, qu'un compte normal reçoit 403, et que l'ajout/retrait d'un collaborateur respecte les rôles. Tester les opérations d'entreprise sur des données de démonstration, puis contrôler la trace d'audit. Prévoir un compte fondateur Production confirmé et son rôle `platform_admins` dans la base Production ; ne jamais copier les données ou les droits de Preview en bloc.
5. Préparer la future version Production avec son projet Supabase distinct et ses variables correctement ciblées. Après autorisation explicite de production, publier le nouveau code, tester d'abord la connexion, puis seulement activer le verrou d'administration et vérifier les accès fondateur/compte ordinaire ainsi qu'une opération de gestion sur une fiche prévue pour ce test.

La préparation peut se poursuivre pendant que le propriétaire importe des documents en Preview. L'import/validation des documents reste aujourd'hui limité à la Preview par un garde-fou distinct ; aucun PDF, index ou historique n'est copié automatiquement vers Production. Avant d'activer l'administration réelle : identifier l'emplacement des données réelles actuelles, choisir un projet Supabase Production distinct des deux références ci-dessus, inventorier les migrations et les rôles, séparer ou démontrer l'isolation des clés Redis utilisées par les crédits, puis vérifier le compte fondateur et un compte sans droit. Ne pas créer de projet, copier de données, configurer de secret ou déployer sur la seule base des noms « Preview »/« Production » affichés dans les tableaux de bord.

Ne pas déclarer la phase 1 terminée tant que ces contrôles ne sont pas documentés avec leurs résultats.
