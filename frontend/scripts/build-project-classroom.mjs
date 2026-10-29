import fs from 'node:fs';
import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';

const lessons=[
{
 title:'Bienvenue dans la classe CarnetPass',
 question:'Pourquoi as-tu créé ce projet ?',
 paragraphs:[
 'Aujourd’hui, nous allons découvrir ton projet pas à pas. Imagine que nous sommes en classe. Sur la table, je pose une petite chaudière dessinée, un cahier, une notice et une étiquette à carrés. À première vue, ces objets n’ont pas grand-chose en commun. Pourtant, ils racontent toute l’idée de CarnetPass.',
 'Une chaudière, une pompe à chaleur ou une climatisation a une histoire. Un jour, elle est installée. Plus tard, quelqu’un l’entretient. Une pièce peut être changée. Pour bien s’en occuper, il faut retrouver les bonnes informations. Or les papiers se perdent, les personnes changent et les souvenirs s’effacent. Ton projet veut éviter que l’histoire de l’appareil disparaisse.',
 'CarnetPass est donc un carnet d’entretien numérique. Numérique veut dire que le carnet est consulté avec un ordinateur ou un téléphone. À l’intérieur, on retrouve des informations sur l’appareil, des documents et les interventions enregistrées. Ce n’est pas le téléphone qui répare : il aide les personnes à retrouver ce dont elles ont besoin.',
 'Pour apprendre, nous allons suivre Léa, une professionnelle du chauffage, et Madame Martin, qui possède une chaudière. Ce sont deux personnages inventés. Ils nous aideront à comprendre tes outils sans commencer par des mots difficiles. Ce cours décrit le projet connu au 24 octobre 2026. Il ne prétend pas que toutes les vérifications restantes sont déjà terminées.',
 ],
 example:'Madame Martin demande : « Quand ma chaudière a-t-elle été entretenue ? » Avec CarnetPass, elle retrouve l’intervention autorisée dans l’historique de son appareil.',
 words:'Équipement = un appareil. Entretien = les opérations pour le maintenir en bon état. Numérique = présenté et traité avec des outils informatiques.',
 remember:'Ton idée principale : donner à chaque appareil un carnet facile à retrouver.',
 exercise:'Explique CarnetPass en une phrase, sans employer le mot « blockchain ».',
},
{
 title:'D’abord, regardons toute la maison',
 question:'Comment les grandes parties travaillent-elles ensemble ?',
 paragraphs:[
 'Avant d’étudier chaque outil, regardons le projet comme une maison. Il y a une porte d’entrée : le site carnetpass.fr. Il y a des pièces où l’on travaille : les écrans. Il y a une armoire pour ranger les informations et des étagères pour les documents. Enfin, un gardien vérifie qui peut entrer et ce que chacun peut faire.',
 'Sur son téléphone, Léa voit des boutons et des formulaires. Cette partie visible s’appelle l’interface. Lorsqu’elle appuie sur un bouton, une demande peut partir vers le serveur. Le serveur est un ordinateur du service qui reçoit la demande, vérifie les règles et prépare la réponse. Il ne faut donc pas imaginer que tout se passe dans le téléphone.',
 'Les informations sont ensuite rangées. Le nom d’un appareil, sa référence et la date d’une intervention sont des données. Le PDF de la notice est un fichier. CarnetPass ne range pas forcément les données et les gros fichiers au même endroit. Nous verrons pourquoi, comme on ne range pas les fiches d’un catalogue dans la même boîte que les livres.',
 'Certains partenaires ont un métier particulier. Stripe s’occupe des paiements. Supabase fournit notamment la base et la connexion. Vercel sert le site et ses fonctions. OpenAI peut aider certaines analyses de Shiba. Polygon conserve des preuves techniques. Ton travail consiste à faire coopérer ces services, pas à demander à un seul de tout faire.',
 ],
 example:'Léa clique sur son équipement. Le serveur vérifie ses droits, lit les informations utiles et renvoie le dossier. L’écran les présente ensuite proprement.',
 words:'Interface = ce que l’on voit et utilise. Serveur = l’ordinateur qui traite les demandes du service. Donnée = une information rangée.',
 remember:'Un écran demande ; un serveur contrôle ; des outils rangent ou traitent ; l’écran affiche la réponse.',
 exercise:'Dans la comparaison avec une maison, qui ressemble le plus au gardien : un bouton ou le contrôle du serveur ?',
},
{
 title:'Les personnes n’ont pas les mêmes clés',
 question:'Pourquoi le particulier ne voit-il pas tout ?',
 paragraphs:[
 'À l’école, un élève peut entrer dans sa classe, mais il n’a pas la clé du bureau de la direction. Il n’est pas moins important : il n’a simplement pas le même rôle. Dans CarnetPass, nous utilisons le même principe. Chaque personne reçoit les possibilités dont elle a besoin, et pas toutes les possibilités du projet.',
 'Madame Martin est une particulière. Elle veut lire l’histoire de son appareil, sa notice d’utilisation disponible et les contacts de la professionnelle. Elle n’a pas besoin de changer une intervention ni de gérer l’abonnement de l’entreprise de Léa. Sa fiche est donc en lecture seule : elle regarde, mais ne réécrit pas le carnet.',
 'Léa utilise l’espace professionnel. Selon son rôle, elle peut ajouter des équipements, préparer des interventions et consulter les documents de son entreprise. Un collègue peut recevoir sa propre connexion grâce à une invitation. Cela évite que toute l’équipe partage le même mot de passe. Mais être collègue ne donne pas automatiquement les droits du responsable.',
 'Toi, tu es le fondateur de CarnetPass. Tu possèdes un accès d’administration pour suivre le service. La maintenance et les décisions internes sont séparées des fonctions des clients. Au contrôle du 24 octobre, ton compte était le seul administrateur enregistré. Ce résultat doit être surveillé dans le temps : une liste de droits n’est pas un objet que l’on regarde une seule fois puis que l’on oublie.',
 ],
 example:'Léa ouvre un rapport privé. Madame Martin scanne le QR et voit seulement qu’un entretien a été réalisé. Elle ne récupère pas pour autant les notes internes de Léa.',
 words:'Rôle = la fonction donnée à une personne. Droit = une action autorisée. Lecture seule = on peut lire sans modifier.',
 remember:'Même site ne veut pas dire mêmes informations ni mêmes boutons pour tout le monde.',
 exercise:'Un abonné doit-il pouvoir mettre tout CarnetPass en maintenance ? Explique pourquoi.',
},
{
 title:'Construire les pages que l’on voit',
 question:'À quoi servent HTML, CSS, JavaScript et React ?',
 paragraphs:[
 'Prenons une feuille. J’écris un titre, puis je dessine un bouton. Pour une page Internet, HTML sert à décrire ces éléments : voici un titre, voici un texte, voici un formulaire. HTML ressemble au plan de la page. Il explique ce qu’elle contient, sans tout décider de sa décoration.',
 'CSS s’occupe de la présentation. Il choisit les couleurs, les tailles, les marges et la façon de placer les éléments. Grâce à lui, le formulaire de Léa peut rester lisible sur un grand écran comme sur son petit téléphone. On appelle cela une présentation adaptée aux différentes tailles d’écran.',
 'JavaScript fait réagir la page. Quand Léa appuie sur « Actualiser l’historique », il peut lancer la demande et afficher les nouvelles informations. Mais attention : ce code est présent dans le navigateur. Le serveur doit contrôler les droits même si quelqu’un fabrique une demande sans utiliser les boutons normaux.',
 'React aide à assembler l’interface en morceaux réutilisables, appelés composants. Imagine des briques de construction : une carte d’appareil, une fenêtre de PDF et un champ de formulaire. React DOM relie ces briques à la page réelle du navigateur. React Router choisit quel écran montrer selon l’adresse. Aucun de ces outils ne remplace les permissions du serveur.',
 ],
 example:'Une carte d’équipement peut être réutilisée pour une chaudière puis pour une pompe à chaleur. Son contenu change, mais on ne reconstruit pas toute la présentation à la main.',
 words:'HTML = les éléments de la page. CSS = leur présentation. JavaScript = les réactions. React = des composants pour construire l’interface.',
 remember:'L’apparence d’un bouton et le droit de l’utiliser sont deux sujets différents.',
 exercise:'Si le titre est trop petit sur téléphone, quel outil règle surtout sa taille : CSS ou Stripe ?',
},
{
 title:'Le serveur : le bureau qui répond',
 question:'Où va une demande après un clic ?',
 paragraphs:[
 'Dans une mairie, tu présentes une demande au bon guichet. Pour CarnetPass, une API joue ce rôle. C’est une porte prévue pour une demande précise : lire un historique, préparer un paiement ou obtenir un document. API est un mot technique, mais l’idée du guichet est très simple.',
 'La demande arrive au serveur. Celui-ci regarde les informations reçues et applique les règles. Par exemple : le compte est-il connecté ? Appartient-il à cette entreprise ? Le document est-il public ? Si la réponse est non, il refuse. Il ne doit pas faire confiance à une simple phrase du navigateur disant « je suis le fondateur ».',
 'Node.js permet de faire fonctionner du JavaScript hors d’une page Internet. Il sert notamment aux traitements et aux scripts du projet. Vercel héberge le site et exécute les fonctions serveur. Pense à Vercel comme au bâtiment qui accueille certains bureaux du service, pas comme à la personne qui écrit toutes les règles.',
 'L’adresse carnetpass.fr permet de retrouver le service. Le DNS est l’annuaire qui dirige cette adresse vers le bon endroit. HTTPS protège les informations pendant leur trajet. Le cadenas du navigateur est utile, mais il ne signifie pas que tous les boutons du site sont sans erreur. Il faut à la fois protéger le chemin et vérifier ce que fait le guichet.',
 ],
 example:'Une demande sans connexion arrive au guichet d’administration. Le serveur répond 401 : une connexion valable est nécessaire. Il ne renvoie pas les données privées.',
 words:'API = guichet informatique. Node.js = outil pour exécuter JavaScript hors du navigateur. Vercel = hébergement et fonctions serveur. DNS = annuaire des adresses.',
 remember:'Le serveur doit vérifier une demande avant d’exécuter une action sensible.',
 exercise:'Une personne connaît l’adresse de l’administration. Est-ce suffisant pour lui donner les clés ?',
},
{
 title:'L’armoire des informations',
 question:'Que font Supabase et PostgreSQL ?',
 paragraphs:[
 'Imagine une grande armoire avec plusieurs cahiers. Un cahier contient les entreprises. Un autre contient les appareils. Un troisième contient les interventions. C’est une bonne image d’une base de données. Chaque cahier s’appelle une table ; ses colonnes indiquent les informations que l’on range.',
 'PostgreSQL est le moteur qui organise cette armoire. Chaque élément reçoit un identifiant. On relie ensuite les éléments : cet appareil appartient à cette entreprise ; cette intervention concerne cet appareil. On ne relie pas les dossiers seulement parce que deux personnes s’appellent Martin. L’identifiant sert à retrouver précisément le bon élément.',
 'Supabase fournit notamment cette base et les services de connexion utilisés par CarnetPass. Pour lire ou modifier des tables, on peut utiliser SQL, un langage de demandes. Par exemple, demander les interventions d’un équipement. Une migration est un changement de structure conservé dans l’ordre, comme une nouvelle version du plan des tiroirs.',
 'La base possède aussi des règles. RLS signifie que les droits peuvent être vérifiés pour chaque ligne de données. Léa ne doit pas lire les équipements d’une autre entreprise. Une transaction permet de faire réussir plusieurs actions ensemble ou de les annuler ensemble. C’est utile pour ne pas créer la moitié d’un dossier en cas d’erreur.',
 ],
 example:'Quand l’entreprise de Léa est créée, le système doit aussi savoir que Léa en est responsable. Créer l’entreprise sans son rattachement serait comme fabriquer un casier sans savoir à qui donner la clé.',
 words:'Table = cahier de données. Identifiant = repère unique. SQL = langage de la base. Migration = changement organisé. RLS = règles sur les lignes.',
 remember:'La base range les informations et leurs liens ; elle doit aussi protéger leur accès.',
 exercise:'Pourquoi un identifiant précis est-il plus sûr qu’un simple prénom pour retrouver un dossier ?',
},
{
 title:'Entrer, essayer, puis devenir professionnel',
 question:'Que vérifie-t-on au début du parcours ?',
 paragraphs:[
 'Léa crée son compte avec une adresse email. Confirmer cette adresse montre qu’elle peut utiliser cette boîte mail. Cela ne prouve pas à lui seul tout ce qui concerne son identité. Une fois connectée, elle renseigne son activité pour que les futurs équipements aient un espace de rangement.',
 'La formule Découverte actuelle dure cinq jours et permet jusqu’à cinq équipements. Elle commence sans carte bancaire. Le SIRET est facultatif pendant cet essai. Le nom et le téléphone sont demandés dans le parcours de création. Un essai gratuit est limité : il ne donne pas forcément toutes les fonctions ni des usages illimités.',
 'Le service garde des traces pour empêcher de recommencer sans fin. Une adresse ou un téléphone déjà utilisé peut bloquer un nouvel essai. C’est ce qui a été observé avec ton second compte. Changer seulement d’adresse mail ne suffit donc pas. Tu as demandé un message plus clair et décidé de ne pas accorder une exception.',
 'Pour passer à Pro, le SIRET devient nécessaire dans le parcours normal. C’est un numéro de quatorze chiffres qui identifie un établissement. CarnetPass interroge l’annuaire officiel. Le texte dit maintenant « SIRET vérifié », car trouver ce numéro ne prouve pas que la personne a le droit de représenter l’entreprise. Nous gardons ce contrôle automatique sans ajouter une approbation humaine systématique.',
 ],
 example:'Deux adresses email différentes utilisent le même téléphone déjà associé à un essai. Le système explique le blocage et propose de reprendre le compte initial ou de contacter l’assistance.',
 words:'Essai = période pour découvrir. SIRET = numéro d’un établissement. Vérifier un numéro ne signifie pas vérifier toute l’identité du titulaire du compte.',
 remember:'Les mots affichés doivent expliquer exactement ce qui a été contrôlé.',
 exercise:'Pourquoi « SIRET vérifié » est-il plus précis que « Entreprise totalement validée » ?',
},
{
 title:'Donner une identité à chaque appareil',
 question:'Pourquoi faut-il le bon modèle et la bonne référence ?',
 paragraphs:[
 'Dans une classe, plusieurs élèves peuvent porter le même prénom. Pour distribuer les bonnes feuilles, le professeur a besoin de les distinguer. Pour les appareils, c’est pareil. La marque indique la famille du fabricant, mais elle ne suffit pas. Il faut connaître le modèle et, quand elle existe, sa référence exacte.',
 'Léa ne doit pas choisir une notice seulement parce que la couverture ressemble à sa chaudière. Deux variantes peuvent avoir des pièces ou des réglages différents. Une référence produit aide à choisir les documents du bon modèle. Le numéro de série permet, lui, de distinguer un appareil individuel parmi les appareils fabriqués.',
 'Une plaque signalétique rassemble souvent plusieurs de ces informations. La photographier peut faciliter la saisie. Le projet prévoit des outils de lecture d’image. OCR veut dire reconnaître des caractères dans une image. Tesseract.js est présent parmi les outils déclarés, et certaines analyses de plaque passent par les capacités d’image OpenAI. Cela ne veut pas dire que tous les scans utilisent le même mécanisme.',
 'Léa doit relire les champs proposés avant de confirmer. Une image floue peut être mal interprétée. Si le système ne peut pas lire une donnée, il vaut mieux laisser un champ vide que deviner. Après la confirmation, l’équipement possède son propre dossier. On pourra y rattacher ses interventions sans les confondre avec celles du voisin.',
 ],
 example:'Atlantic NAEMA 2, référence 021240, n’est pas automatiquement équivalent à toutes les chaudières qui contiennent le mot NAEMA dans leur nom.',
 words:'Marque = fabricant. Modèle = version d’appareil. Référence = code du modèle. Numéro de série = repère d’un appareil individuel. OCR = lecture de lettres dans une image.',
 remember:'Un bon dossier commence par une bonne identification, relue par une personne.',
 exercise:'Si la photo ne permet pas de lire le dernier chiffre, faut-il le deviner ?',
},
{
 title:'Ranger et lire les bons documents',
 question:'Pourquoi trois PDF n’ont-ils pas le même usage ?',
 paragraphs:[
 'Sur la table, je pose trois livres. Le premier explique comment utiliser l’appareil au quotidien : c’est la notice d’utilisation. Le deuxième explique comment l’installer : il est destiné au professionnel. Le troisième montre les pièces séparées avec leurs repères : c’est la vue éclatée. Ce sont trois aides différentes.',
 'Le catalogue de CarnetPass classe les documents par marque et référence. Certaines notices couvrent plusieurs modèles. On peut les associer à chacun, mais seulement si cette correspondance a été établie. Le fait qu’une notice soit commune ne rend pas automatiquement toutes les vues éclatées communes. Nous devons garder les différences utiles.',
 'La base garde les renseignements sur les documents. Les gros fichiers sont placés dans un stockage adapté, comme Vercel Blob ou Cloudflare R2. Imagine que le catalogue donne le numéro de l’étagère, alors que le livre se trouve réellement sur l’étagère. La référence dans la base et le fichier lui-même sont deux choses liées, mais différentes.',
 'PDF.js aide à afficher les pages dans le navigateur. jsPDF aide à fabriquer un PDF. Une archive ZIP rassemble plusieurs fichiers dans une même valise ; fflate aide le code à préparer ce genre de paquet. Un lien signé est un ticket temporaire pour ouvrir un fichier autorisé. On ne doit pas transformer un document privé en document public simplement parce qu’on sait fabriquer un lien.',
 ],
 example:'Madame Martin peut lire la notice d’utilisation publique prévue pour son modèle. La présence d’une notice d’installation dans le catalogue de Léa ne lui donne pas automatiquement accès à ce document professionnel.',
 words:'Blob et R2 = stockages de fichiers. PDF.js = lecteur PDF. jsPDF = fabricant de PDF. ZIP = paquet de fichiers. Lien signé = autorisation temporaire.',
 remember:'Avoir le document, choisir le bon document et autoriser sa lecture sont trois étapes.',
 exercise:'Une vue éclatée sert-elle surtout à lire l’historique ou à identifier des pièces ?',
},
{
 title:'Le QR code est une petite porte',
 question:'Comment Madame Martin retrouve-t-elle son carnet ?',
 paragraphs:[
 'Léa imprime une étiquette avec un QR code et la pose sur l’appareil. Un QR code est un dessin que la caméra peut lire. Il contient ici un moyen de retrouver la fiche. Il ne faut pas imaginer que toutes les pages du dossier sont cachées dans les petits carrés.',
 'Quand Madame Martin le scanne, le téléphone ouvre l’adresse prévue. Le serveur recherche le CarnetPass correspondant et choisit les informations autorisées. Le public peut consulter l’historique, la notice d’utilisation disponible et les contacts publiés. Les notes et les comptes rendus privés ne sont pas ajoutés par magie à la réponse.',
 'Le projet utilise qrcode.react pour dessiner des QR codes dans l’interface et un outil de lecture avec la caméra. Il existe aussi une recherche par identifiant. L’accueil possède maintenant une entrée particulière plus visible. Le particulier ne doit pas avoir à souscrire à Pro simplement pour lire cette fiche publique.',
 'Attention à cette idée importante : quelqu’un qui trouve le QR peut ouvrir la partie publique. La sécurité consiste donc aussi à ne pas y publier de données confidentielles. La lecture seule interdit les modifications ; elle n’empêche pas les personnes autorisées à voir une page de se souvenir de son contenu ou d’en faire une capture.',
 ],
 example:'Sur ton téléphone, l’entretien du CarnetPass CP-2026-000033 a été affiché. Le texte précise que le compte rendu détaillé reste privé. C’est la séparation attendue entre la fiche publique et le dossier professionnel.',
 words:'QR code = dessin lisible par une caméra. Identifiant = repère du carnet. Public = consultable dans le périmètre prévu sans devenir membre de l’entreprise.',
 remember:'Le QR montre le chemin ; il ne doit pas donner toutes les clés du dossier.',
 exercise:'Si un voisin voit l’étiquette, quelle information ne doit surtout pas apparaître sur la fiche publique : les notes privées ou la marque ?',
},
{
 title:'Écrire une intervention sans perdre son histoire',
 question:'Que se passe-t-il après le travail de Léa ?',
 paragraphs:[
 'Léa vient d’entretenir la chaudière. Elle enregistre l’intervention dans CarnetPass. Elle peut indiquer la date, le type d’opération et le résultat. D’autres détails servent à son travail. Toutes ces informations n’ont pas la même destination : certaines restent dans l’entreprise, quelques-unes peuvent être affichées au public.',
 'Le rapport PDF est une présentation de données du dossier. Il permet de lire un compte rendu avec une mise en page stable. L’ouvrir à l’écran prouve que cette ouverture fonctionne. Cliquer sur « Télécharger » et rouvrir le fichier prouve autre chose. Retrouver le document après un incident demande encore une vraie copie de secours.',
 'Le dossier suit aussi l’état de la preuve technique. Une intervention enregistrée et une preuve confirmée ne sont pas exactement la même étape. L’historique public prévu n’affiche que les interventions confirmées. Si l’on ouvre la fiche trop tôt, elle peut encore être vide. Le bouton d’actualisation permet de demander une nouvelle lecture.',
 'Il faut enfin distinguer l’événement et sa description. L’historique public peut montrer « entretien » et « résolu » sans publier le diagnostic détaillé. Cette sobriété protège les informations privées. Elle évite aussi de confondre un résumé visible par tous avec le document complet destiné au professionnel ou transmis au client dans un cadre adapté.',
 ],
 example:'La première capture mobile était vide. Après confirmation, la suivante montrait l’entretien de 16 h 13. L’actualisation a permis de lire l’état récent, sans modifier l’intervention.',
 words:'Historique = suite des événements. Rapport = document détaillé. Actualiser = relire les données récentes. Confirmation = état obtenu après les contrôles prévus.',
 remember:'Un événement peut être public alors que son compte rendu détaillé reste privé.',
 exercise:'Si un PDF s’ouvre dans le navigateur, a-t-on déjà prouvé que sa copie de secours peut être restaurée ?',
},
{
 title:'Comprendre Shiba Bot sans magie',
 question:'Comment un assistant peut-il aider à lire une notice ?',
 paragraphs:[
 'En classe, je pourrais demander à un élève : « Cherche la bonne page, puis explique ce que tu as trouvé. » C’est une bonne comparaison pour une partie du travail de Shiba. Le but n’est pas seulement de donner une réponse agréable. Le but est de retrouver une information utile dans les bonnes sources.',
 'OpenAI est un fournisseur de capacités d’intelligence artificielle utilisées par certaines fonctions du projet. Shiba est le personnage et l’interface de CarnetPass. Un modèle est le système qui calcule une réponse. Le SDK OpenAI est une boîte à outils de code qui permet au serveur de communiquer avec ce service.',
 'Le mot RAG désigne une façon de chercher des passages avant de préparer une réponse. On découpe éventuellement un document en morceaux. Des embeddings, c’est-à-dire des listes de nombres représentant approximativement le sens d’un texte, aident à retrouver des passages proches de la question. La référence de l’appareil et les droits doivent rester contrôlés.',
 'Un prompt est la consigne donnée au modèle avec le contexte utile. Des tokens sont de petits morceaux de texte comptés pendant le traitement. Ces demandes peuvent coûter de l’argent. CarnetPass applique donc des quotas et des crédits. La réponse doit rester vérifiable : une IA peut se tromper même lorsqu’elle écrit avec assurance. Elle ne remplace pas le jugement d’un professionnel devant l’appareil.',
 ],
 example:'Léa demande une information sur une pièce. Shiba doit travailler sur les documents qui couvrent réellement sa référence, puis indiquer une source. Une réponse pour un modèle voisin pourrait être dangereusement trompeuse.',
 words:'IA = système de calcul de réponses. RAG = recherche de passages avant la réponse. Prompt = consigne. Token = morceau de texte traité. Source = document que l’on peut vérifier.',
 remember:'Une belle réponse n’est utile que si elle correspond au bon appareil et peut être contrôlée.',
 exercise:'Que dois-tu regarder en plus de la réponse de Shiba : la page source ou la couleur de la mascotte ?',
},
{
 title:'Tous les Shiba n’ont pas le même travail',
 question:'Pourquoi le professionnel et le particulier ont-ils des réponses différentes ?',
 paragraphs:[
 'Le même personnage peut porter plusieurs casquettes. Shiba professionnel aide sur les documents et, selon le mode, sur des sources Web. Shiba public est destiné à l’usage quotidien de l’appareil. Il ne doit pas transformer une personne non formée en réparateur. Le nom est proche, mais le périmètre est différent.',
 'Nous l’avons vu avec Atlantic NAEMA. Le catalogue professionnel contenait bien trois documents. Pourtant, le petit mécanisme public ne reconnaissait pas encore cette référence : sa liste séparée ne comportait alors qu’un modèle Airwell. Nous avons ajouté explicitement la référence 021240 avec une notice constructeur d’utilisation vérifiée.',
 'Sur ce modèle, les réponses publiques actuelles couvrent quelques sujets préparés : programmation selon la configuration Navilink, absence prolongée et orientation en cas de panne. Ce mécanisme reconnaît des sujets et cite les pages. Il ne fait pas appel à une IA générale pour inventer une réponse sur toutes les questions possibles. Le public dispose d’un quota annoncé de cinq questions par mois et par visiteur/appareil, avec les limites du comptage réseau.',
 'Shiba Devis est encore un autre parcours : un questionnaire pour préparer un projet. Un calcul préparatoire n’est pas un devis signé. Les aides financières demandent des règles actualisées et validées. RGE est une qualification à vérifier séparément ; elle ne découle pas du simple SIRET. La présence d’un module dans le code ne prouve pas que toutes les aides possibles y sont déjà à jour.',
 ],
 example:'Une question sur les horaires de la NAEMA a reçu une réponse avec la page 6. Si la question sort des sujets vérifiés, Shiba doit le dire plutôt que fabriquer une procédure technique.',
 words:'Périmètre = limites du travail autorisé. Simulation = résultat préparatoire. RGE = qualification liée à certains travaux et à des conditions précises.',
 remember:'Un assistant doit savoir dire « je ne trouve pas cette réponse dans mes sources ».',
 exercise:'La présence d’une notice d’installation chez le professionnel suffit-elle à ouvrir toutes ses instructions au public ?',
},
{
 title:'La blockchain : un cahier de preuves',
 question:'À quoi sert Polygon dans ton projet ?',
 paragraphs:[
 'Imagine un cahier partagé dont l’historique est difficile à réécrire discrètement. Une blockchain est un registre de transactions organisé avec ses propres règles de validation. Polygon est le réseau utilisé par CarnetPass pour certaines preuves. Nous n’y envoyons pas le dossier privé complet comme dans une armoire ordinaire.',
 'Une empreinte est calculée à partir d’informations. On parle aussi de hash, notamment avec SHA-256 pour des contrôles de fichiers. Une petite modification produit normalement une empreinte différente. Cela aide à repérer un changement. Mais une empreinte n’explique pas le contenu et ne prouve pas, à elle seule, qu’une information saisie est vraie.',
 'Un smart contract est un programme du registre blockchain. Solidity est le langage utilisé pour les contrats du projet. ethers aide le code JavaScript à communiquer avec le réseau et ses contrats. Une ABI décrit les commandes que le contrat comprend. Hardhat est un atelier pour préparer et tester ces programmes avant ou autour de leur utilisation.',
 'Les transactions demandent des frais de réseau, souvent appelés gas. Sur Polygon, la réserve technique utilise POL. Un portefeuille contrôle des clés de signature ; ce n’est pas un sac de PDF. La clé privée doit rester secrète. Madame Martin n’a pas besoin d’un portefeuille pour lire son QR. Enfin, une preuve confirmée ne certifie pas la qualité des travaux : quelqu’un peut enregistrer une déclaration inexacte dans un registre difficile à modifier.',
 ],
 example:'Le registre peut aider à constater qu’une preuve a été inscrite. Il ne peut pas regarder à travers l’écran pour savoir si Léa a réellement nettoyé correctement la chaudière.',
 words:'Polygon = réseau blockchain. Transaction = opération enregistrée. Hash = empreinte calculée. POL = jeton pour les frais. Clé privée = secret qui autorise une signature.',
 remember:'La blockchain aide à tracer une preuve ; elle ne transforme pas une déclaration en vérité absolue.',
 exercise:'Une preuve confirmée permet-elle d’affirmer sans autre contrôle que la réparation est parfaite ?',
},
{
 title:'Le paiement et la porte de l’abonnement',
 question:'Que fait Stripe et que vérifie CarnetPass ?',
 paragraphs:[
 'Stripe est le service qui gère les paiements et les abonnements du parcours. Pense à une caisse spécialisée. CarnetPass lui demande un paiement, puis doit attendre et vérifier le résultat avant d’ouvrir les droits. Le fait de revenir sur une page du site ne prouve pas qu’un paiement a été encaissé.',
 'Dans le catalogue configuré du projet, Pro est à 28 euros par mois. Une place supplémentaire coûte 20 euros par mois. Principal et une place donnent donc 48 euros mensuels. Des packs de crédits Shiba sont séparés : 100 pour 10 euros et 200 pour 20 euros. Ce sont les prix configurés de CarnetPass, pas ceux de ses fournisseurs techniques.',
 'Stripe envoie des messages au serveur : des webhooks. Le serveur contrôle leur signature et rapproche les informations avec le bon client, le bon abonnement et le bon paiement. Un message peut arriver plusieurs fois. L’idempotence permet de ne pas répéter son effet : imagine un ticket que l’on a déjà tamponné.',
 'Résilier et rembourser sont différents. Résilier arrête un renouvellement selon les modalités choisies. Rembourser renvoie tout ou partie d’un paiement. Une résiliation n’entraîne donc pas automatiquement un remboursement. Un abonnement annulé en fin de période peut aussi garder un accès jusqu’à la fin déjà payée. Les droits doivent suivre le véritable état, pas une phrase approximative comme « compte actif » affichée pour toujours.',
 ],
 example:'Tu as réalisé un paiement principal, reçu un reçu et testé auparavant un remboursement intégral. Ces opérations réelles ont donné des preuves plus solides qu’un simple écran de simulation.',
 words:'Abonnement = paiement qui se renouvelle selon le contrat. Webhook = message automatique entre services. Idempotence = une seule conséquence malgré une répétition.',
 remember:'La caisse annonce le résultat ; CarnetPass doit le vérifier avant de modifier les droits.',
 exercise:'Si un client résilie aujourd’hui, faut-il supposer sans vérifier qu’il est automatiquement remboursé ?',
},
{
 title:'Un collègue, une place et un email',
 question:'Pourquoi ces trois choses ne sont-elles pas identiques ?',
 paragraphs:[
 'Léa veut faire entrer Sami dans son équipe. Il faut d’abord distinguer une place et une personne. Une place supplémentaire représente une capacité payée. Sami est un utilisateur avec sa propre connexion. Acheter une chaise ne dit pas encore qui va s’asseoir dessus : il faut attribuer la place.',
 'Le responsable demande le nombre souhaité. Le service présente le récapitulatif avant paiement. Si l’on ajoute une place au milieu du mois, un prorata peut être calculé : on paie la partie de période concernée. Ton écran affichait 19,99 euros immédiatement, puis un total de 48 euros par mois. Ce test a été reporté, sans achat de place supplémentaire pendant la vérification.',
 'Après confirmation, une invitation liée à l’adresse du collaborateur permet de rejoindre la bonne entreprise. Retirer Sami de l’équipe, diminuer le nombre de places facturées et résilier tout l’abonnement ne sont pas la même action. Les scénarios isolés ont été essayés, mais le parcours complet en réel du compte supplémentaire reste à faire.',
 'Les messages ont aussi leurs outils. Resend envoie certains emails de CarnetPass. Stripe peut envoyer ses propres reçus et relances selon les réglages. Un mail accepté par le fournisseur n’est pas forcément déjà dans la boîte du client : il peut être retardé, rejeté ou classé comme indésirable. Les essais ont confirmé la réception d’un mail de test et d’un reçu de paiement, pas celle de tous les futurs messages possibles.',
 ],
 example:'Sami doit lire les dossiers de l’entreprise de Léa, pas ceux d’un autre professionnel. Son invitation ne doit pas lui donner l’administration de CarnetPass.',
 words:'Prorata = prix correspondant à une partie de période. Invitation = moyen encadré de rejoindre une équipe. Resend = outil d’envoi de certains emails.',
 remember:'Payer une place, inviter une personne et confirmer un mail sont trois étapes différentes.',
 exercise:'Si tu retires un collègue, faut-il supposer que toutes les conditions de facturation ont changé au même instant ?',
},
{
 title:'Protéger les portes et les secrets',
 question:'Pourquoi cacher un lien ne suffit-il pas ?',
 paragraphs:[
 'Supposons que l’on retire le panneau « bureau du directeur ». Cela ne ferme pas sa porte. Sur un site, masquer un lien d’administration améliore l’affichage, mais la vraie protection doit exister côté serveur. Quelqu’un peut connaître l’adresse et essayer de la saisir directement.',
 'L’authentification reconnaît le compte. L’autorisation vérifie ses droits. La double authentification, ou MFA, ajoute une autre preuve à la connexion. Une session est une connexion suivie dans le temps. Un jeton ressemble à un badge temporaire. Un cookie est une information gardée par le navigateur. Écrire « fondateur » dans un faux cookie ne doit jamais créer un droit.',
 'Le 24 octobre, nous avons contrôlé un seul administrateur fondateur enregistré, avec un facteur MFA validé. Les tests ont refusé la maintenance aux rôles non autorisés. Quinze demandes réelles sans session, avec faux jeton ou faux cookies ont été bloquées. Cela décrit les vérifications réalisées ; ce n’est pas une promesse qu’aucune attaque n’existera jamais.',
 'Les clés serveur sont des secrets. Elles se règlent dans l’environnement technique et ne doivent pas être affichées aux clients. Le RGPD demande aussi de protéger les données personnelles et de limiter les usages. Les fonctions d’export et d’effacement doivent respecter les droits et les périmètres. Tout supprimer dans un dossier ne veut pas forcément dire supprimer le compte, les factures ou les preuves déjà inscrites sur la blockchain.',
 ],
 example:'Un abonné ouvre l’adresse de maintenance. Même s’il sait écrire cette adresse, le serveur doit lui refuser la commande. Ton bouton visible de fondateur ne doit pas devenir un pouvoir pour les autres.',
 words:'Authentification = qui es-tu ? Autorisation = que peux-tu faire ? MFA = plusieurs preuves. RGPD = règles européennes de protection des données personnelles.',
 remember:'La sécurité est une règle vérifiée, pas seulement un bouton caché.',
 exercise:'Le cadenas HTTPS protège le trajet. Remplace-t-il le contrôle du rôle fondateur ?',
},
{
 title:'L’atelier où nous construisons le projet',
 question:'À quoi servent les outils du développeur ?',
 paragraphs:[
 'VS Code est un éditeur : il aide à lire et modifier les fichiers. Un terminal est une fenêtre dans laquelle on écrit des commandes. PowerShell est le langage de commandes Windows utilisé ici. Une commande peut lire, créer, publier ou supprimer : il faut donc savoir sur quelle cible elle agit.',
 'Git garde l’historique du code. Un worktree est un dossier de travail séparé lié au même dépôt. npm installe les bibliothèques et lance les commandes prévues dans package.json. Vite prépare le site pendant le développement puis fabrique les fichiers à publier : c’est le build. Une PWA peut rendre le site installable ; son cache ne garantit pas que toutes les fonctions marchent hors connexion.',
 'Codex est l’assistant de développement utilisé pendant notre collaboration. Il aide à lire, écrire et tester, mais ses affirmations doivent être vérifiées. ESLint repère certaines erreurs de code. Les tests Node contrôlent des résultats attendus. PGlite permet certains essais locaux de base. Playwright pilote un navigateur pour vérifier des écrans et des parcours.',
 'La CLI est une manière de commander un outil en écrivant une instruction. Nous utilisons notamment celles de Vercel et Supabase. Un déploiement prépare une version ; une promotion la fait servir aux clients. La production est le service réel. Un environnement de test est séparé. Un test réussi avec de faux paiements ne signifie pas que tous les paiements réels ont été essayés. De même, un build réussi n’est pas une validation de tout le métier.',
 ],
 example:'Avant une publication, on vérifie le code, la fabrication du site et les parcours importants. On ne publie pas une vieille copie simplement parce qu’elle porte le nom du projet.',
 words:'Build = fabrication. Déploiement = installation d’une version. Production = service réel. Test isolé = essai sans agir comme un vrai client sur tous les fournisseurs.',
 remember:'Un outil aide à construire ; les preuves montrent ce qui a réellement été vérifié.',
 exercise:'Pourquoi un test avec un paiement fictif ne prouve-t-il pas que le reçu réel est arrivé par email ?',
},
{
 title:'Les documents du jour et les copies de secours',
 question:'Pourquoi un fichier enregistré n’est-il pas forcément sauvegardé ?',
 paragraphs:[
 'EasySAV est une bibliothèque documentaire extérieure au projet. Le collecteur est le programme qui aide à parcourir les modèles autorisés et à récupérer les documents. Il utilise un navigateur dédié avec Playwright. Être connecté dans ton navigateur habituel ne veut donc pas forcément dire que le collecteur utilise le bon compte.',
 'Le collecteur suit un quota de vingt tentatives quotidiennes, toutes marques confondues ; une tentative incertaine compte aussi. Il conserve son avancement et évite les doublons. Le 24 octobre, vingt PDF uniques ThemaFast ont été récupérés : quatorze vues et six notices partagées. Quatre modèles restaient à inspecter. Préparer une archive n’est pas une preuve que tous ses documents sont déjà publiés.',
 'Nous retrouvons ici une différence essentielle. Enregistrer, c’est garder le fichier dans son emplacement normal. Sauvegarder, c’est avoir une copie de secours protégée. Restaurer, c’est réussir à récupérer ce qu’il faut depuis cette copie. Une sauvegarde de la base ne contient pas automatiquement les PDF rangés dans les stockages de fichiers.',
 'Le projet Supabase est resté sur l’offre gratuite : la page contrôlée n’offrait pas de sauvegarde gérée accessible. Tu n’as pas choisi un abonnement supplémentaire. Une procédure indépendante complète de copie et de restauration reste à finaliser. Il faut donc conserver les originaux utiles. Un exercice de restauration doit être isolé : on ne remplace pas les données de production pour vérifier tranquillement si une copie fonctionne.',
 ],
 example:'Le rapport de Léa s’ouvre aujourd’hui. C’est bien. Mais pour le retrouver après une suppression accidentelle, il faut une copie de secours lisible et une procédure réellement essayée.',
 words:'Quota = limite. Doublon = copie répétée du même document. Sauvegarde = copie de secours. Restauration = récupération depuis cette copie.',
 remember:'Un document qui s’ouvre aujourd’hui et un document récupérable après un incident ne sont pas la même preuve.',
 exercise:'Le fichier PDF est sur une étagère ; la base ne garde que sa référence. Faut-il sauvegarder seulement la référence ?',
},
{
 title:'Maintenant, tu peux raconter ton projet',
 question:'Comment relier toutes les leçons en une seule histoire ?',
 paragraphs:[
 'Reprenons notre histoire. Léa crée son compte, confirme son email et renseigne son activité. Elle découvre le service dans les limites de l’essai. Pour le parcours Pro, son SIRET est contrôlé et son paiement est vérifié. Elle ajoute un appareil identifié précisément, retrouve les bons documents, puis enregistre son intervention.',
 'Le dossier est présenté avec React, servi avec Vercel et organisé avec les services de données et de fichiers. Les contrôles décident qui peut lire ou écrire. Shiba peut aider dans le périmètre prévu avec ses sources. Une preuve technique peut être confirmée sur Polygon. Le QR permet à Madame Martin de retrouver les informations publiques sans ouvrir tout le dossier professionnel.',
 'Ce parcours principal a été observé dans nos essais : paiement et reçu, équipement, intervention, rapport ouvert, historique mobile en lecture seule et réponse publique pour la référence NAEMA corrigée. Le compte supplémentaire en réel et la sauvegarde complète restent à vérifier. Le téléchargement doit être confirmé si seul l’affichage a été testé. On ne transforme pas ces points restants en succès simplement parce que le site est ouvert.',
 'La routine convenue est simple : documents et contrôle rapide des alertes chaque jour, revue de sécurité plus approfondie le lundi. Ces contrôles ne sont pas automatiquement programmés dans cette session. Redis et Upstash gardent notamment des états rapides et des compteurs ; un TTL limite leur durée. Des tâches cron sont des réveils du serveur pour certaines opérations prévues. Rien de cela ne remplace l’attention humaine, les essais et les copies de secours.',
 ],
 example:'Pour expliquer CarnetPass à quelqu’un : « Je donne un carnet numérique à chaque appareil. Les professionnels le complètent, le particulier lit la partie prévue grâce au QR et des contrôles protègent le reste. »',
 words:'Redis / Upstash = mémoire rapide et compteurs. TTL = durée avant expiration. Cron = réveil de tâches. Audit = examen avec preuves et limites.',
 remember:'Ton projet relie des personnes, des documents et des preuves autour d’un appareil, avec des droits différents.',
 exercise:'Raconte le trajet d’un entretien, depuis la connexion de Léa jusqu’à sa lecture sur le téléphone de Madame Martin.',
},
];

assert.equal(lessons.length,20);
const dir='C:/dev/chaudiere-web3/output/pdf';fs.mkdirSync(dir,{recursive:true});
const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
for(const [file,style]of [['arial.ttf','normal'],['arialbd.ttf','bold']]){doc.addFileToVFS(file,fs.readFileSync('C:/Windows/Fonts/'+file).toString('base64'));doc.addFont(file,'School',style);}
doc.setProperties({title:'CarnetPass - Mon projet expliqué comme à l’école',author:'CarnetPass',subject:'Cours pédagogique en 20 pages - 24 octobre 2026'});
const clean=s=>s.replace(/[–—‑]/g,'-').replace(/\u00a0/g,' ');
const dark=[32,35,38],orange=[145,55,20],gray=[80,84,88];const checks=[];
function para(value,y,size=11.5,bold=false,width=174,x=18){doc.setFont('School',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(clean(value),width);doc.text(lines,x,y,{lineHeightFactor:1.35});return y+lines.length*size*.352778*1.35;}
lessons.forEach((l,i)=>{
 if(i)doc.addPage();doc.setTextColor(...orange);doc.setFont('School','bold');doc.setFontSize(9);doc.text('CARNETPASS / NOTRE COURS EN 20 PAGES',18,13);
 doc.setDrawColor(190);doc.line(18,17,192,17);doc.setTextColor(...dark);
 let y=para(l.title,28,20,true)+1;doc.setTextColor(...orange);y=para(l.question,y,12.5,true)+5;doc.setTextColor(...dark);
 for(const p of l.paragraphs)y=para(p,y,12.5)+3;
 const start=y;doc.setFont('School','normal');doc.setFontSize(10.7);const ex=doc.splitTextToSize(clean(l.example),163);const h=ex.length*10.7*.352778*1.35+13;
 doc.setFillColor(248,245,240);doc.roundedRect(18,start-1,174,h,2,2,'F');doc.setTextColor(...orange);para('EXEMPLE DANS TON PROJET',start+5,9,true);doc.setTextColor(...dark);y=para(l.example,start+11,10.7,false,163,23)+6;
 doc.setTextColor(...gray);y=para('Les mots à comprendre : '+l.words,y,10.2)+3;
 doc.setTextColor(...orange);y=para('À retenir : '+l.remember,y,10.8,true)+3;
 doc.setTextColor(...dark);y=para('Petite question : '+l.exercise,y,10.3);
 assert.ok(y<279,`Overflow ${i+1}: ${y}`);checks.push({page:i+1,bottom:y});
 doc.setDrawColor(190);doc.line(18,282,192,282);doc.setFont('School','normal');doc.setTextColor(...gray);doc.setFontSize(8);doc.text('Cours fondé sur le projet connu au 24 octobre 2026',18,288);doc.text(`${i+1} / 20`,192,288,{align:'right'});
});
const target=dir+'/CarnetPass-explique-comme-a-ecole-20-pages.pdf';doc.save(target);
fs.writeFileSync(dir+'/CarnetPass-cours-source.json',JSON.stringify(lessons,null,2));
console.log(JSON.stringify({target,pages:20,maxBottom:Math.max(...checks.map(p=>p.bottom)),bytes:fs.statSync(target).size}));
