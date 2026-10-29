import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';

const out='C:/dev/chaudiere-web3/output/pdf';
fs.mkdirSync(out,{recursive:true});
const pages=[];
const page=(title,subtitle,blocks)=>pages.push({title,subtitle,blocks});
const b=(title,text)=>({title,text});

page('CarnetPass, expliqué simplement','Le projet de A à Z - guide à conserver et à imprimer',[
b('À quoi sert ce livre ?','Ce guide explique ton projet avec des mots simples, comme à un enfant de CM1. Il explique aussi les vrais mots techniques : tu pourras ainsi comprendre une discussion avec un développeur, un client ou un prestataire.'),
b('L’image à garder dans la tête','Imagine un cartable pour chaque chaudière, pompe à chaleur, climatisation ou VMC. Dans ce cartable, on range les notices, les interventions et les documents utiles. CarnetPass transforme ce cartable en dossier numérique. Une étiquette avec un QR code permet de retrouver le bon dossier.'),
b('Ce document est une photographie du projet','Situation connue au 24 octobre 2026, heure de Paris. Le site est ouvert. Le guide distingue les fonctions en place, les essais réussis et les vérifications restantes. Un document écrit aujourd’hui ne garantit pas que rien ne changera demain.'),
b('Pour l’impression','Format A4, texte sélectionnable, fond blanc et couleurs sobres. Impression à taille réelle ou adaptée à la zone imprimable. Le recto verso est possible. Aucun mot de passe, clé secrète ou numéro de carte bancaire n’est inclus.'),
]);
// Page 2 is filled after the content pages are assembled.
page('Le plan du voyage','Tu peux lire le guide dans l’ordre ou chercher un chapitre.',[]);
page('1. Le problème que CarnetPass résout','Éviter de chercher les informations partout.',[
b('Avant CarnetPass','Une notice peut être dans un tiroir, un rapport dans une boîte mail et le souvenir d’une réparation dans la tête d’un technicien. Quand une autre personne intervient, elle doit recommencer les recherches. Deux appareils presque identiques peuvent aussi avoir des pièces différentes.'),
b('Avec CarnetPass','Chaque équipement possède son dossier. Le professionnel retrouve ses documents techniques et enregistre ses interventions. Le particulier peut consulter une fiche publique limitée : historique, notice d’utilisation disponible et contacts du professionnel. Le dossier complet de l’entreprise reste privé.'),
b('Un exemple très concret','Une chaudière Atlantic NAEMA reçoit un entretien. Le professionnel note la date, le type d’intervention et le résultat. Il produit un rapport. Le particulier scanne le QR code et voit qu’un entretien a eu lieu. Il ne peut pas modifier cette intervention ni lire automatiquement les notes privées.'),
b('Ce que le service ne remplace pas','CarnetPass aide à ranger, retrouver et suivre les informations. Il ne répare pas la chaudière. Il ne remplace pas un professionnel qualifié et ne garantit pas, à lui seul, la qualité des travaux ou l’exactitude de chaque information saisie.'),
]);
page('2. Les personnes et leurs clés','Tout le monde ne doit pas ouvrir les mêmes portes.',[
b('Le particulier','C’est la personne qui utilise l’appareil. Avec le QR code ou l’identifiant CarnetPass, elle consulte la fiche autorisée. Elle ne dispose pas des boutons de gestion de l’entreprise. Un abonnement professionnel n’est pas nécessaire pour cette lecture publique.'),
b('Le responsable professionnel','Il gère son entreprise, ses équipements, ses interventions et sa facturation selon ses droits. Les données de son entreprise ne doivent pas être mélangées avec celles d’une autre entreprise. Le compte principal et une place supplémentaire n’ont pas le même rôle commercial.'),
b('Le collaborateur','Il possède sa propre connexion et rejoint une entreprise grâce à une invitation. Une place supplémentaire payée représente une capacité d’accueil ; elle n’est pas encore une personne. Il faut ensuite attribuer cette place au bon compte. Un collaborateur ordinaire ne devient pas administrateur de CarnetPass.'),
b('Le fondateur et l’opérateur','Le fondateur administre la plateforme, la maintenance et les collaborateurs internes. Un rôle opérateur est prévu pour certaines tâches internes, mais pas pour commander la maintenance. Au contrôle du 24 octobre, un seul administrateur était présent : le compte du fondateur. Cette liste doit être revue régulièrement.'),
]);
page('3. Du nouveau compte à l’essai','Un parcours gratuit, mais limité dans le temps.',[
b('Le début du parcours','La personne crée son compte, confirme son adresse email puis ouvre son espace professionnel. Si elle n’a pas encore d’entreprise associée, le bouton de démarrage ouvre le formulaire d’activité. Le nom et le téléphone sont demandés ; le SIRET reste facultatif pendant l’essai.'),
b('La formule Découverte','Les règles actuelles prévoient cinq jours et jusqu’à cinq équipements. Une carte bancaire n’est pas demandée pour commencer cet essai. L’essai donne un accès encadré : cela ne signifie pas que toutes les fonctions payantes et tous les quotas sont illimités.'),
b('Pourquoi un deuxième compte peut être bloqué','Une nouvelle adresse email ne permet pas forcément de recommencer : l’adresse et le numéro de téléphone déjà utilisés servent à limiter les essais répétés. Un téléphone déclaré n’est toutefois pas une preuve certaine de l’identité. Le blocage de ton second compte a été expliqué ; aucune exception n’a été accordée, conformément à ta décision.'),
b('À la fin','Le service ne doit pas inventer un nouvel essai ni transformer automatiquement un utilisateur gratuit en abonné payant. Pour souscrire à Pro, il faut satisfaire les conditions professionnelles et confirmer un paiement. La fin de l’essai ne veut pas dire que les dossiers sont automatiquement effacés.'),
]);
page('4. Le SIRET et la réalité d’une entreprise','Vérifier une référence ne prouve pas toute une identité.',[
b('SIRET : la carte d’identité d’un établissement','Le SIRET contient quatorze chiffres. Il identifie un établissement dans les registres administratifs. Une entreprise peut avoir plusieurs établissements. Ce nombre ne doit pas être inventé pour contourner une difficulté d’inscription.'),
b('Le contrôle utilisé','CarnetPass interroge l’API officielle de recherche des entreprises avec le SIRET. Ce contrôle est programmé : ce n’est pas un agent IA qui se promène librement sur Internet. Pour l’accès Pro normal, le SIRET doit être valide dans le parcours et correspondre au résultat enregistré.'),
b('Pourquoi le texte a été corrigé','Le tableau de bord dit maintenant « SIRET vérifié ». L’ancien texte « Entreprise validée » pouvait faire croire qu’une enquête complète avait été réalisée. Le nouveau texte explique que le contrôle ne certifie ni l’identité de la personne connectée ni son autorisation à représenter l’entreprise.'),
b('La décision prise','Nous gardons l’email confirmé et le contrôle automatique du SIRET. Nous n’ajoutons pas une validation manuelle systématique avant chaque abonnement. Un contrôle humain peut être réalisé en cas de doute ou de signalement. Aucun rappel automatique de validation manuelle n’a été mis en place.'),
]);
page('5. Le travail quotidien du professionnel','De l’appareil au rapport.',[
b('Identifier le bon équipement','Le professionnel choisit le type, la marque, le modèle et la référence. La référence exacte est importante : NAEMA, NAEMA 2 et une variante Micro ne sont pas interchangeables. Une photo de plaque peut aider au préremplissage, mais les données doivent être relues avant confirmation.'),
b('Ouvrir le dossier','Le dossier rassemble les documents du modèle et les documents propres à cet appareil. Une notice constructeur est partagée entre plusieurs appareils du même modèle ; un rapport d’intervention appartient à un dossier précis. Confondre les deux pourrait montrer le mauvais document au mauvais client.'),
b('Enregistrer une intervention','On précise notamment sa date, son type et son résultat. Des notes et des informations techniques peuvent rester privées. La confirmation de la preuve Polygon est une étape distincte de la simple saisie. Le public ne voit que les interventions éligibles et confirmées.'),
b('Produire un document','Le service peut générer des rapports et des documents selon le parcours utilisé. Un PDF est une feuille numérique. Son ouverture, son téléchargement et sa copie de secours sont trois contrôles différents. Une capture montrant un PDF ouvert ne prouve pas que toutes ses copies sont protégées contre une perte.'),
]);
page('6. Le parcours du particulier','Voir ce qui est autorisé, sans modifier.',[
b('L’entrée visible sur l’accueil','Le bouton « Particulier - consulter mon équipement » conduit à la recherche publique. Le particulier peut aussi scanner directement l’étiquette de l’appareil. Le lien pour préparer un projet de travaux est une autre entrée : ce n’est pas la même chose que lire un historique.'),
b('Ce que montre le QR code','Le parcours convenu conserve l’historique public, la notice d’utilisation disponible et les contacts publiés du professionnel. Les informations d’identité de l’équipement servent à reconnaître l’appareil. Les données internes, les notes de diagnostic et les comptes rendus détaillés restent privés.'),
b('Un exemple réellement vérifié','La fiche CP-2026-000033 a affiché une intervention d’entretien résolue du 24 octobre. La première vue mobile était vide avant actualisation ; la suivante a montré l’événement et la preuve confirmée. Un bouton d’actualisation a été ajouté pour relire l’historique sans rescanner.'),
b('Une fiche publique n’est pas un accès propriétaire','Toute personne ayant le QR code peut potentiellement ouvrir la partie publique. Il faut donc choisir avec soin ce qui y figure. « Lecture seule » veut dire que la personne peut regarder les informations prévues, mais pas enregistrer ou modifier des interventions de l’entreprise.'),
]);
page('7. La bibliothèque de documents','Une référence précise vaut mieux qu’un nom ressemblant.',[
b('Les trois familles de documents','La notice d’utilisation explique l’usage quotidien. La notice d’installation s’adresse aux professionnels qui posent et règlent l’appareil. La vue éclatée montre les pièces séparées et leurs repères : imagine un dessin de construction dont les pièces flottent pour mieux les identifier.'),
b('Le catalogue','Chaque document reçoit une marque, une référence, une catégorie et une identité de fichier. Certains PDF concernent plusieurs modèles. Une association explicite permet de réutiliser ce fichier sans inventer qu’il couvre tous les modèles voisins. Une notice commune ne signifie pas qu’une vue éclatée est commune.'),
b('Les notices professionnelles et publiques','Un document visible dans le catalogue professionnel n’est pas automatiquement autorisé sur la fiche publique. Il faut vérifier son usage, sa référence et son exposition. Les droits des fabricants et les conditions de la source doivent aussi être respectés ; télécharger un fichier ne donne pas automatiquement le droit de le redistribuer.'),
b('Les contrôles de fichier','La taille, la signature PDF et l’empreinte du fichier aident à vérifier l’intégrité. Une empreinte SHA-256 est comme une très longue étiquette calculée à partir du contenu. Elle aide à repérer un doublon ou une modification, mais ne prouve pas que le document contient une information vraie.'),
]);
page('8. EasySAV et le collecteur','Récupérer et ranger les documents avec méthode.',[
b('EasySAV : la bibliothèque source','EasySAV est un service documentaire extérieur à CarnetPass. Son compte et ses conditions d’accès sont distincts. Être connecté dans ton navigateur habituel ne veut pas forcément dire que le navigateur du collecteur utilise la même session.'),
b('Le collecteur : un assistant de rangement','C’est un programme qui visite les modèles autorisés, récupère les documents dans la limite prévue et conserve un état d’avancement. Il utilise un profil de navigateur dédié. On ne lance pas deux collectes en même temps avec ce même profil : un verrou évite cette collision.'),
b('Playwright : les mains du navigateur','Playwright est un outil qui peut ouvrir une page, cliquer sur un bouton et lire le résultat comme un utilisateur. Exemple : ouvrir la fiche ThemaFast V25, reconnaître les documents proposés, puis télécharger le fichier demandé. Cela ne lui donne pas le droit de contourner un accès refusé.'),
b('Quota et bilan du 24 octobre','La limite appliquée au collecteur est de vingt tentatives par jour, toutes marques confondues ; une tentative incertaine compte aussi. Tu avais déclaré zéro téléchargement manuel ce jour-là. La campagne a produit vingt PDF uniques : quatorze vues éclatées et six notices partagées. Des archives ont été préparées ; leur présence ne prouve pas, à elle seule, que tout a été publié dans le catalogue.'),
b('La prochaine reprise','Quatre variantes ThemaFast restaient à inspecter : M-Condens 26-AS/1 M, M-Condens 31-AS/1 M, V25 et V25 R1. On relit le quota, la connexion et les doublons avant de reprendre. Les références exactes sont gardées dans le suivi du collecteur.'),
]);
page('9. Shiba Bot et les documents','Un assistant qui cherche avec des sources.',[
b('L’IA : un outil qui peut se tromper','Une intelligence artificielle calcule une réponse à partir de ce qu’on lui fournit et de ce qu’elle a appris. Elle ne comprend pas un appareil comme un chauffagiste présent sur place. Une réponse convaincante peut être fausse : il faut donc pouvoir vérifier la page citée.'),
b('Le RAG expliqué avec une bibliothèque','RAG signifie « génération augmentée par recherche ». Imagine qu’un élève commence par retrouver la bonne page dans un livre, puis prépare sa réponse en s’appuyant sur cette page. CarnetPass peut chercher des passages du bon document avant de demander une réponse à Shiba professionnel.'),
b('Passages et embeddings','Un long PDF peut être découpé en passages. Un embedding est une liste de nombres qui représente approximativement le sens d’un texte pour retrouver des passages proches. C’est un index de recherche, pas une preuve que la réponse est exacte. La marque, la référence, les pages et les droits restent nécessaires.'),
b('Shiba professionnel','Il peut aider sur les documents et, selon le mode, sur des sources Web. Des quotas et crédits encadrent l’usage. Les crédits Shiba ne sont ni de l’argent sur un compte bancaire ni les jetons POL de la blockchain. La disponibilité et les sources doivent être contrôlées avant utilisation.'),
]);
page('10. Shiba public : ce qui existe vraiment','Le même personnage peut utiliser un mécanisme différent.',[
b('Le cas Atlantic NAEMA','Les trois documents étaient présents dans le catalogue professionnel. Pourtant, Shiba public restait inactif : sa liste séparée ne reconnaissait alors qu’un modèle Airwell. Le problème était le raccordement public, pas l’absence de notice dans le catalogue.'),
b('La correction réalisée','La référence Atlantic 021240 a été explicitement ajoutée, avec une notice d’utilisation constructeur. L’identifiant de catalogue NAEMA212-021240 est reconnu. Une variante voisine n’est pas activée simplement parce que son nom ressemble. Le lien d’ouverture utilise maintenant le bon fabricant et la bonne page.'),
b('Ce que Shiba public sait répondre ici','Sur cette référence, il propose actuellement quelques réponses préparées et sourcées : horaires avec Navilink, absence prolongée et orientation en cas de panne. Ce petit système fonctionne par sujets reconnus, sans appel à une IA générale pour inventer une réponse. Il ne lit pas librement tous les PDF du catalogue.'),
b('Exemple et limites','Une question sur la programmation a renvoyé une réponse avec la page 6 de la notice Atlantic. Une question non couverte doit recevoir une réponse de limite plutôt qu’une invention. Le parcours public annonce cinq questions mensuelles par visiteur et appareil ; son compteur utilise une empreinte liée à l’adresse réseau et au CarnetPass, pas une identification parfaite de chaque personne.'),
]);
page('11. Shiba Devis, aides et scan de plaque','Des fonctions utiles, avec leur propre périmètre.',[
b('Shiba Devis','C’est un questionnaire pour préparer un projet. Il rassemble des informations et peut produire un récapitulatif. Une estimation n’est pas un devis signé par une entreprise. Les calculs de montants prévus côté serveur suivent des règles ; on ne laisse pas une IA inventer librement une somme.'),
b('Les aides financières','Une aide dépend du projet, du logement, du foyer, des dates et des règles applicables. Une valeur inconnue ne doit pas être affichée comme zéro. Le projet prévoit une administration des règles : comparer les sources officielles, valider et publier les versions. La présence du module ne prouve pas que tous les barèmes sont à jour ou publiés.'),
b('RGE','RGE signifie « Reconnu garant de l’environnement ». C’est un signe de qualification lié à des activités et des conditions précises. Déclarer une qualification dans un formulaire n’est pas la même chose que vérifier sa validité dans l’annuaire adapté. Cette vérification est distincte du SIRET.'),
b('La photo de plaque','Le scan aide à lire une référence ou un numéro sur une photo. Une image est contrôlée, réduite et transmise au service d’analyse selon le parcours. L’utilisateur corrige les champs avant enregistrement. L’absence de conservation par défaut dans CarnetPass ne constitue pas une promesse de rétention nulle chez tous les fournisseurs.'),
]);
page('12. Les outils du site que l’on voit','Les briques de l’écran.',[
b('HTML et CSS','HTML décrit ce que contient une page : titre, paragraphe, bouton, formulaire. CSS choisit son apparence : tailles, couleurs, espaces et disposition. Imagine un cahier : HTML écrit les cases et les textes ; CSS choisit la règle, les marges et les couleurs. Une page doit rester lisible sur téléphone et sur ordinateur.'),
b('JavaScript','C’est le langage qui fait réagir la page et une partie du serveur. Exemple : cliquer sur « Actualiser l’historique », demander les données puis afficher la réponse. JavaScript dans le navigateur ne doit jamais être le seul gardien des permissions : un utilisateur peut essayer d’envoyer ses propres requêtes.'),
b('React et React DOM','React permet de fabriquer l’interface avec des morceaux réutilisables, appelés composants : carte d’équipement, formulaire, fenêtre de PDF. React DOM relie ces composants à la page du navigateur. Si l’état « chargement » change, React met à jour la partie correspondante de l’écran.'),
b('React Router','C’est le panneau indicateur du site. Il associe une adresse à un écran, par exemple les paramètres ou l’espace professionnel. Changer d’adresse ne suffit pas à obtenir un droit : les API vérifient encore la personne. Masquer un lien ne sécurise donc pas, à lui seul, la fonction derrière ce lien.'),
]);
page('13. Préparer le site pour le publier','De l’atelier au service en ligne.',[
b('Node.js','Node.js fait fonctionner du JavaScript hors du navigateur. Dans ce projet, il sert aux scripts, aux tests et aux fonctions serveur. Image : le navigateur est la salle de classe ; Node.js est aussi capable de travailler dans l’atelier, même si personne ne regarde une page.'),
b('npm et package.json','npm installe les bibliothèques du projet et lance des commandes. Le fichier package.json ressemble à une liste de fournitures et de recettes : quelles briques utiliser, comment construire et tester. Une bibliothèque est du code déjà fabriqué ; elle doit être mise à jour avec discernement, car elle peut aussi avoir des défauts.'),
b('Vite','Vite aide au développement puis prépare les fichiers pour Internet. Le build, ou construction, rassemble et optimise les ressources. Le dossier dist contient le résultat prêt à être servi. Un build réussi confirme que la fabrication a abouti ; il ne prouve pas que chaque parcours métier fonctionne.'),
b('PWA, service worker et installation','Le projet utilise un plugin PWA. Une PWA peut donner une expérience proche d’une application installée. Un service worker aide à gérer certaines ressources et leur cache. Ce n’est pas une garantie que toutes les fonctions fonctionnent hors ligne. Une ancienne page en cache peut aussi nécessiter une actualisation après publication.'),
]);
page('14. Vercel, domaine et API','Le bâtiment qui accueille CarnetPass.',[
b('Vercel','Vercel héberge le site et exécute ses fonctions serveur. Le navigateur reçoit les fichiers de l’interface ; les opérations sensibles passent par des fonctions côté serveur. Exemple : demander un paiement, vérifier un rôle ou délivrer un document privé. Héberger n’est pas la même chose que développer ou posséder les données.'),
b('Domaine et HTTPS','carnetpass.fr est l’adresse facile à retenir, comme l’adresse d’une maison. DNS est l’annuaire qui dirige cette adresse vers le bon service. HTTPS chiffre la communication en route. Le cadenas du navigateur ne garantit pas que tout le logiciel est sans erreur : il protège d’abord le transport.'),
b('API et JSON','Une API est un guichet avec des demandes précises. Le navigateur demande par exemple l’historique d’un CarnetPass ; le serveur répond avec des données structurées. JSON est une façon de ranger ces données avec des noms et des valeurs. Une réponse 401 signifie généralement qu’une connexion valable est nécessaire ; 403 indique un accès refusé.'),
b('Middleware et réécritures','Le middleware est un contrôle placé tôt sur le chemin de la requête : maintenance, accès interne, orientation. Une réécriture dirige une adresse publique vers la fonction qui la traite. Le nom d’une route ne suffit pas pour comprendre sa sécurité : il faut suivre le trajet jusqu’au vrai contrôle serveur.'),
]);
page('15. Supabase et PostgreSQL','La grande armoire bien organisée.',[
b('Supabase','Supabase fournit plusieurs services au projet : comptes de connexion, base de données et outils de gestion. Le projet de production utilisé est appelé Paris 2 et se trouve dans la région parisienne du fournisseur. Cela ne veut pas dire que chaque autre prestataire de CarnetPass utilise la même région.'),
b('PostgreSQL','C’est le moteur de la base. Il organise des tables, comme des cahiers avec des colonnes : entreprises, membres, équipements, interventions et abonnements. Chaque élément reçoit un identifiant. Une relation relie, par exemple, un équipement à son entreprise et une intervention à son équipement.'),
b('SQL et migration','SQL est le langage utilisé pour lire ou modifier la base. Une migration est un changement rangé dans l’ordre : ajouter une table, une règle ou une fonction. Imagine les plans successifs d’un bâtiment. On garde l’historique pour savoir ce qui a été installé et pour éviter les changements manuels oubliés.'),
b('Transaction et RLS','Une transaction rassemble des opérations qui doivent réussir ensemble ou être annulées ensemble. Exemple : créer une entreprise et son responsable. RLS signifie « sécurité au niveau des lignes » : la base vérifie quelles lignes une personne peut lire ou modifier. Le filtrage par entreprise est essentiel ; une simple connexion ne suffit pas.'),
]);
page('16. Connexion, rôles et double serrure','Reconnaître une personne puis vérifier ce qu’elle peut faire.',[
b('Authentification et autorisation','L’authentification répond à « qui es-tu ? ». L’autorisation répond à « as-tu le droit ? ». Un client peut être correctement connecté et ne pas avoir le droit d’ouvrir l’administration. Un rôle est une fonction définie par le service : propriétaire, collaborateur, opérateur ou fondateur.'),
b('Session, jeton et cookie','Une session garde une connexion active. Un jeton est une preuve temporaire présentée au serveur, comme un badge. Un cookie est une petite information conservée par le navigateur. Un cookie qui écrit simplement « founder » ne rend personne fondateur : le serveur doit vérifier le badge et le rôle réel.'),
b('MFA ou double authentification','MFA signifie plusieurs facteurs d’authentification. En plus du mot de passe, une autre preuve est demandée. C’est comme une porte avec deux serrures. Pour l’administration, le code vérifie le niveau de session attendu et le rôle courant, pas seulement ce que l’écran affiche.'),
b('Ce qui a été contrôlé','Le 24 octobre, la base montrait un seul administrateur fondateur, avec un facteur MFA validé. Des tests ont vérifié que professionnels, collaborateurs et opérateurs ne commandent pas la maintenance. Quinze requêtes réelles anonymes, avec faux jeton ou faux cookies ont été refusées. Cela ne certifie pas les accès directs aux consoles des fournisseurs ni l’absence de toute vulnérabilité.'),
]);
page('17. Redis et les petites mémoires rapides','Le tableau d’affichage du service.',[
b('Redis et Upstash','Redis est une mémoire rapide qui retrouve une valeur grâce à une clé. Upstash fournit le service Redis utilisé. Imagine un tableau avec des étiquettes : état de maintenance, compteur, session temporaire ou fiche QR. Ce stockage ne doit pas être confondu avec une sauvegarde de toute la base.'),
b('TTL et quota','TTL veut dire durée de vie. Une information peut disparaître automatiquement après un délai. Un quota est une limite d’usage : nombre de questions ou de requêtes. Exemple : un ticket temporaire pour confirmer une lecture de plaque, ou un compteur pour éviter les demandes trop fréquentes.'),
b('Limitation de débit','Le rate limiting ralentit les abus en limitant les requêtes sur une période. Pense à un tourniquet qui n’accepte qu’un certain nombre de passages. Cela aide contre les robots et les coûts excessifs, mais ce n’est ni une identification parfaite des personnes ni une protection magique contre toutes les attaques.'),
b('Cron : le réveil du serveur','Une tâche cron se lance à un horaire ou intervalle prévu. Le projet configure notamment un rapprochement Stripe toutes les cinq minutes et des tâches de rappels/nettoyage. La présence d’une tâche dans la configuration ne prouve pas que chaque fonction optionnelle est active. Le contrôle de sécurité quotidien et l’audit du lundi, eux, n’ont pas été automatisés.'),
]);
page('18. Les fichiers : Blob, R2 et PDF','Des étagères différentes de la base.',[
b('Vercel Blob et Cloudflare R2','Ces services stockent des fichiers. La base garde leurs références, tandis que le fichier lui-même vit dans un stockage d’objets. Une migration du catalogue vers R2 a été préparée avec contrôle d’intégrité. Les pièces privées et les documents du catalogue ne suivent pas nécessairement le même chemin.'),
b('Objet, bucket et lien signé','Un objet est un fichier rangé sous une clé. Un bucket est son grand conteneur. Un lien signé ressemble à un ticket d’entrée temporaire : il autorise un accès précis pendant une durée limitée. Ce lien ne doit pas être affiché à une personne qui n’a pas les droits nécessaires.'),
b('S3 et le SDK AWS','S3 est un modèle d’interface de stockage largement utilisé. R2 accepte une interface compatible. Le SDK AWS est une boîte à outils de code capable d’envoyer ou de lire un objet via cette interface. Utiliser ce SDK avec R2 ne signifie pas que tous les fichiers du projet sont hébergés chez AWS.'),
b('PDF.js, jsPDF et les archives','PDF.js affiche les pages PDF dans le navigateur. jsPDF fabrique des PDF à partir du code. fflate aide à compresser et préparer des archives ZIP. Un ZIP est comme une valise contenant plusieurs fichiers. La lisibilité d’une page, l’autorisation de son accès et la possibilité de la restaurer sont trois sujets distincts.'),
]);
page('19. Stripe et l’abonnement','La caisse et le ticket de paiement.',[
b('Le rôle de Stripe','Stripe traite les paiements et gère les abonnements. Le navigateur peut être envoyé vers une page Stripe de paiement ou de gestion. CarnetPass doit ensuite vérifier ce qui s’est réellement passé avant d’accorder les droits. Une simple page « merci » ou une adresse de retour ne suffit pas.'),
b('Les prix de CarnetPass configurés','Le compte principal Pro est à 28 euros par mois. Une place supplémentaire est à 20 euros par mois : principal plus une place donne 48 euros par mois. Des packs de crédits Shiba existent séparément : 100 crédits pour 10 euros et 200 pour 20 euros dans le catalogue configuré. Ces montants décrivent CarnetPass, pas un abonnement Supabase ou Vercel.'),
b('Webhook et signature','Un webhook est un message envoyé automatiquement par Stripe au serveur : imagine un ticket de caisse transmis à l’arrière-boutique. Une signature permet de contrôler sa provenance et son intégrité. Le serveur relit aussi les objets utiles et vérifie le client, la devise, l’offre et le paiement avant de modifier les droits.'),
b('Idempotence : une seule conséquence','Un message peut arriver deux fois. L’idempotence évite de compter deux paiements, deux crédits ou deux actions pour le même événement. C’est comme tamponner un ticket déjà utilisé. Le projet enregistre les événements et leurs états, et rapproche les informations en cas de retard ou de reprise.'),
]);
page('20. Résiliation, remboursement et place','Trois actions à ne pas confondre.',[
b('Résilier','Résilier arrête le renouvellement selon la date choisie. Une résiliation en fin de période peut laisser l’accès actif jusqu’à la date déjà payée. Une annulation immédiate peut avoir un autre effet. Le portail et l’état réel de l’abonnement doivent être lus avant d’expliquer le résultat au client.'),
b('Rembourser','Rembourser renvoie un montant d’un paiement au client. Ce n’est pas automatiquement la conséquence d’une résiliation. La facture peut garder son état comptable « payée », tout en affichant séparément le remboursement intégral ou partiel. Les frais fournisseur et le délai bancaire sont des questions distinctes.'),
b('Ajouter une place','Le service calcule d’abord un récapitulatif sans payer. Une augmentation peut entraîner un prorata : le prix correspondant au morceau de mois restant. Ton écran indiquait 19,99 euros maintenant puis 48 euros mensuels pour principal et une place. Ce paiement a été reporté : la place supplémentaire n’a pas été achetée pendant ce test.'),
b('Inviter et retirer','Après confirmation du paiement, la place peut être attribuée à un collaborateur grâce à une invitation liée à son adresse. Retirer son accès, réduire la capacité facturée et résilier le compte principal ne sont pas des actions équivalentes. Les scénarios techniques isolés ont réussi ; le parcours complet de place en conditions réelles reste à vérifier.'),
]);
page('21. Les emails et les relances','Une lettre envoyée n’est pas forcément une lettre reçue.',[
b('Resend et les emails de CarnetPass','Resend est le service d’envoi utilisé par certaines fonctions transactionnelles. Transactionnel signifie lié à une action du service : confirmation ou notification utile. Un test explicitement autorisé a été accepté par le fournisseur puis reçu dans ta boîte. Cela valide ce test précis, pas tous les modèles de messages.'),
b('Les emails Stripe','Stripe peut envoyer ses propres reçus, avis de remboursement et relances selon les réglages. Tu as activé plusieurs options et reçu le reçu du paiement du 24 octobre. Il ne faut pas confondre les préférences de notifications de ton compte Stripe avec les emails envoyés à tes clients.'),
b('Échec de paiement','Les réglages montrés prévoient jusqu’à huit tentatives sur deux semaines pour les cartes, un état en retard après échec et une annulation après épuisement des tentatives. Ce n’est donc pas forcément un arrêt au premier refus. Les exceptions des moyens de paiement et les changements de réglages doivent être pris en compte.'),
b('Confirmation de résiliation','Une automation Stripe de confirmation a été préparée sans questionnaire de commentaire. CarnetPass possède aussi un mécanisme de message pour une résiliation future : mise en file, reprise et contrôle de l’état courant. Un message accepté par un fournisseur ne prouve pas à lui seul sa réception : les indésirables, rebonds et adresses erronées existent.'),
]);
page('22. Polygon et la blockchain','Un registre de preuves, pas une baguette magique.',[
b('Blockchain et Polygon','Une blockchain est un registre partagé de transactions. Polygon est le réseau utilisé pour les preuves de CarnetPass. Imagine un cahier dont les pages sont contrôlées par plusieurs acteurs et dont l’historique est difficile à réécrire. Ce registre ne doit pas recevoir les dossiers privés complets.'),
b('Empreinte, transaction et confirmation','Une empreinte représente un contenu par un résultat calculé. Une transaction inscrit une opération sur le réseau ; son identifiant permet de la retrouver. Une confirmation indique qu’elle a été incluse selon les contrôles prévus. Cela aide à tracer une preuve, pas à garantir qu’un technicien a bien réalisé un travail.'),
b('POL et frais de réseau','POL est le jeton utilisé pour payer les frais sur Polygon. Les frais, aussi appelés gas, rémunèrent le traitement d’une transaction. Le portefeuille technique du service doit avoir une réserve suffisante. Les alertes surveillent cette réserve ; elles n’achètent pas automatiquement de nouveaux jetons.'),
b('Solidity, contrat, ethers et Hardhat','Solidity est le langage des contrats du projet. Un smart contract est un programme exécuté sur la blockchain. ethers relie le code JavaScript au réseau et aux contrats. Hardhat est un atelier de développement et de test de ces contrats. Une clé privée autorise des signatures : elle doit rester secrète, jamais dans un QR, un navigateur public ou ce guide.'),
]);
page('23. Sécurité et protection des données','Plusieurs protections qui se complètent.',[
b('Séparer public et privé','Une fiche QR publique ne doit pas renvoyer les notes internes, identités privées et mesures détaillées d’un dossier. Le serveur choisit les champs qu’il renvoie. Même si quelqu’un modifie la page sur son téléphone, cela ne doit pas lui permettre d’obtenir d’autres champs ou d’écrire dans la base.'),
b('Secrets et variables d’environnement','Une variable d’environnement est un réglage du service. Certaines sont publiques ; d’autres sont des secrets, comme une clé serveur ou un secret de signature. Une clé publique sert à joindre le bon service, pas à remplacer les permissions. Une clé d’administration peut contourner des restrictions : elle reste uniquement côté serveur et doit être protégée.'),
b('RGPD','Le RGPD est le règlement européen sur les données personnelles. L’image simple : ne collecter que ce qui est utile, expliquer pourquoi, limiter les accès et permettre l’exercice des droits. Une preuve blockchain immuable rend la prudence indispensable : les informations directement identifiantes et les documents privés ne doivent pas y être publiés.'),
b('Ce que CarnetPass prévoit','Les fonctions d’export et d’effacement de dossiers sont encadrées par les droits, des confirmations et un suivi de nettoyage. Supprimer un dossier n’annule pas automatiquement un abonnement. Les factures, le compte et les notices communes n’ont pas forcément la même durée de conservation. La conformité n’est pas prouvée par le seul choix d’un outil ou par une phrase sur la page d’accueil.'),
]);
page('24. Les outils pour fabriquer et vérifier','Le travail de l’atelier technique.',[
b('VS Code, terminal et PowerShell','VS Code est un éditeur pour lire et modifier les fichiers du projet. Un terminal est une fenêtre où l’on écrit des commandes. PowerShell est le langage de commandes Windows utilisé ici. Exemple : lancer les tests ou préparer un import. Une commande peut agir sur de vrais fichiers : il faut connaître sa cible avant de l’exécuter.'),
b('Git et les worktrees','Git conserve l’historique des versions du code. Un worktree est un dossier de travail lié au même dépôt, utile pour isoler une préparation. Le dossier de livraison utilisé pour CarnetPass est distinct de la vieille copie de travail. On ne déploie pas une autre copie simplement parce qu’elle porte un nom similaire.'),
b('Codex et les scripts','Codex est l’assistant de développement utilisé dans cette collaboration : il aide à lire, modifier et vérifier le code avec les outils disponibles. Un script est une suite d’instructions enregistrée dans un fichier. L’assistant peut faire des erreurs : une phrase « c’est fait » doit être appuyée par un résultat vérifié. Il ne remplace pas les comptes rendus ni les décisions du propriétaire.'),
b('CLI, ESLint et tests Node','Une CLI est un outil en ligne de commande : Vercel CLI et Supabase CLI permettent d’agir sur ces services. ESLint repère des erreurs et incohérences de code. Le lanceur de tests Node compare des résultats attendus aux résultats obtenus. Des tests réussis réduisent certains risques ; ils ne constituent pas une preuve de sécurité absolue.'),
]);
page('25. Essais, publication et surveillance','Ne pas confondre une simulation et une preuve réelle.',[
b('PGlite et Playwright','PGlite permet d’exécuter PostgreSQL dans un environnement local léger pour certains tests. Playwright pilote un navigateur pour vérifier des écrans et des parcours. Un test isolé utilise des utilisateurs, paiements ou emails fictifs pour éviter de toucher aux vrais clients. Il ne prouve pas que tous les fournisseurs réels répondront comme les simulations.'),
b('Production et Preview','La production est le service utilisé par les clients. Une Preview sert à préparer et vérifier une version séparée. L’ancien projet Preview est resté intact et ne doit pas être supposé actif ou restauré. Les environnements ne doivent pas partager au hasard leurs secrets, clients ou données.'),
b('Déploiement et promotion','Un déploiement prépare une version sur Vercel. La promotion fait utiliser cette version à l’adresse de production. Le travail suit la cible, le build et les contrôles avant publication. Les journaux indiquent les résultats des actions. Un retour arrière de code ne remet pas automatiquement une base de données ou un contrat blockchain dans son ancien état.'),
b('La routine convenue','Chaque jour : documents selon le quota et contrôle rapide des alertes. Chaque lundi : revue plus approfondie des accès, permissions, dépendances, journaux et sauvegardes. Cette routine n’a pas été programmée automatiquement dans cette session ; elle doit être lancée ensemble. Un test de volume local du catalogue jusqu’à mille modèles a réussi, mais ce n’est pas une mesure de nombreux utilisateurs simultanés.'),
]);
page('26. Ce qui est validé et ce qui reste','Le bilan honnête au 24 octobre 2026.',[
b('Parcours réel déjà observé','Paiement principal de 28 euros, reçu reçu par email, facture visible, remboursement précédent et résiliation précédente. Un équipement et une intervention ont été créés dans le parcours testé. Le rapport PDF a été ouvert et l’historique public est apparu sur téléphone en lecture seule. Une réponse Shiba publique a été testée pour la référence NAEMA concernée.'),
b('Sécurité contrôlée','Rôle fondateur unique observé, MFA validée, refus des accès anonymes et des faux badges sur les routes contrôlées, tests de séparation des rôles et de données privées. Le contrôle du SIRET est automatique. Ces résultats portent sur les scénarios examinés, pas sur une garantie universelle et permanente.'),
b('Vérifications restantes','Le compte supplémentaire n’a pas été payé ni essayé de bout en bout en réel. Le téléchargement du rapport doit être confirmé si seul son affichage a été observé. Les parcours isolés de collaborateur et de facturation ont réussi, mais ne remplacent pas tous les essais des vrais emails et fournisseurs.'),
b('Le point important : les copies de secours','Le projet Supabase est resté sur l’offre Free, sans sauvegarde gérée accessible sur la page contrôlée. Tu as choisi de ne pas souscrire à Pro. Une procédure indépendante complète de sauvegarde de la base ET des fichiers, avec restauration testée, reste à finaliser. Le site est ouvert par ta décision ; cela ne transforme pas ce point restant en contrôle réussi.'),
]);
page('27. Enregistrer, sauvegarder, restaurer','Trois mots différents à retenir absolument.',[
b('Enregistrer','C’est ranger le travail dans son emplacement normal. Exemple : tu ajoutes un rapport PDF au dossier et tu peux le rouvrir demain. Enregistrer est indispensable au fonctionnement, mais l’original peut encore subir une suppression, une erreur ou un incident.'),
b('Sauvegarder','C’est faire une copie de secours récupérable, séparée et protégée. Imagine une copie du cahier dans un autre endroit. Une sauvegarde de base ne comprend pas automatiquement les PDF rangés dans un stockage de fichiers. Une copie R2 de migration ou un ZIP d’import n’est pas forcément une sauvegarde de tous les dossiers clients.'),
b('Restaurer','C’est reconstruire un service ou retrouver un fichier à partir de la copie de secours. Pour prouver qu’une sauvegarde est utile, il faut essayer de la relire dans un environnement isolé, vérifier les données et les accès. On ne restaure pas la production pour faire un simple exercice, car cela peut remplacer des données récentes.'),
b('Le plan à terminer','Définir quoi copier, où, à quelle fréquence, pendant combien de temps et qui peut y accéder. Chiffrer les copies sensibles, surveiller les échecs et tester la restauration. Mesurer combien de données pourraient manquer après un incident et combien de temps le service pourrait être interrompu. D’ici là, conserver aussi les documents originaux nécessaires.'),
]);
page('28. Le dictionnaire des mots techniques','Une fiche mémo pour relire sans se perdre.',[
b('Les choses que tu vois','Interface : les écrans et boutons. Frontend : la partie qui fonctionne dans le navigateur. Responsive : une présentation qui s’adapte à la taille de l’écran. QR code : un code en carrés que l’appareil photo lit. PDF : un document dont la mise en page est conservée. PWA : un site offrant certaines possibilités d’une application installable.'),
b('Les choses derrière l’écran','Backend : les traitements du serveur. API : un guichet de demandes. Base : l’armoire des données structurées. Stockage d’objets : l’étagère des fichiers. Cache : une copie temporaire pour aller plus vite. TTL : le temps avant expiration. Cron : un réveil de tâches automatiques. Quota : une limite de consommation.'),
b('Les mots de confiance','Authentifier : reconnaître le compte. Autoriser : accorder une action précise. MFA : plusieurs preuves de connexion. RLS : permissions sur les lignes de la base. Signature : contrôle d’origine ou d’intégrité selon le mécanisme. Hash : empreinte calculée. Chiffrement : transformer une information pour qu’elle ne soit lisible qu’avec les bonnes clés. Un hash n’est pas un chiffrement réversible.'),
b('Les mots du travail','Bug : un défaut du logiciel. Correctif : une modification pour le résoudre. Test : une vérification avec un résultat attendu. Audit : un examen organisé avec preuves et limites. Build : la fabrication du site prêt à publier. Déploiement : l’installation d’une version. Journal : la trace d’événements. Idempotence : répéter une demande sans répéter son effet.'),
]);
page('29. Les références et le dernier mot','Retrouver l’information sans révéler les secrets.',[
b('D’où vient ce guide ?','Il est fondé sur les échanges et captures du projet, le code de la livraison CarnetPass, son package.json, ses migrations SQL et les notes de contrôle au 24 octobre 2026. Les dates et résultats sont ceux observés : ce guide ne prétend pas effectuer un nouvel audit complet de tous les services au moment de l’impression.'),
b('Repères dans le projet','Dossier de livraison : tmp/security-production-release-20261016/frontend. Notes principales : docs/preopening-review-20261024.md ; docs/weekly-security-review.md ; docs/shared-notices-catalog-20261023.md ; docs/shiba-devis-production.md ; docs/company-data-self-service-2026-10-12.md. Les documents plus anciens peuvent décrire une préparation ou un état dépassé.'),
b('Sites officiels utiles','CarnetPass : carnetpass.fr. Documentation des outils : react.dev ; vite.dev ; nodejs.org ; supabase.com/docs ; vercel.com/docs ; developers.cloudflare.com/r2 ; upstash.com/docs ; docs.stripe.com ; resend.com/docs ; docs.polygon.technology ; playwright.dev ; git-scm.com. Ces adresses servent à retrouver les définitions et procédures ; les offres, limites et tarifs peuvent évoluer.'),
b('La phrase à retenir','CarnetPass est un dossier numérique par équipement, avec des accès adaptés à chaque personne. Les documents aident à comprendre, les droits protègent, les paiements ouvrent les fonctions prévues et les preuves aident à tracer. La confiance se construit avec des contrôles concrets et des copies récupérables, pas avec une promesse de fiabilité à 100 %.'),
]);

pages.splice(pages.length-1,0,
 {title:'Complément A. OpenAI et les outils de lecture',subtitle:'Le fournisseur, le modèle et le personnage ne sont pas la même chose.',blocks:[
 b('OpenAI : le fournisseur de capacités IA','OpenAI fournit les services de modèles utilisés par certaines fonctions du projet. Un modèle est le système qui traite une demande et calcule une réponse. Shiba est le nom du personnage et de l’interface CarnetPass, pas le nom du fournisseur. Le projet contient le SDK OpenAI, une bibliothèque qui permet au serveur de demander ces traitements.'),
 b('Prompt, tokens et coût','Un prompt est la consigne et le contexte transmis au modèle. Un token est un petit morceau de texte utilisé dans le traitement. Exemple : une question, quelques passages de notice et une demande de citer les pages. Le coût d’un service IA et les crédits visibles dans CarnetPass sont deux comptages différents. Une jauge de crédits CarnetPass ne donne pas le solde bancaire du fournisseur.'),
 b('OCR et Tesseract.js','OCR signifie reconnaissance optique de caractères : lire des lettres dans une image, comme une plaque ou un PDF scanné. Tesseract.js fait partie des outils déclarés du projet. L’analyse de plaque décrite dans le parcours serveur utilise aussi des capacités d’analyse d’image OpenAI ; la présence de Tesseract dans les dépendances ne signifie pas que tous les scans passent par lui.'),
 b('Canvas et Markdown','Canvas sert à dessiner ou traiter une image avec du code. Le projet déclare @napi-rs/canvas pour des traitements serveur. Markdown est une écriture simple pour des titres, listes et liens. react-markdown permet de présenter certaines réponses. Un texte mis en forme proprement n’est pas pour autant une information vérifiée.'),
 ]},
 {title:'Complément B. QR et outils de ce guide',subtitle:'Les petites pièces ont aussi un rôle précis.',blocks:[
 b('Fabriquer et lire un QR code','qrcode.react produit les petits carrés du QR code dans l’interface. Le scanner QR du projet permet de les lire avec une caméra. Le QR code ne contient pas nécessairement tout le dossier : il peut seulement contenir une adresse. Le serveur décide ensuite quelles informations cette adresse peut montrer.'),
 b('Contrat, ABI et portefeuille','Un portefeuille contrôle une ou plusieurs clés de signature. Ce n’est pas un dossier de PDF. Une ABI est la description des boutons qu’un programme blockchain expose : la bibliothèque ethers s’en sert pour lui parler. Les outils de portefeuille et contrats existent dans le code ; leur présence ne signifie pas qu’un particulier doit posséder un portefeuille pour lire son QR.'),
 b('Les outils du PDF que tu lis','Ce guide a été composé avec un script JavaScript et jsPDF. Une police Arial a été intégrée pour garder les accents à l’impression. PDF.js et un outil canvas ont ensuite transformé toutes les pages en images pour les vérifier visuellement. Le sommaire relie ses lignes aux pages. Les pages ont aussi été relues sous forme de texte pour repérer les caractères abîmés.'),
 b('Comment choisir le bon outil','Le navigateur présente, la base range les données, le stockage garde les fichiers, Stripe encaisse et la blockchain trace des preuves. Un outil ne fait pas tout. Exemple : une facture Stripe ne remplace pas un rapport d’entretien ; un rapport d’entretien ne remplace pas une sauvegarde ; une sauvegarde ne vérifie pas l’identité d’un utilisateur.'),
 ]},
 {title:'Complément C. La carte de CarnetPass',subtitle:'Une vue simple des chemins principaux.',diagram:true,blocks:[]}
);

const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
doc.addFileToVFS('Arial.ttf',fs.readFileSync('C:/Windows/Fonts/arial.ttf').toString('base64'));
doc.addFont('Arial.ttf','Arial','normal');
doc.addFileToVFS('ArialBold.ttf',fs.readFileSync('C:/Windows/Fonts/arialbd.ttf').toString('base64'));
doc.addFont('ArialBold.ttf','Arial','bold');
doc.setProperties({title:'CarnetPass - Le projet de A à Z',author:'CarnetPass',subject:'Guide pédagogique du projet et des outils - 24 octobre 2026'});
const ink=[35,35,35],muted=[85,85,85],accent=[151,53,16];
const clean=s=>s.replace(/[–—‑]/g,'-').replace(/\u00a0/g,' ');
const layout=[];
function text(value,x,y,size=11,bold=false,width=172){
 doc.setFont('Arial',bold?'bold':'normal');doc.setFontSize(size);
 const lines=doc.splitTextToSize(clean(value),width);
 const height=size*.352778*1.38;
 doc.text(lines,x,y,{lineHeightFactor:1.38});return y+lines.length*height;
}
pages.forEach((p,i)=>{
 if(i)doc.addPage();
 doc.setTextColor(...accent);doc.setFont('Arial','bold');doc.setFontSize(8.5);
 doc.text('CARNETPASS / COMPRENDRE LE PROJET',19,14);
 doc.setDrawColor(190);doc.line(19,18,191,18);
 doc.setTextColor(...ink);
 let y=text(p.title,19,30,i===0?25:21,true);
 doc.setTextColor(...muted);y=text(p.subtitle,19,y+3,11,false)+9;
 if(i===1){
   for(let k=2;k<pages.length;k++){
    const label=pages[k].title;
    doc.setFont('Arial','normal');doc.setFontSize(10);
    doc.setTextColor(...ink);doc.text(label,20,y);doc.text(String(k+1),189,y,{align:'right'});
    doc.link(19,y-4,173,6,{pageNumber:k+1});y+=6.3;
   }
 }else if(p.diagram){
   const box=(label,x,top,w,h)=>{doc.setFillColor(249,247,244);doc.setDrawColor(160);doc.roundedRect(x,top,w,h,2,2,'FD');doc.setTextColor(...ink);text(label,x+4,top+7,10,false,w-8);};
   box('Professionnel : créer, suivre, consulter selon ses droits',19,58,80,26);
   box('Particulier : QR, historique, notice et contacts autorisés',111,58,80,26);
   doc.setDrawColor(...accent);doc.line(59,84,59,94);doc.line(151,84,151,94);doc.line(59,94,151,94);doc.line(105,94,105,104);
   box('Interface CarnetPass : les écrans React dans le navigateur',19,104,172,20);
   doc.line(105,124,105,134);
   box('Serveur Vercel : vérifier la connexion, les droits et les demandes',19,134,172,23);
   for(const x of [46,105,164])doc.line(x,157,x,170);
   box('Supabase / PostgreSQL\nComptes et données',19,170,54,30);
   box('Blob / R2\nFichiers et PDF',78,170,54,30);
   box('Redis / Upstash\nÉtats et compteurs',137,170,54,30);
   doc.setTextColor(...muted);y=text('Autres guichets appelés selon l’action : Stripe pour le paiement, Resend pour certains emails, OpenAI pour certaines analyses, Polygon pour les preuves et l’API officielle pour le SIRET.',19,218,11,false)+6;
   y=text('Exemple : le particulier scanne le QR, l’écran demande l’historique, le serveur sélectionne les informations publiques et renvoie la réponse. Le QR ne lui donne pas les clés de la base.',19,y,11,false);
 }else{
 for(const block of p.blocks){
  doc.setTextColor(...accent);y=text(block.title,19,y,12,true)+1.7;
  doc.setTextColor(...ink);y=text(block.text,19,y,11,false)+6;
 }
 }
 assert.ok(y<276,`Page ${i+1} overflow: ${y}`);
 layout.push({page:i+1,title:p.title,bottom:y});
 doc.setDrawColor(190);doc.line(19,281,191,281);
 doc.setFont('Arial','normal');doc.setTextColor(...muted);doc.setFontSize(8);
 doc.text('Situation au 24 octobre 2026 - Guide pédagogique, pas une certification',19,287);
 doc.text(`${i+1} / ${pages.length}`,191,287,{align:'right'});
});
const target=path.join(out,'CarnetPass-projet-et-outils-de-A-a-Z.pdf');
doc.save(target);
fs.writeFileSync(path.join(out,'CarnetPass-guide-source.json'),JSON.stringify(pages,null,2));
fs.mkdirSync('C:/dev/chaudiere-web3/tmp/pdfs',{recursive:true});
fs.writeFileSync('C:/dev/chaudiere-web3/tmp/pdfs/layout.json',JSON.stringify(layout,null,2));
console.log(JSON.stringify({target,pages:pages.length,bytes:fs.statSync(target).size,maxBottom:Math.max(...layout.map(p=>p.bottom))}));
