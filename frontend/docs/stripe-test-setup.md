# Essai Stripe en Preview

Le parcours de paiement reste fermé tant que les variables ci-dessous ne sont pas configurées. Le seul nouvel abonnement proposé est Pro (28 € TTC/mois). L'ancien tarif Équipe à 38 € est archivé et n'est plus proposé aux nouveaux clients ; le code reconnaît encore les anciens tarifs pour l'historique des abonnements test. Les recharges Shiba Bot sont des achats ponctuels distincts de l'abonnement.

## Préparation

1. Appliquer `supabase/migrations/20260928_01_stripe_test_billing.sql` dans le projet Supabase CarnetPass. Cette migration crée une table de test séparée : elle ne modifie pas `subscriptions` et ne donne aucun droit payant réel.
2. Dans Vercel, ajouter **uniquement pour Preview** :
   - `STRIPE_SECRET_KEY` (ou `STRIPE_TEST_SECRET_KEY`) : clé secrète `sk_test_…` du compte Stripe de test CarnetPass.
   - `STRIPE_TEST_WEBHOOK_SECRET` : secret `whsec_…` de l'endpoint webhook créé à l'étape suivante.
   - `VITE_STRIPE_TEST_BILLING_ENABLED` : `true`.
3. Dans Stripe **environnement de test**, créer un endpoint webhook `https://test.carnetpass.fr/api/stripe-webhook` pour `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` et `invoice.paid`. Choisir les événements du compte, en format snapshot. Le dernier événement déclenche le courriel CarnetPass de confirmation de facture test. Pour une facture antérieure à cet ajout, utiliser le bouton « Recevoir la confirmation du paiement test par e-mail » dans les paramètres du compte. Le courriel indique explicitement qu'il s'agit d'un test sans paiement réel.
4. Dans Stripe **environnement de test**, conserver le tarif mensuel Pro à 28 € et le taux manuel `TVA France 20 %` marqué « inclus ». Le serveur contrôle le montant et le taux avant d'ouvrir un paiement. Activer le portail client pour la résiliation, les moyens de paiement et l'historique des factures. Un ancien abonnement sans ce taux ne peut pas changer de formule automatiquement : ses factures restent consultables, et sa migration fiscale doit être traitée séparément.
5. Redéployer la Preview après avoir ajouté les variables Vercel.

Ne mettre aucune clé Stripe dans `VITE_…` sauf l'indicateur booléen. Ne jamais réutiliser une clé `sk_live_…` pour ce test.

## Vérification

Depuis un compte administrateur CarnetPass confirmé, ouvrir « Paramètres du compte » puis « Voir les formules ». Choisir Pro et payer avec une carte de test indiquée dans la documentation Stripe. Vérifier que le total reste 28 € et que la TVA incluse apparaît. Revenir aux paramètres et vérifier la ligne « Stripe test ». Ouvrir « Gérer mon abonnement et télécharger mes factures test », compléter au besoin le nom, l'adresse et le numéro de TVA de l'entreprise, puis télécharger une nouvelle facture et contrôler les montants HT, TVA et TTC. Un abonnement créé avec l'ancien tarif à 25 € et sans taxe nécessite une migration séparée.

## Recharges Shiba Bot (Preview uniquement)

- Prix ponctuels test : `price_1UMRFn8Wefijgtt2dDH6RuiH` pour 100 crédits / 10 € TTC ; `price_1UMRGc8Wefijgtt2I1X5h7zt` pour 200 crédits / 20 € TTC. Le serveur exige un prix actif, en euros, à paiement unique, avec TVA incluse, ainsi que le taux manuel français de 20 %.
- L'endpoint Stripe existant `https://test.carnetpass.fr/api/stripe-webhook` doit recevoir `checkout.session.completed` pour les cartes de test. Le code accepte aussi `checkout.session.async_payment_succeeded` si cet événement est activé. Un retour sur la page de succès ne crédite jamais le compte.
- La confirmation serveur relit la session et son unique ligne de prix chez Stripe. Un script Redis atomique ajoute les crédits au compte utilisateur une seule fois par session Checkout. Les crédits achetés ne remplacent pas les crédits mensuels et leur solde traverse le changement de mois. Les demandes IA épuisent d'abord le quota inclus, puis les crédits achetés.
- Tester avec une carte de test : paiement réussi, refusé, retour sans webhook, webhook répété, puis question Shiba après épuisement du quota. Vérifier le total et la TVA sur Checkout. Ne jamais utiliser de carte réelle ni de clé `sk_live_…`.
- Cette implémentation est limitée à la Preview. Avant une production, prévoir un registre durable des achats et des consommations, tester la reprise après incident Redis, les remboursements et la réconciliation Stripe, et confirmer les règles commerciales d'expiration des crédits.

La table `stripe_test_subscriptions` n'affecte ni les accès ni la facturation réelle. L'activation des formules payantes exigera un raccordement de production distinct et la validation des conditions commerciales.
