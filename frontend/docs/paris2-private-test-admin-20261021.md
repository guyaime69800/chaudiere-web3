# Administration et tests dans Paris 2

## Correctif de synchronisation de la résiliation TEST

Le portail Stripe avait programmé la résiliation au 21 novembre 2026, mais le module ne lisait que `cancel_at_period_end`. En facturation flexible, Stripe renvoie ce booléen à false et renseigne `cancel_at`. Le module reconnaît maintenant également une date `cancel_at` égale à la fin de période de l'unique poste vérifié. Un abonnement déjà résilié ne porte plus le marqueur de résiliation future. Les contrôles de paiement, de propriétaire, de mode TEST et de périmètre privé restent requis.

Audit distant en lecture seule : Checkout complete/paid, 2800 centimes EUR ; abonnement active, ancien booléen false, date de résiliation égale à la fin de période, `2026-11-21T13:01:19.000Z`. Aucune modification Stripe ni synchronisation de la base réalisée par cet audit. La prochaine vérification demandée par l'utilisateur mettra à jour le marqueur privé.

Vérifications : 13 tests ciblés réussis, ESLint et build réussis. Déploiement `dpl_2KPvdt3KvEFvFdsmJFCtM2gQDMKJ` (`carnetpass-ifnejmnh5-chaudiere-web3.vercel.app`). Les routes d'achat/portail/webhook LIVE restent fermées, et l'API admin refuse les requêtes anonymes.

Référence : https://docs.stripe.com/billing/subscriptions/billing-mode/compare#cancellations-in-the-customer-portal

## Correctif du retour externe Stripe

L'utilisateur a rencontré une page « Accès refusé » à `/administration-interne?test=1` après Checkout. Le cookie admin HttpOnly/Secure/SameSite=Strict (durée 300 secondes) n'est pas envoyé lors de la navigation externe et peut expirer pendant le paiement. Les anciens tests avec en-tête Authorization global ne reproduisaient pas cette frontière navigateur.

Ajout de `/retour-facturation?test=1`, coquille publique sans données privées. Elle restaure le cookie uniquement après POST même origine avec jeton Supabase vérifié, rôle fondateur courant et MFA. Sans session, propose la connexion interne ; si MFA nécessaire, utilise le parcours existant puis revient à la restauration. Aucune valeur de redirection arbitraire acceptée. Les anciennes sessions revenant à l'URL admin exacte sont redirigées 303 vers cette coquille ; l'admin et ses API restent protégés. SameSite=Strict, HttpOnly, Secure et durée inchangés.

Les nouvelles sessions Checkout/portail utilisent ce retour. Les anciennes configurations de portail de test ne sont pas modifiées ; une configuration de retour v2 dédiée sera créée au besoin.

Vérifications : 12 tests ciblés, ESLint et build réussis. Test navigateur HTTPS local avec vrai cookie Secure/SameSite=Strict, lien depuis un site externe fictif et aucun en-tête Authorization global pendant le retour : cookie absent à la première navigation, restauration vérifiée et retour admin réussis. Cinq profils et révocation de rôle toujours vérifiés. Le premier essai de ce scénario a échoué sur l'encodage du lien de la page externe fictive, corrigé sans changement des contrôles d'accès.

Audit distant en lecture seule du Checkout déjà stocké : `status=complete`, `payment_status=paid`, `amount_total=2800`, `currency=eur`, `livemode=false`, client et métadonnées d'espace vérifiés. Aucune création de paiement ni écriture d'abonnement effectuée par cet audit. L'utilisateur doit ensuite synchroniser l'état de test dans l'admin.

Déploiement correctif READY `dpl_2iCy9ShAJDPrAUEWgg8VMSZBRALN` : https://carnetpass-h9tzbhmem-chaudiere-web3.vercel.app. Contrôles HTTP avant publication : ancien retour 303, coquille 200, admin sans session 401, API privée sans session 401 ; achats live et maintenance conservés.

## Raccordement des parcours de test

Migration supplémentaire `20261021123257_admin_test_workflows.sql` appliquée et enregistrée dans Paris 2 : `carnetpass_test.records` et `carnetpass_test.billing`, RLS, droits clients révoqués, RPC SECURITY INVOKER `admin_test_command` réservée au service. Le propriétaire est déduit du compte fondateur vérifié côté serveur et recontrôlé en base. Aucun `company_id` fourni par le navigateur ne choisit un périmètre. Écritures idempotentes, 300 objets maximum par espace, lectures de scans refusées après deux heures, nettoyage des scans expirés lors des écritures. Verrou de facturation de 90 secondes avec jeton vérifié avant chaque écriture.

Dans « Mon compte de test » : saisie manuelle d'équipement, scan avec le même moteur de lecture que la production et budget Redis distinct (`admin-test`), confirmation manuelle avant sauvegarde privée. Aucun fichier photo conservé. Compte rendu fictif généré par le moteur PDF existant, filigrane TEST sur chaque page et signatures explicitement absentes. Les documents privés sont régénérés à partir des instantanés de test ; aucune écriture Blob, R2, intervention, e-mail ou blockchain n'est effectuée par ces parcours.

Paiement via variable dédiée `CARNETPASS_ADMIN_TEST_STRIPE_KEY` ajoutée par l'utilisateur dans Vercel Production, valeur non révélée. Les clés live sont rejetées avant toute requête ; aucun repli vers `STRIPE_SECRET_KEY`. Prix de test mensuel 28 EUR créé seulement au premier Checkout, métadonnées et clé de recherche propres au test Paris 2, paramètres idempotents. Customer, Checkout, abonnement, portail et factures vérifiés `livemode=false` et liés au seul espace de test courant. Montant payé, devise, prix et échéance vérifiés avant état Pro TEST. Portail dédié avec annulation en fin de période et changement d'offre désactivé. Historique privé et contrôle explicite du paiement/résiliation au retour ; pas d'activation de droits dans `public.subscriptions`.

Les CGV sont acceptées dans l'interface de test et validées au serveur ; le parcours privé ne crée pas de contrat réel. Il ne valide pas la réception des webhooks live et n'ouvre pas les achats clients. Les modèles existants de documents réels ne sont pas tous reproduits : la fiche générée dans cet espace est un compte rendu de test d'équipement.

Vérifications : 33 tests Node ciblés et ESLint réussis ; PGlite vérifie accès croisés, doublons, baux de facturation et droits anonymes/authentifiés ; vérification SQL Paris 2 avec rollback réussie ; zéro alerte Supabase concernant les nouveaux objets (19 avertissements existants hors périmètre). Navigateur avec cinq profils fictifs : création d'équipement, génération et téléchargement PDF TEST réussis pour le fondateur, refus des profils non autorisés. Le premier contrôle PGlite a détecté le droit UPDATE nécessaire au verrou de ligne ; corrigé par un droit limité à la colonne id avant application distante.

Audit Stripe distant en lecture seule réussi : compte, clients, abonnements, factures, sessions Checkout, configurations de portail et prix. Aucun produit, client, paiement, abonnement ou portail réel ni de test créé par cet audit. La création réelle des objets Stripe test au premier clic et le paiement avec carte fictive restent à exécuter par l'utilisateur connecté. Le scan IA est vérifié avec fournisseur simulé ; aucune photo du fondateur n'a été traitée par l'agent.

Version finale READY : `dpl_5LWyMWNR19TPEKXoWimKUdRGmERr`, https://carnetpass-bhpzb19ol-chaudiere-web3.vercel.app. Avant publication : GET et POST de l'espace privé refusés 401 sans connexion, achats/portail live/webhook fermés 503, cron sans authentification 401, vitrine 200 et espace pro en maintenance 503. Les deux versions intermédiaires de préparation n'ont pas été promues.

## Demande et changement de direction

L'utilisateur demande des tests isolés accessibles depuis l'admin, puis précise que tout doit rester dans le projet Paris 2 : le projet Preview est suspendu et propose une évolution payante. Le rétablissement du projet Preview n'est plus requis. Même e-mail et même identité Auth que l'admin ; aucune identité ni permission admin copiée dans un projet externe.

## Effectué

- Authentification Vercel activée pour Preview (`ssoProtection.deploymentType=preview`) ; `test.carnetpass.fr` redirige vers Vercel (302 sans session), la vitrine publique reste 200. Accès technique de contournement renouvelé sans imprimer sa valeur.
- Schéma privé `carnetpass_test` dans Paris 2, RLS et révocation des permissions anon/authenticated. Registre `admin_workspaces` par fondateur, sans entreprise ni abonnement dans les tables clients.
- RPC SECURITY INVOKER `open_admin_test_workspace(uuid)`, service_role seulement, vérification du rôle founder en base. Le serveur vérifie l'identité et la MFA avant de transmettre son propre identifiant vérifié, sans accepter d'identifiant fourni par le navigateur.
- Section « Mon compte de test » dans l'admin, réservée au fondateur. Ouvre/initialise le registre privé. Aucun mot de passe ni lien d'accès externe créé.
- Ancien raccourci de scan fondateur dans la production retiré. Ancienne RPC de création de société de test révoquée ; abonnement de l'ancienne société de test nommée fermé, données historiques préservées. Ancien contournement de validation fondateur limité au projet Preview dédié, qui reste suspendu et protégé.
- Admin et APIs admin nécessitent un véritable jeton avec rôle actuel et MFA ; le passe de maintenance historique n'accorde plus l'accès aux routes admin.
- Build refuse un frontend Preview raccordé à la base de production et inversement. Le nouvel espace dans Paris 2 passe par le serveur admin, pas par une Preview branchée sur les tables clientes.

## Vérifications et déploiement

Migration `20261021121652_isolate_founder_tests.sql` appliquée et enregistrée sur `tsyukqcyfxcrjrhopvpv`. Vérification SQL distante avec rollback : privilèges privés, RLS et ouverture idempotente réussis. PGlite : rôle non fondateur refusé et permissions clients refusées. Supabase advisors : avertissements existants sur anciennes fonctions SECURITY DEFINER et protection des mots de passe compromis désactivée ; aucune alerte sur les nouveaux objets.

32 tests Node ciblés réussis, ESLint réussi, build réussi. Navigateur local avec cinq identités fictives : anonyme 401, client et collaborateur 403, opérateur et fondateur autorisés selon leur rôle ; retrait des permissions vérifié. Le compteur du test navigateur exclut désormais le simple contrôle MFA `security=1` des chargements de données admin.

Déploiement `dpl_Hars14PdVA61koeYB3fUmk2o5ojw` READY, promu : https://carnetpass-jvhuquuuu-chaudiere-web3.vercel.app. Contrôles avant publication : routes admin 401 sans session, achats/portail/webhook 503, cron anonyme 401 ; vitrine publique 200, espace pro maintenance 503. Aucun interrupteur Stripe activé.

## Limites de la fondation initiale — remplacées par le raccordement décrit en tête

Le registre privé est la fondation, pas une copie complète de l'application de test. Les parcours scan, équipements, documents et Stripe test ne sont pas encore raccordés à ce schéma. L'interface l'indique explicitement. Aucun achat, fichier ni équipement de test n'est créé dans les tables clientes. Aucun accès authentifié au compte réel du fondateur n'a été effectué par l'agent.

Les données historiques du projet Preview suspendu n'ont pas été exportées ni migrées. Le projet et ses sauvegardes n'ont pas été supprimés. Ne pas réorienter le frontend Preview existant vers Paris 2 : il utilise encore les tables de production par défaut et doit rester protégé.
