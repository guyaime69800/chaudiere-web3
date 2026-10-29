# Stripe production : préparation du 20 octobre 2026

## État réel

Les quatre identifiants transmis sont enregistrés dans `server/lib/stripe-production-catalog.js`.
Un audit en lecture seule vérifie le compte attendu, son activation, les prix, les produits actifs,
les montants, les périodicités et la métadonnée des comptes supplémentaires.
Il ne crée aucun client, abonnement, paiement, facture, webhook ou droit d'accès.
Les appels Stripe de cet audit sont exclusivement des GET.

Le parcours applicatif de paiement reste réservé à Preview. Le raccordement réel n'est pas terminé.
Ne pas remplacer les prix de test dans le gestionnaire existant : son stockage et ses contrôles
de mode sont propres aux tests. La maintenance et les achats fermés sont conservés.

## Prochaine intervention dans Vercel

Dans le projet `carnetpass`, Settings → Environment Variables :

1. Ajouter `STRIPE_SECRET_KEY` avec la clé secrète **du compte de production**, type Sensitive,
   environnement Production seulement. Ne pas la transmettre dans une conversation.
2. Ajouter `STRIPE_EXPECTED_ACCOUNT_ID` avec l'identifiant `acct_…` du même compte, vérifié
   directement dans Stripe. Ne pas utiliser l'identifiant du bac à sable.
3. Ne pas ajouter de variable `VITE_` pour la clé secrète. Ne pas activer les achats.

L'audit s'exécute ensuite dans un environnement serveur disposant de ces deux variables :

```text
node scripts/audit-stripe-production.mjs
```

Il affiche uniquement les noms des tarifs vérifiés et les contrôles encore nécessaires.
Il refuse les clés de test, le mauvais compte et un compte non activé. Aucun appel réel
n'a été exécuté pendant cette préparation ; les vérifications effectuées sont simulées.
Un résultat positif ne prouve pas la fiscalité d'une facture ni la bonne attribution des droits.

## Vérification réelle complémentaire du 20 octobre

Après ajout des variables par Guy dans Vercel, le contrôle a été adapté aux clés restreintes
`rk_live_` et exécuté dans le build d'un déploiement isolé, avec `--prod --skip-domain`.
Les secrets sont restés dans Vercel ; aucune extraction locale ni impression de leur valeur.

Résultat API : `ok: true` pour le compte attendu, autorisations de paiement et de virement
actives, et les quatre prix `pro`, `additionalAccount`, `recharge100`, `recharge200` conformes.
Les contrôles incluent les produits actifs live, la devise EUR, les montants, les périodicités,
la métadonnée du siège et son appartenance au même produit que Pro.
Les seules requêtes Stripe sont cinq GET. Aucun paiement ou droit n'a été créé.
L'audit n'a pas validé les autres permissions d'écriture de la clé.

Déploiement d'audit : `https://carnetpass-mf29thesl-chaudiere-web3.vercel.app`.
Aucune promotion sur le domaine public. Les achats restent fermés et la maintenance inchangée.
Les sept tests du module de catalogue passent, y compris la clé restreinte ; ESLint passe.

## Travail encore nécessaire avant encaissement

- Implémenter le Checkout live séparé, avec validation de l'entreprise, CGV, MFA et idempotence.
- Ajouter une migration non appliquée puis valider la synchronisation durable des abonnements,
  des sièges payés et des crédits. Éviter d'utiliser le seul solde Redis pour de l'argent réel.
- Implémenter et tester le webhook live signé : doublons, événements désordonnés, échecs,
  reprises, remboursements et contestations. Ne pas configurer une destination live sur le
  gestionnaire Preview actuel.
- Raccorder le portail client, les résiliations et les réductions de sièges en fin de période.
- Vérifier les factures, les taxes, les totaux, les impayés et l'expiration des droits.
- Tester les interfaces avec les achats fermés, puis décider séparément de l'ouverture.

## Vérification locale

11 tests passent : catalogue live et refus des paramètres invalides, audit sans écriture,
absence de fuite des clés dans les erreurs, contrôles de SIRET et parcours de sièges Preview.
Ces tests ne constituent pas un paiement réel ni une validation de bout en bout du futur parcours live.
