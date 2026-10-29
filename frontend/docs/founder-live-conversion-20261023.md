# Conversion de l'entreprise du fondateur — 23 octobre 2026

Après la vérification du SIRET effectuée par l'utilisateur, celui-ci autorise la préparation puis la conversion de son ancienne entreprise de démonstration en compte réel. Aucun achat ni débit n'est demandé ou effectué.

Précontrôle Paris 2 : une seule entreprise de démonstration nommée « CarnetPass — tests fondateur », créée et détenue par le fondateur actuel, SIRET approuvé et identique au SIRET vérifié, un membre, zéro équipement, zéro liaison Stripe live et zéro commande live. Ancienne formule enterprise résiliée depuis le 21 octobre, non gérée par Stripe live. Le registre officiel confirme un établissement actif, mais masque la dénomination ; aucune identité non diffusible ni adresse n'est recopiée. Le nom commercial connu « CarnetPass » est utilisé.

Transaction opérationnelle ciblée, sans modification de schéma : `tmp/founder-convert-live-20261023.sql`. Verrouille l'entreprise et l'abonnement, revalide les conditions, refuse toute commande ou liaison Stripe nouvelle. Retire `is_demo`, remplace le libellé par « CarnetPass », transforme l'ancien abonnement en plan free avec statut canceled, limite un siège et conserve une échéance d'essai passée. Aucun droit Pro, Entreprise ni nouvel essai n'est accordé. SIRET et validation, identité Auth, propriétaire et rôle administratif ne changent pas.

Sauvegarde opérationnelle avant changement : `tmp/founder-conversion-before-20261023.json`. Résultat : `tmp/founder-conversion-after-20261023.json`. Empreinte des données privées de facturation TEST identique avant/après. Aucun objet TEST modifié ou converti en live.

Contrôle final SQL : nom CarnetPass, is_demo=false, vérification approved, plan free/status canceled, un siège, essai passé, zéro liaison Stripe live et zéro commande live. Les données satisfont désormais les conditions métier préalables à une souscription Pro, sous réserve de la connexion propriétaire et de l'acceptation des CGV. La disponibilité effective du bouton doit être confirmée depuis la session de l'utilisateur. Le paiement et la livraison de ses droits réels restent à effectuer par le parcours normal.

L'administration conserve son accès de lecture du catalogue et son espace TEST privé. La maintenance et les interrupteurs commerciaux existants ne changent pas. Aucun déploiement requis : uniquement deux lignes de données mises à jour dans une transaction contrôlée.
