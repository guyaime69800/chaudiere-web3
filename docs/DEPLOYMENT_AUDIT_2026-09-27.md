# État des déploiements au 27 septembre 2026

- Projet Vercel : `chaudiere-web3`, branche Production configurée `main`, dossier racine `frontend`.
- `www.carnetpass.fr` : déploiement Production `dpl_CjZMQGsT4BiM2Q7Ph6RhZN2RuEMF`. Métadonnées Git : branche `feature/documentation-multi-docs`, SHA `2b71244498e2d9d93ff426ed478e2e5dce2f759c`, `gitDirty=1`, source CLI, action `promote`, Preview d'origine `dpl_3bETdoPW6azEQ5YySjZ63RwACkU7`. Le contenu ne correspond donc pas à un commit Git exact vérifiable par ce SHA.
- `test.carnetpass.fr` : Preview Git `dpl_3UheAAvaDJidjAke41JRTS9Qiqzi`, branche `feature/documentation-multi-docs`, SHA `e6bdaf33fef1ec3b28d8e2a09a39a7297bacec78`.
- `main` local et distant : SHA `c5a6692db647eacf8d31fa76a31eda63be6e336e`. Il ne correspond pas à la Production actuellement servie.

Les lignes « Production rebuild » de Vercel proviennent des promotions CLI successives de Preview vers Production. La commande `vercel promote` crée un nouveau déploiement Production à partir de la Preview ; elle n'effectue aucune fusion vers `main`.

Le contrôle navigateur de `www.carnetpass.fr` montre une page blanche avec l'erreur `Configuration Supabase manquante`. Au moment de l'audit, `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` étaient présentes en Preview, mais absentes de l'environnement Production Vercel. Avec l'accord du propriétaire sur le choix du même projet Supabase, les deux variables Preview ont été ajoutées à Production, sans déploiement. Le déploiement actuellement servi reste blanc, car Vite intègre ces valeurs au moment de la compilation. Un nouveau déploiement Production nécessitera un accord explicite.
