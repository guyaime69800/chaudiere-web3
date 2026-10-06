# Parcours d'abonnement professionnel — préparation

## État actuel du dépôt

- L'inscription crée un compte Supabase Auth. Le parcours d'accueil crée ensuite une entreprise, un membre `owner` et une ligne `subscriptions`.
- La ligne démarre avec `plan = free` et `status = active`. Les valeurs de plan prévues en base sont `free`, `pro` et `enterprise` ; les statuts sont `active`, `trialing`, `past_due` et `canceled`.
- Le tableau de bord lit le plan et affiche « Découverte », « Professionnel » ou « Entreprise ». Aucune offre chiffrée ni condition de facturation n'est affichée.
- Aucun SDK Stripe, identifiant de prix, endpoint de Checkout, webhook de paiement ou portail de facturation n'existe dans le dépôt. Les fonctions professionnelles vérifient l'identité et la validation de l'entreprise, mais n'appliquent pas encore de droits selon le plan.

## Décisions nécessaires avant le parcours payant

1. Offres réellement commercialisées, fonctions et limites de chaque offre.
2. Prix validés, périodicités, devise, affichage HT/TTC et période d'essai éventuelle.
3. Compte Stripe en mode test et identifiants de prix correspondant aux offres validées.
4. Politique de perte d'accès après impayé ou résiliation, et traitement des données déjà créées.

Le propriétaire a confirmé que Production et Preview utilisent le même projet Supabase. Les deux variables publiques correspondantes sont maintenant enregistrées dans les deux environnements Vercel.

## Parcours à implémenter après ces décisions

1. Présenter les offres validées avec leurs prix et conditions sur une page publique. L'inscription crée le compte puis l'entreprise, sans changer directement le plan en base.
2. Seul le propriétaire ou un administrateur de l'entreprise peut demander une session Checkout. L'API authentifie le membre et choisit elle-même l'identifiant de prix dans une liste de prix autorisés ; le navigateur n'envoie jamais un montant libre.
3. Checkout Stripe en mode `subscription` et mode test. La redirection de succès affiche un état d'attente ; elle ne donne aucun droit payant à elle seule.
4. Un webhook Stripe vérifie la signature sur le corps brut, traite les événements de façon idempotente, relie le client et l'abonnement Stripe à l'entreprise, puis met à jour plan, statut et échéance avec la clé serveur. Le navigateur n'écrit pas ces champs.
5. Les fonctions payantes contrôlent les droits côté serveur à chaque appel. Les fonctions déjà disponibles en formule gratuite restent accessibles selon l'offre validée.
6. Le portail client Stripe permet de consulter les factures, changer le moyen de paiement et demander la résiliation. Le webhook synchronise l'état final et la fin de période.

La migration devra conserver une correspondance unique `company_id` ↔ `stripe_customer_id`, enregistrer `stripe_subscription_id`, l'identifiant de prix, `cancel_at_period_end` et les événements Stripe traités. Les règles RLS actuelles laissent les membres lire leur abonnement et réservent l'écriture au service ; cette séparation doit rester en place.

## Validation en mode test et Preview

- Vérifier inscription, création d'entreprise et formule gratuite.
- Payer une offre avec une carte de test Stripe ; contrôler le webhook et le droit effectif côté serveur.
- Tester échec de paiement, renouvellement, double livraison de webhook et résiliation en fin de période.
- Vérifier qu'un membre non administrateur ne peut ni acheter ni résilier pour l'entreprise, et qu'un navigateur ne peut pas modifier son plan.
- Contrôler les parcours sur `test.carnetpass.fr` avant toute demande de mise en Production. Aucune clé ou prix Stripe réel n'est activé dans cette préparation.

## Préparation de l'offre au 27 septembre 2026

Le propriétaire a révisé la proposition : Découverte (essai 5 jours, 5 équipements, 20 questions Shiba), Pro (1 technicien, 25 € HT/mois, 200 questions IA/mois), Équipe (une facture de 35 € HT/mois pour jusqu'à 5 personnes, 200 questions IA/mois/technicien) et Entreprise sur étude. Ces montants sont affichés sur `/tarifs` comme une proposition, sans paiement actif.

Le code de Preview limite Découverte à 20 questions pour toute la période de cinq jours et Pro à 200 par mois et par technicien. Le compteur est côté serveur, commun aux deux API Shiba ; les questions déjà consommées par le précédent compteur mensuel restent comptées. `enterprise` reste sans limite commerciale définie ; la protection par adresse IP existante s'applique. L'offre Équipe n'a pas encore de valeur distincte dans l'enum `subscription_plan` ; le quota de `pro` s'appliquerait à ses techniciens, sous réserve de finaliser la modélisation.

L'essai de cinq jours sans SIRET et le plafond de cinq équipements sont préparés dans `frontend/supabase/migrations/20260927_01_create_discovery_equipment.sql` et le code de l'application. **La migration n'est pas encore appliquée à Supabase** : le parcours d'ajout ne peut être testé en Preview avant son application. La base étant commune à Preview et Production, cette opération change aussi la base du site public. Les places d'équipe, la facturation et la résiliation ne sont pas activées.

## Décision du 6 octobre 2026 : accès aux documents pendant l'essai

Le propriétaire a confirmé que les documents constructeur publiés sont accessibles au compte Découverte pendant les cinq jours d'essai, sans validation du SIRET. Cet accès aux documents se termine à l'échéance de l'essai ou dès que les 20 questions Shiba incluses sont consommées. Ce quota Découverte est commun aux membres d'une même entreprise et contrôlé côté serveur en Production. Les documents non publiés restent privés. Les carnets déjà créés ne doivent pas être bloqués par l'épuisement des questions Shiba. Les questions posées en Production avant l'activation de ce compteur ne peuvent pas être reconstituées et ne sont donc pas déduites des 20 questions.

Références techniques : [abonnements Stripe](https://docs.stripe.com/billing/subscriptions/build-subscriptions), [webhooks Stripe](https://docs.stripe.com/webhooks), [horloges de test Stripe](https://docs.stripe.com/billing/testing/test-clocks).
