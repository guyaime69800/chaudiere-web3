# Contrôle du lundi

Premier contrôle prévu ensemble : lundi 26 octobre 2026. Ce document ne crée aucune tâche automatique.

Contrôle du 26 octobre réalisé : rapport `C:/dev/chaudiere-web3/output/Audit-securite-CarnetPass-2026-10-26.md`. 303 tests propres réussis, dépendances corrigées sans avis npm restant, protections navigateur ajoutées, lecture RLS réelle interentreprises et MFA vérifiée, recette collaborateur isolée réussie. Sauvegarde/restauration complète toujours non validée ; protection Supabase des mots de passe compromis désactivée. Déploiement correctif : `dpl_63GZA4dzNfhdftyaGaxHFnGgjdT6`.

1. Accès public et refus des accès anonymes privés : `node --use-system-ca scripts/verify-open-production.mjs`.
2. Tests des rôles, MFA, téléversements et signature des callbacks : `node --test test/mfa-access.test.js test/internal-access.test.js test/platform-document-upload-security.test.js`.
3. Supabase Security Advisor, politiques RLS, sessions et comptes administrateur ; examiner les changements depuis le contrôle précédent.
4. Alertes de facturation : événements en attente/revue, impayés et mails retardés ; rapprocher avec Stripe sans créer de paiement de contrôle.
5. Journaux Vercel et alertes de quota/erreurs Shiba et Polygon. Contrôler dépendances et avis de vulnérabilité, qualifier les résultats avant toute mise à jour.
6. Sauvegardes indépendantes de la base et des fichiers : dernier succès, intégrité, rétention ; tester périodiquement une restauration isolée. Au 24 octobre, procédure complète non validée et offre Supabase Free sans sauvegarde gérée accessible.
7. Petit parcours équipement/intervention/PDF dans le périmètre autorisé ; compte et données fictives identifiés, pas de paiement ni de mail réel automatique.
8. Enregistrer date, preuves, anomalies, corrections et points restant ouverts. Un contrôle hebdomadaire ne garantit pas l'absence de vulnérabilités entre deux contrôles.
