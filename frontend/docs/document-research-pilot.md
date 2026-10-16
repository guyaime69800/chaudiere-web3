# Assistant documentaire interne — pilote de développement

L'assistant ne fait plus partie de l'application CarnetPass. Il n'a ni page ni API publique. Il produit un dossier de recherche dans le dépôt, pour examen par l'administrateur avant toute importation.

## Premier modèle

Depuis `frontend` :

```powershell
node scripts/research-documents.mjs --brand="De Dietrich" --model="MCR 2 24" --reference=7841749
```

Le résultat est `research/reports/de-dietrich-mcr-2-24-7841749.md`. Il rassemble les documents déjà présents, deux liens publics du fabricant, les variantes proches, les doublons et les points à valider. Le dossier est régénéré à chaque lancement de la commande.

Ce premier pilote utilise des liens constructeur examinés pour un seul modèle. Il ne lance aucune recherche Web, ne télécharge aucun PDF et ne consomme aucune API payante. Les autres modèles, les PAC et les climatisations ne sont pas encore pris en charge par cette commande.

## Validation et intégration

1. Examiner chaque lien et PDF depuis le site du fabricant. Comparer modèle, puissance, génération et référence constructeur. Une notice de gamme ne suffit pas à valider une variante.
2. Vérifier les droits de copie, stockage, redistribution et indexation ; conserver la preuve. EasySAV et Pièces Express restent des recherches manuelles, sans téléchargement automatisé. Respecter notamment la limite EasySAV de 20 fichiers.
3. Vérifier les doublons par code documentaire et, si le fichier a été fourni légalement, par SHA-256.
4. Après approbation explicite, ajouter le document validé à la fiche du modèle puis utiliser le processus documentaire existant (`scripts/import-rag-document.mjs`). Cette étape peut écrire dans Vercel Blob et consommer l'API OpenAI ; elle ne fait pas partie de la commande de recherche.
5. Régénérer et valider le registre avec les scripts existants. Tester que Shiba cite le document du bon modèle, et la vue éclatée pour une référence de pièce.

Le premier dossier est un inventaire de pistes, pas une autorisation d'hébergement. Aucun document n'est ajouté au catalogue ou au RAG par cette commande.
