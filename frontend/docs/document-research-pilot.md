# Recherche documentaire interne — pilote Preview

Le pilote couvre uniquement **De Dietrich MCR 2 24**, référence **7841749**. Il est disponible sur `/admin/recherche-documents` avec le compte Supabase confirmé `contact@carnetpass.fr`, uniquement lorsque `VERCEL_ENV=preview`.

## Ce que fait la recherche

- Lit un petit index de liens publics du fabricant, vérifiés manuellement, sans interroger une API payante.
- Compare les résultats aux documents de la fiche `src/data/equipment/de-dietrich-7841749.json` à l'aide du code documentaire.
- Affiche la source, le PDF public, l'éditeur, le type, le modèle, la langue, la date, le niveau de confiance et les variantes.
- Propose EasySAV et Pièces Express comme recherches **manuelles**. Aucun téléchargement automatisé n'est fait sur ces sites.
- Limite l'accès à cinq consultations par heure et par compte via Upstash.

Le résultat n'est jamais une autorisation de réutilisation. Même un PDF du fabricant doit être vérifié pour la variante exacte et pour les droits de copie, d'hébergement et d'indexation.

## Pour ajouter un document après validation humaine

1. Vérifier sur le PDF le modèle, la référence constructeur, la langue, la révision et les pages utiles. Rejeter ou isoler les variantes proches.
2. Vérifier que l'hébergement dans CarnetPass et l'indexation pour Shiba sont autorisés. Conserver la preuve de cette autorisation hors du catalogue public.
3. Vérifier le code documentaire et l'empreinte SHA-256 pour éviter les doublons.
4. Ajouter le document à la fiche de l'équipement, puis utiliser `scripts/import-rag-document.mjs` **uniquement après validation**. Ce script extrait le texte, crée les passages et embeddings et régénère le registre RAG ; il peut consommer l'API OpenAI.
5. Lancer `npm test` et `npm run build`. La vérification `test/document-research.test.js` couvre le pilote et le rappel de la vue éclatée pour une question de référence de pièce.

Le pilote n'implémente pas encore la recherche générale par marque ou le processus d'approbation persistant. Il n'ajoute aucun document aux données ni à Shiba.
