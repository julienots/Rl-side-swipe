# Bolid'Ball

Jeu mobile de **football automobile en arène 2D** (vue de côté) : voitures pilotables, balle physique, sauts,
saltos, rotations aériennes, boost, conduite sur les murs et le plafond, adversaires IA, garage, cosmétiques,
progression et boutique de démonstration. Identité originale : nom, voitures, arènes, interface, effets et sons
sont créés pour ce projet (aucun asset, logo, son ou menu d'un jeu commercial).

- **Technologie** : HTML5 Canvas 2D + modules JavaScript ES, **aucune dépendance d'exécution**, aucun build.
- **Plateformes** : navigateur mobile (Android/iOS) et PC ; installable en PWA (hors ligne via service worker).
- **Langue** : français.

## Lancer le jeu

```bash
npm start            # serveur statique local : http://localhost:8080/
# ou n'importe quel serveur statique servant la racine du dépôt (les modules ES exigent http://, pas file://)
```

Sur téléphone : ouvrir l'adresse du serveur (même réseau), puis « Ajouter à l'écran d'accueil » pour l'installer
en plein écran, orientation paysage.

## Commandes

| Action | Tactile | Clavier | Manette |
|---|---|---|---|
| Rouler / orienter en l'air | joystick gauche (flottant ou fixe) | ← → ↑ ↓ ou WASD | stick gauche / croix |
| Sauter, double saut, salto (saut + direction) | bouton SAUT | Espace / J | A |
| Boost | bouton BOOST (jauge circulaire) | Maj / K / L | B, RB ou RT |
| Pause | ❚❚ | Échap / P | Start |
| Entraînement : remettre / lancer la balle | barre du haut | R / T | — |

Paramètres de commandes (sauvegardés) : taille et opacité des boutons, disposition gaucher, joystick
flottant/fixe, contrôle aérien « Rotation » ou « Visée directe », inversion de la rotation, demi-tour automatique,
vibrations. Les appuis multiples sont gérés par Pointer Events (un identifiant par doigt). Toutes les commandes
sont relâchées à l'ouverture d'un menu, à la pause, à la perte de focus ou quand l'application passe en arrière-plan.

## Modes (tous jouables)

- **Partie rapide** : 2c2 contre l'IA, arène au hasard, 2 min.
- **Match contre l'IA** : 1c1 / 2c2 / 3c3, difficulté Débutant / Pro / Champion, 2 / 3 / 5 min, 6 arènes.
  Cycle complet : préparation → compte à rebours → coup d'envoi → but (célébration 3 s) → remise en place →
  fin du temps → prolongation « but en or » en cas d'égalité → résultats (stats, MVP, XP) → revanche ou menu.
- **Entraînement libre** : sans chrono, boost illimité, balle replaçable ou lancée vers soi, 6 objectifs
  d'entraînement récompensés.
- **Défis de précision** : 2 séries de 5 essais (tir simple, ballon roulant, reprise, lucarne, contre-pied,
  montée, chandelle, cible murale, ricochet au plafond, tir puissant), notées en étoiles.
- **Parcours d'obstacles** : 2 circuits chronométrés (points de passage, replacement au dernier point,
  médailles or/argent/bronze, record sauvegardé).
- **Multijoueur en ligne** : **non disponible** (voir « Limites »). Il n'apparaît pas comme mode jouable.

## Architecture

```
index.html, manifest.webmanifest, sw.js   page, PWA, cache hors ligne
src/core/      simulation pure, sans DOM (testable sous Node)
  constants.js   réglages physiques (pas fixe 120 Hz)
  math.js        géométrie (segment/segment, rayon), RNG déterministe
  arena.js       6 arènes + 2 parcours (géométrie en segments, cages, pastilles de boost)
  physics.js     balle : gravité, traînée, rebond, frottement + effet ; contacts capsule/segments ; raycast
  car.js         voiture-capsule : conduite sur toute surface, adhérence, saut/double saut/salto, rotation
                 aérienne, boost, demi-tour, récupération sur le toit, décrochage d'une paroi
  world.js       intégration à sous-étapes adaptatives, collisions voiture-balle / voiture-voiture, pastilles
  predict.js     prédiction de trajectoire de la balle seule
  ai.js          bots : perception retardée, interception, rôles d'équipe, sauts par-dessus la balle, défense
  match.js       machine à états du match et de l'entraînement, statistiques (buts, passes, arrêts, tirs)
  challenge.js   défis de précision et parcours d'obstacles
  stepper.js     boucle à pas fixe + interpolation de rendu
src/game/      rendu Canvas, caméra, particules, entrées, audio synthétisé (Web Audio)
src/meta/      sauvegarde, cosmétiques, progression/défis/succès/boutique
src/ui/        écrans DOM, HUD, résultats, style
tests/         tests Node (node:test) + test de bout en bout Playwright
```

Points techniques clés :

- **Physique indépendante des FPS** : la simulation avance toujours par pas de 1/120 s (accumulateur limité à
  10 pas par image), le rendu interpole entre deux pas.
- **Anti-traversée** : nombre de sous-étapes calculé pour que rien ne se déplace de plus de 0,22 unité par
  sous-étape ; résolution par point le plus proche (bilatérale) avec deux itérations ; vitesse balle plafonnée.
- **But compté une seule fois** : détection uniquement dans l'état « jeu » (balle entièrement derrière la
  ligne et sous la barre), passage immédiat à l'état « but », balle figée et masquée.
- **IA sans triche** : chaque bot voit la balle avec son temps de réaction (0,10 à 0,34 s), l'extrapole avec la
  physique de la balle seule (sans connaître les commandes des autres), ajoute une erreur de visée. Rôles
  attaquant / défenseur / soutien réattribués 4 fois par seconde ; l'humain est compté dans la répartition.
- **Cosmétiques purement visuels** : toutes les carrosseries partagent la même capsule de collision et les mêmes
  réglages (vérifié par un test sur le catalogue).
- **Audio** : 100 % synthétisé (moteur, boost, impacts, rebonds, but, compte à rebours, sifflet, interface,
  petite boucle musicale de menu) : aucun fichier sous licence.
- **Sauvegarde** : `localStorage`, schéma versionné, validation champ par champ, copie de secours
  (écriture interrompue ou JSON corrompu → restauration), repli en mémoire si le stockage est indisponible,
  sauvegarde à la mise en arrière-plan.

## Tests

```bash
npm test              # 46 tests Node : physique, voiture, match, IA, modes, sauvegarde, progression
npm run test:e2e      # Chromium headless (Playwright) : parcours complet de l'application
npm run lint          # ESLint (règles de base)
```

Résultats de la dernière exécution réelle : **46/46 tests Node réussis**, **test de bout en bout réussi**
(55 vérifications), **lint sans erreur**.

Ce que couvrent les tests :

- Balle : rebonds décroissants puis repos ; **aucune traversée** sur 432 tirs à vitesse maximale (6 arènes ×
  72 directions) ; tirs vers poteaux, barre et coins ; balle coincée entre deux voitures ; résultat identique
  à 30, 60, 144 FPS et avec des images irrégulières.
- Voiture : accélération et vitesse max, freinage, marche arrière, demi-tour auto, boost (consommation,
  plafond, vol vertical), saut / double saut / atterrissage, salto (≈ 360°, frappe plus forte), rotation
  aérienne dans les deux sens, visée directe, conduite mur → plafond, récupération sur le toit, frappes de la
  carrosserie avant, du toit et de l'arrière.
- Match : compte à rebours, but unique, remise en jeu, contre son camp, passe décisive, fin du temps,
  prolongation et but en or, entraînement.
- IA : un bot marque dans une cage vide (3 difficultés) ; matchs complets 1c1/2c2/3c3 bot contre bot sans
  état invalide ; un seul attaquant par équipe ; le bot coéquipier laisse la balle à l'humain mieux placé ;
  Champion bat Débutant nettement.
- Modes : réussite/échec des défis, mauvaise cage, tir trop bas, chaque essai réalisable ; parcours : ordre
  des points, arrivée, médaille, replacement ; **chaque segment des deux parcours est franchi par un pilote
  scripté**.
- Méta : sauvegarde aller-retour, JSON corrompu, copie de secours, données invalides nettoyées, stockage
  indisponible ; XP, niveaux, récompenses, défis, succès ; boutique (rotation quotidienne déterministe, achat,
  refus si crédits insuffisants, pas de double achat).
- Bout en bout (Chromium, écran tactile émulé) : navigation dans tous les écrans, garage → cosmétique visible
  en match, **joystick + boost + saut avec trois doigts simultanés**, pause pendant l'appui puis reprise sans
  commande bloquée, clavier, fin de match → résultats → revanche → menu, entraînement, précision, parcours,
  chargement des 6 arènes, sauvegarde conservée après rechargement, mise en page (débordements, boutons trop
  petits, textes coupés) en 844×390, 932×430, 800×480, 1024×768, 1280×720 et portrait 390×844, aucune
  erreur console, performance sur 3 matchs 3c3 (simulation + rendu : médiane 0,5 ms, p95 1,4 ms par image
  dans Chromium desktop headless).

Équilibrage mesuré par simulation (16 matchs de 2 min par confrontation) : Champion bat Pro 11-5,
Pro bat Débutant 13-3, Champion bat Débutant 13-3.

## Limites connues (honnêtes)

- **APK Android** : `bash scripts/build-apk.sh` produit `dist/bolidball.apk` (≈ 150 Ko, Android 7.0+,
  paysage plein écran). Le SDK Android n'étant pas téléchargeable dans l'environnement de construction,
  la chaîne est minimale : `javac` + `android.jar` (API 34) → `dx` (AOSP) → manifeste binaire et
  `resources.arsc` encodés par `android/tools/binres.py` → zip aligné → signature v2 (apksig).
  Le jeu tourne dans une WebView ; ses fichiers sont servis depuis les assets de l'APK sous une origine https
  locale, sans aucune permission ni accès réseau. **Signé avec une clé de débogage** (installation directe,
  « sources inconnues ») : pour le Play Store il faudra une clé de publication
  (`ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEY_ALIAS`) et un AAB (Gradle/Android Studio).
  Vérifié : signature (apksig) et structure (androguard : manifeste, icône, classes DEX, alignement) ;
  **non lancé sur un appareil ou un émulateur** (aucun disponible ici).
- **Non testé sur téléphone physique** : les tests tactiles utilisent l'émulation multitouch de Chromium ; les
  performances mesurées l'ont été sur un processeur de bureau. Un réglage de qualité automatique passe en
  « basse » (densité de pixels 1, moins de particules) si la moyenne descend sous 40 images/s.
- **Multijoueur en ligne non implémenté** : aucun serveur n'est configuré. Prérequis : serveur autoritaire
  (ex. Node + WebSocket/WebRTC) exécutant `src/core` (déjà déterministe et sans DOM), envoi des seules
  commandes par les clients, prédiction côté client + réconciliation, interpolation des autres voitures,
  horodatage / gestion de la latence, autorité serveur sur le score et l'horloge, matchmaking, reconnexion,
  remplacement d'un joueur parti (clairement signalé comme bot), anti-triche et hébergement.
  Les bots ne sont jamais présentés comme des joueurs humains.
- **IA** : solide au sol, sauts par-dessus la balle et défense en retrait, mais pas de jeu aérien prolongé ni
  de conduite volontaire sur les murs ; les matchs bot contre bot restent riches en buts (≈ 20 buts par
  2 min de jeu effectif), en partie à cause de la nature 2D (impossible de contourner la balle).
- **Achats réels** : aucun. La boutique utilise une monnaie fictive locale (⬢) gagnée en jouant.
- **Audio** : sons synthétisés simples (pas d'échantillons enregistrés).
