# ShopBot SVG Studio — prototype V1

Convertisseur local SVG → OpenSBP `.sbp` pour ShopBot à portique pilotée par SB3. Interface en français, React + TypeScript + Vite.

## Exécutable Windows

Pour générer l'application portable Windows 64 bits, exécuter `npm install`, puis `npm run build:windows`. L'exécutable `ShopBot SVG Studio-0.1.0-portable.exe` sera créé dans `release`. Il ne nécessite pas d'installation ; les exports SBP ouvrent une boîte de dialogue pour choisir leur emplacement.

## État et limites de cette V1

- Importe des SVG et reconnaît `path` (M/L/H/V/C/Q/Z), `rect`, `circle`, `ellipse`, `line`, `polyline` et `polygon`. Rouvre les SBP exportés avec les données de projet et peut simuler les déplacements des SBP compatibles.
- Interprète les dimensions SVG physiques mm/cm/in/px/pt/pc, et fournit un aperçu.
- Simplifie les trajectoires générées avec une tolérance géométrique de 0,1 mm pour éviter les segments inutiles sur les courbes.
- Refuse les contours ouverts, génère des passes en profondeur et propose une compensation intérieure/extérieure via Clipper.
- Gère une liste locale de fraises (nom et diamètre), avec ajout, modification et suppression. La fraise sélectionnée, les profondeurs et les autres réglages sont mémorisés dans le navigateur.
- Affiche le bloc, le dessin placé et le centre de fraise compensé. Permet de définir les dimensions du bloc, les décalages et une rotation du dessin entier.
- Simule les déplacements XY/Z du SBP généré ou importé, avec lecture accélérée, pause, reprise et progression.
- Génère un sous-ensemble simple d'OpenSBP : `SA`, `MS`, `JZ`, `J2`, `MZ`, `M2`.
- Inclut la routine machine demandée (`VC`, `JH`, `C6`, `PAUSE`) avant les parcours. **C6 commande le démarrage du moteur avant la pause.** Ne définit pas la position physique des zéros.

**Cette version est un prototype de développement, pas un post-processeur certifié.** Les transformations SVG imbriquées sont seulement partiellement prises en charge; les arcs `A`, les chemins complexes, les styles qui masquent des formes, les contours auto-intersectés, les trous/îlots imbriqués et certains décalages complexes doivent être convertis ou vérifiés dans un logiciel vectoriel/CAM. La compensation bloque si Clipper retourne plusieurs contours. Les dimensions de table sont à régler selon la course utile réelle.

La simplification limite l'écart entre le contour interprété et le parcours à 0,1 mm, mais peut retirer des détails plus petits que cette tolérance. Vérifie toujours le résultat dans SB3 Preview.

## Fraises, bloc et placement

Dans « Fraise sélectionnée », choisir la fraise à utiliser. Modifier son nom et son diamètre, puis cliquer sur **Enregistrer la fraise** pour la modifier ou sur **Ajouter une fraise** pour créer et sélectionner une nouvelle entrée. **Supprimer** retire la fraise sélectionnée et sélectionne la première restante ; la dernière fraise ne peut pas être supprimée. Les calculs utilisent le diamètre enregistré de la fraise sélectionnée, pas une modification encore non enregistrée dans l'éditeur.

La liste des fraises, la sélection, les profondeurs totale/par passe, les avances, les courses machine, les dimensions du bloc et son placement sont sauvegardés automatiquement dans `localStorage`. Cette mémoire est propre au navigateur et à l'adresse utilisée (par exemple `localhost:5173`), et peut être effacée par le navigateur. Les erreurs de stockage sont affichées. Le SVG importé n'est pas conservé après rechargement.

**Repère spécifique à cette CNC : le zéro XY est au coin inférieur droit du bloc, X positif vers le haut de l'aperçu et Y positif vers la gauche.** Le bloc s'étend donc de X=0 à sa hauteur et de Y=0 à sa largeur. Les anciennes options « bas-gauche/centre » du dessin sont remplacées par ce repère fixe ; il ne s'agit pas d'un réglage automatique des zéros physiques.

- **Bloc X** : hauteur du bloc dans l'aperçu ; **Bloc Y** : largeur ; **Bloc Z** : épaisseur.
- **Depuis le bas (axe X)** et **Depuis la droite (axe Y)** : distances entre les bords du bloc et la boîte englobante du dessin après rotation, avant compensation.
- **Rotation antihoraire** : angle en degrés dans l'aperçu, appliqué à tous les contours ensemble sans changer leur échelle ni leur espacement. Les décalages sont conservés après rotation.
- **Centrer sur le bloc** : ajuste les deux décalages en fonction des dimensions du dessin tourné.
- Les deux décalages de position sont arrondis à une décimale (0,1 mm), à la saisie, après centrage et lors de la restauration des réglages ou d'un SBP. Le parcours et les courbes conservent leur précision de sortie de 0,001 mm ; seul le placement global est arrondi.
- Le trait vert représente le dessin et le trait bleu pointillé le centre de fraise compensé, lorsqu'un parcours valide peut être calculé.

## Simulation CNC

La section **Simulation CNC** lit les commandes du SBP généré. La fraise part du zéro XY **(0,0)** et suit le premier déplacement rapide. La **vue 3D axonométrique** montre le bloc, l'outil et les sillons de coupe colorés selon leur profondeur de passe ; la valeur Z courante est affichée en évidence. Le sélecteur permet aussi de revenir à la vue de dessus. Les boutons **Lire/Pause** et **Recommencer** et le curseur permettent de parcourir le programme. La lecture est accélérée (×10) ; sa durée estimée ne tient pas compte des accélérations réelles de la machine.

Un fichier `.sbp` peut aussi être importé directement pour la simulation. Les fichiers de projet de l'application restaurent le dessin et les réglages, puis leur programme est simulé. Un SBP standard compatible est lu uniquement comme programme de simulation : il ne remplace pas le dessin ni les réglages actuels. La simulation ne prend en charge que les mouvements `J2`, `M2`, `JZ` et `MZ`, les avances `MS` et les commandes de démarrage/fin générées par l'application ; une commande inconnue bloque la simulation plutôt que d'afficher un parcours incomplet. La vue 3D est une représentation axonométrique simplifiée des trajectoires et profondeurs, pas un calcul volumique exact de matière. Aucune commande SBP n'est exécutée par l'application. Cette visualisation ne remplace pas le **Preview SB3** et ne modélise pas les fixations.

L'export bloque les profondeurs supérieures à l'épaisseur du bloc, les blocs dépassant les courses machine et les parcours dont l'enveloppe complète de fraise sort du bloc. Pour une compensation extérieure, laisser au moins un diamètre de fraise entre le dessin et chaque bord. Le zéro Z reste sur la face supérieure du bloc ; une découpe traversante à l'épaisseur exacte est permise, sans surprofondeur automatique. Le logiciel ne vérifie pas les brides, la longueur coupante, la course Z ni le martyr.

## SBP de test à 0,1 mm

Le bouton **Exporter le SBP de test** télécharge un second programme nommé `nom-test-0.1mm.sbp`. Il suit tous les contours avec **une seule passe par contour à Z=-0,1 mm**, sans modifier les profondeurs du programme normal ni les réglages mémorisés. Le placement, la rotation, la compensation, la fraise, les avances et le Z de sécurité restent identiques. Les contrôles portent sur les réglages effectifs du test, dont l'épaisseur minimale de 0,1 mm.

Le test conserve la routine de démarrage, **y compris C6 qui démarre le moteur**, et se termine par `JH`, puis `C7` : ce n'est pas un essai à vide. Vérifier le zéro Z et le programme dans SB3 Preview avant utilisation. Le bloc de commentaires de configuration en fin de fichier est omis du SBP de test : il ne contient donc pas le SVG ni les données permettant de restaurer le projet. Les commentaires courts du programme sont conservés. Le SBP normal reste exportable séparément avec ses profondeurs habituelles et toutes ses données réimportables.

## Réouvrir un projet depuis son SBP

Chaque SBP normal exporté par l'interface (hors SBP de test) contient, en commentaires à la fin du programme :

- le SVG source complet et son nom, pour ne pas dépendre du fichier d'origine ;
- toute la liste de fraises et la fraise sélectionnée ;
- tous les paramètres de coupe, de profondeur, de sécurité, d'avance et de compensation ;
- les courses machine, les dimensions du bloc, les décalages et la rotation ;
- les unités, le repère machine et la séquence de démarrage.

Utiliser **Importer SVG / SBP** et choisir le SBP pour restaurer le projet. L'import remplace le dessin, la liste de fraises et les réglages actuels ; les réglages restaurés sont ensuite mémorisés dans le navigateur. Les commandes SBP ne sont **jamais exécutées à l'import**. Le parcours est recalculé depuis le SVG et les réglages intégrés : les modifications manuelles des commandes de mouvement ne sont pas importées.

Le bloc `SHOPBOT-STUDIO-PROJECT-BEGIN 1` / `SHOPBOT-STUDIO-PROJECT-END` contient du JSON encodé en URI, réparti en commentaires ASCII numérotés pour préserver les accents et éviter d'insérer le contenu du SVG dans les commandes machine. Ne pas modifier ni supprimer ces commentaires si le projet doit être réouvert. Le fichier embarque le SVG complet et la liste de fraises : ils sont donc partagés avec toute personne recevant le SBP.

Les anciens SBP sans ces données, les versions ou repères incompatibles, les données tronquées et les configurations invalides ne restaurent pas le projet ouvert. Si leurs commandes de mouvement sont prises en charge, ils peuvent néanmoins être chargés séparément pour la simulation sans remplacer le dessin ni les réglages. Un projet dont les réglages dépassent le bloc peut être restauré pour correction, mais son export reste bloqué par les contrôles usuels.

## Routine de démarrage

Chaque programme commence par cette séquence (exemple avec une fraise sélectionnée de 6 mm) :

```text
VC, 6,,,25.4,0,10,25.4,0,0,0,Z,8
JH,
C6, 'mise en route du moteur
PAUSE
```

Les commandes générées `SA`, `MS` et les mouvements de coupe viennent après cette séquence. **La première valeur de `VC` est le diamètre enregistré de la fraise sélectionnée, en mm**, identique au diamètre utilisé pour calculer la compensation du parcours. Les autres paramètres `VC` sont repris tels que fournis. Les projets précédemment exportés avec la valeur fixe 5,9 sont toujours importables ; à leur réexport, cette valeur est remplacée par le diamètre de la fraise du projet. **JH est placé avant le premier dégagement JZ généré : vérifier physiquement le dégagement de l'outil pour ce retour et le comportement des routines propres à votre machine. C6 démarre le moteur avant PAUSE, pas après.** La pause n'est pas un délai de montée en régime calculé. Aucun changement d'outil automatique n'est ajouté.

Chaque fichier se termine par les deux commandes suivantes, après le dernier dégagement au Z de sécurité et les commentaires de configuration :

```text
JH
C7
```

L'ordre demandé est conservé : retour `JH`, puis routine d'arrêt moteur `C7`. Les commentaires du projet restent avant ces deux dernières lignes. Cette fin de programme est aussi ajoutée lors du réexport d'un ancien projet.

## Installation

Installer Node.js LTS (18+ recommandé), puis dans ce dossier :

```bash
npm install
npm run dev
```

Vite affiche l'adresse locale, généralement `http://localhost:5173`. Pour compiler et tester :

```bash
npm test
npm run build
npm run preview
```

## Procédure de validation ShopBot

1. Confirmer dans SB3 que le système est configuré en **millimètres** et en coordonnées absolues.
2. Vérifier les zéros XY et le zéro Z au sommet du matériau. Ce programme suppose que la surface supérieure du bois est Z=0.
3. Confirmer les avances, le diamètre réel de la fraise, le dégagement Z et la course utile de la machine.
4. Ouvrir le `.sbp` dans ShopBot Control Software et lancer **Preview seulement**. Inspecter toutes les passes, le sens de coupe, les limites, et le parcours autour des fixations.
5. Tester d'abord sur une chute, avec broche désactivée pour valider le mouvement si la procédure de ta machine le permet; ensuite faire une première coupe supervisée.

Le SBP inclut les routines de démarrage et de fin ci-dessus. Il n'ajoute pas de changement d'outil, de gestion d'aspiration ou de dépoussiérage. Confirmer les effets des routines C6 et C7 propres à la configuration ShopBot.

## Important sur la compensation

Le calcul d'offset d'une géométrie polygonale est délicat aux angles concaves et aux contours imbriqués. La V1 est volontairement restrictive mais ne peut pas garantir la fabrication sans inspection. Pour une pièce critique, compare les dimensions de la trajectoire avec le résultat attendu dans un CAM fiable avant d'utiliser la machine.

## Correctif compensation V0.1.1

Le calcul de compensation normalise désormais le sens du contour avant d'appliquer le décalage. Cela corrige un défaut où un contour SVG parcouru dans le sens inverse pouvait recevoir un décalage intérieur au lieu d'un décalage extérieur. Des tests couvrant les deux orientations ont été ajoutés.

**Validation locale :** `npm test` couvre notamment la compensation, le repère X vers le haut / Y vers la gauche, les rotations, les limites du bloc, la persistance des réglages, la restauration des projets SBP et l'ordre exact de la routine de démarrage. `npm run build` vérifie les types et compile le projet. Vérifiez impérativement le programme dans SB3 Preview et faites un essai à vide/sur chute avant la production.
