# Notices communes visibles sur les modèles couverts

Diagnostic Paris 2 en lecture seule : les notices Vaillant sont approuvées, diffusées et indexées ; plusieurs possèdent des `model_aliases`. La construction des cartes n'attachait les PDF qu'à leur référence principale. La lecture d'une carte secondaire ne présentait donc que sa vue éclatée.

Le catalogue construit désormais les cartes principales, puis rattache les notices d'installation et d'utilisation à chaque carte existante explicitement citée par les références du PDF. Marque et catégorie identiques exigées, comparaison de référence exacte normalisée, dédoublonnage par ID. Aucun héritage par gamme, aucune propagation d'une vue éclatée ou d'un alias d'un autre document. Aucun changement de base ni de couverture administrative.

L'écran affiche les titres lisibles et distingue « Voir la vue éclatée » de « Voir la notice ». La rubrique des notices communes liste les références associées au même PDF. Les modèles VU FR 1006/5-5 et autres libellés FR /5-5 rejoignent la famille ecoTEC plus, sans fusion des références. Un rafraîchissement reconstruit aussi les documents du modèle ouvert pour ajouter ou retirer les associations mises à jour.

Shiba : l'appel fournit la référence sélectionnée. Le serveur relit les références/alias, catégorie, publication et indexation de tous les documents ; il exige une intersection commune exacte pour la référence sélectionnée, ou refuse. Aucune confiance dans la seule référence cliente ou dans une chaîne d'alias. Les contrôles d'accès professionnels ne sont pas modifiés.

Vérifications : 17 tests ciblés et ESLint réussis ; build réussi. Navigateur local avec métadonnées publiées lues en production et API simulées : VU 146/5-5 R2 affiche vue + notice d'installation commune et références couvertes. Capture `tmp/catalogue-browser/shared-notice.png`. Aucun appel payant Shiba ni accès à un compte client réel dans ce test.

Déploiement `dpl_CNbdNwcqNyEZkVZVN7DNABwcpWPK`, https://carnetpass-ekzpoz560-chaudiere-web3.vercel.app, vérifié et promu. Maintenance, protections et activation contrôlée des achats conservées.
