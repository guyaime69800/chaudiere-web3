# Coordonnées constructeur — 20 octobre 2026

Ajout d’une bannière d’assistance dans chaque marque du catalogue. Annuaire central dans `src/services/brandSupport.js`, avec URL officielle pour chaque contact. Aucun numéro déduit d’une marque apparentée.

Vaillant, Chappée, De Dietrich, Saunier Duval, ELM Leblanc et Bosch : assistance technique professionnelle. Chaffoteaux et Frisquet : contact constructeur, sans prétendre que le standard constitue une hotline technique. Atlantic : numéro limité aux catégories chaudières et PAC. Viessmann : renvoi vers la procédure officielle partenaire, aucun numéro public professionnel confirmé. Autres marques : numéro restant à vérifier, sans invention.

Contrôles : ESLint ciblé réussi ; cinq assertions de résolution des contacts réussies (dont accents, marque inconnue, absence de numéro Viessmann et exclusion VMC Atlantic). La compilation locale est bloquée par l’absence des variables publiques Supabase ; la compilation Vercel avec l’environnement de production a réussi. API administrative anonyme sur le déploiement immuable : HTTP 401. Pas de vérification visuelle authentifiée disponible. Aucun changement d’état de maintenance ni de donnée client.

Déploiement : `dpl_A33r8NLP7XKVLpaoBwnM9CkK8MNT`, `https://carnetpass-opcq5i8qg-chaudiere-web3.vercel.app`.
