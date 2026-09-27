# Essai Stripe en Preview

Le parcours de paiement reste fermé tant que les variables ci-dessous ne sont pas configurées. Il utilise uniquement les tarifs de test Stripe : Pro (25 €/mois) et Équipe (35 €/mois).

## Préparation

1. Appliquer `supabase/migrations/20260928_01_stripe_test_billing.sql` dans le projet Supabase CarnetPass. Cette migration crée une table de test séparée : elle ne modifie pas `subscriptions` et ne donne aucun droit payant réel.
2. Dans Vercel, ajouter **uniquement pour Preview** :
   - `STRIPE_TEST_SECRET_KEY` : clé secrète `sk_test_…` du compte Stripe de test CarnetPass.
   - `STRIPE_TEST_WEBHOOK_SECRET` : secret `whsec_…` de l'endpoint webhook créé à l'étape suivante.
   - `VITE_STRIPE_TEST_BILLING_ENABLED` : `true`.
3. Dans Stripe **environnement de test**, créer un endpoint webhook `https://test.carnetpass.fr/api/stripe-webhook` pour `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` et `customer.subscription.deleted`. Choisir les événements du compte, en format snapshot.
4. Dans Stripe **environnement de test**, activer le portail client et autoriser les changements entre les deux tarifs ainsi que la résiliation. Configurer l'effet de la résiliation selon le comportement voulu.
5. Redéployer la Preview après avoir ajouté les variables Vercel.

Ne mettre aucune clé Stripe dans `VITE_…` sauf l'indicateur booléen. Ne jamais réutiliser une clé `sk_live_…` pour ce test.

## Vérification

Depuis un compte administrateur CarnetPass confirmé, ouvrir « Paramètres du compte » puis « Voir les formules ». Choisir Pro ou Équipe et payer avec une carte de test indiquée dans la documentation Stripe. Revenir aux paramètres et vérifier la ligne « Stripe test ». Ouvrir le portail pour changer de formule ou résilier ; vérifier ensuite la mise à jour de la ligne.

La table `stripe_test_subscriptions` n'affecte ni les accès ni la facturation réelle. L'activation des formules payantes exigera un raccordement de production distinct et la validation des conditions commerciales.
