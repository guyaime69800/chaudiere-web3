# Import Chappée — 19 octobre 2026

20 vues éclatées, 20 fiches, 36 associations de références issues du suivi EasySAV. Archive préparée : output/import-chappee-20261019/import-chappee.zip. Taille, signature PDF et SHA-256 de chacun des 20 fichiers vérifiés pendant la préparation. Aucun nouveau téléchargement de documents.

Le composant existant d’import groupé propose désormais une option de publication et indexation Shiba après l’import. La confirmation des références et droits de diffusion reste non précochée et est réinitialisée lors du changement d’archive. La sélection de publication repose sur les empreintes, types et références de l’archive effectivement choisie, et non plus sur un lot daté fixe. Aucune carte de publication distincte réintroduite.

Le parcours réutilise r2-init/PUT/r2-complete, puis l’API approve/index existante. Vérification des doublons, arrêt sur erreur sans relance automatique, maintien des contrôles serveur et de la maintenance. Le bilan distingue les nouvelles indexations prêtes des états à vérifier, sans présenter un besoin OCR comme un succès.

19 tests ciblés réussis ; lint ciblé réussi. Publication et indexation réelles non exécutées par les outils : aucune session administrative connectée accessible. L’utilisateur doit sélectionner l’archive dans son administration, confirmer ses vérifications et lancer l’opération. Ne pas annoncer les 20 documents comme importés ou indexés avant le bilan du traitement.
