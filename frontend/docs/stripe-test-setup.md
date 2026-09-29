# Essai Stripe en Preview

Le parcours de paiement reste fermé tant que les variables ci-dessous ne sont pas configurées. Il utilise uniquement les nouveaux tarifs de test Stripe : Pro (28 € TTC/mois) et Équipe (38 € TTC/mois), avec le taux manuel français de 20 % inclus dans ces prix. Les anciens tarifs à 25 et 35 € sont seulement reconnus pour conserver l'historique des abonnements test existants.

## Préparation

1. Appliquer `supabase/migrations/20260928_01_stripe_test_billing.sql` dans le projet Supabase CarnetPass. Cette migration crée une table de test séparée : elle ne modifie pas `subscriptions` et ne donne aucun droit payant réel.
2. Dans Vercel, ajouter **uniquement pour Preview** :
   - `STRIPE_SECRET_KEY` (ou `STRIPE_TEST_SECRET_KEY`) : clé secrète `sk_test_…` du compte Stripe de test CarnetPass.
   - `STRIPE_TEST_WEBHOOK_SECRET` : secret `whsec_…` de l'endpoint webhook créé à l'étape suivante.
   - `VITE_STRIPE_TEST_BILLING_ENABLED` : `true`.
3. Dans Stripe **environnement de test**, créer un endpoint webhook `https://test.carnetpass.fr/api/stripe-webhook` pour `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` et `invoice.paid`. Choisir les événements du compte, en format snapshot. Le dernier événement déclenche le courriel CarnetPass de confirmation de facture test. Pour une facture antérieure à cet ajout, utiliser le bouton « Recevoir la confirmation du paiement test par e-mail » dans les paramètres du compte. Le courriel indique explicitement qu'il s'agit d'un test sans paiement réel.
4. Dans Stripe **environnement de test**, conserver les nouveaux tarifs mensuels Pro à 28 € et Équipe à 38 €, et le taux manuel `TVA France 20 %` marqué « inclus ». Le serveur contrôle leurs montants et le taux avant d'ouvrir un paiement. Activer le portail client pour la résiliation, les moyens de paiement et l'historique des factures. Lorsqu'un client choisit l'autre formule, CarnetPass ouvre directement la confirmation du changement, avec les proratas affichés par Stripe. Un ancien abonnement sans ce taux ne peut pas changer de formule automatiquement : ses factures restent consultables, et sa migration fiscale doit être traitée séparément.
5. Redéployer la Preview après avoir ajouté les variables Vercel.

Ne mettre aucune clé Stripe dans `VITE_…` sauf l'indicateur booléen. Ne jamais réutiliser une clé `sk_live_…` pour ce test.

## Vérification

Depuis un compte administrateur CarnetPass confirmé, ouvrir « Paramètres du compte » puis « Voir les formules ». Choisir Pro ou Équipe et payer avec une carte de test indiquée dans la documentation Stripe. Vérifier que le total reste respectivement 28 € ou 38 € et que la TVA incluse apparaît. Revenir aux paramètres et vérifier la ligne « Stripe test ». Ouvrir « Gérer mon abonnement et télécharger mes factures test », compléter au besoin le nom, l'adresse et le numéro de TVA de l'entreprise, puis télécharger une nouvelle facture et contrôler les montants HT, TVA et TTC. Pour changer de formule, choisir l'autre tarif : Stripe doit afficher la nouvelle formule et son montant avant confirmation. Un abonnement créé avec l'ancien tarif à 25 € et sans taxe nécessite une migration séparée.

La table `stripe_test_subscriptions` n'affecte ni les accès ni la facturation réelle. L'activation des formules payantes exigera un raccordement de production distinct et la validation des conditions commerciales.
