# PROJET : RTS-MK1 — RTS CLASSIQUE MULTIJOUEUR (VERSION v1.0.0)

## 0. PITCH INITIAL & PARAMÈTRES D'AMORÇAGE VALIDÉS

- **Nom du projet (Dépôt GitHub) :** `RTS-MK1` (`https://github.com/orbitalstorm/RTS-MK1`)
- **Nom DNS de production :** `rts-mk1.orbital8.cloud` (`https://rts-mk1.orbital8.cloud` / `wss://rts-mk1.orbital8.cloud/ws`)
- **Version initiale :** `v1.0.0`

Jeu RTS classique multijoueur et escarmouche reprenant le principe exact des RTS de l'époque (*Command & Conquer* / *Dune 2000*).
Tous les éléments graphiques sont générés en mode **Hybride Vectoriel/Bitmap** (génération procédurale sur `OffscreenCanvas` convertie en spritesheets `ImageBitmap` en mémoire par lots asynchrones).

---

## 1. RÈGLES D'INGÉNIERIE GLOBALES (NON NÉGOCIABLES)

### 1.1 Stack Technologique Exclusive
- **Framework :** Next.js (App Router) avec React.
- **Langage :** TypeScript en mode `strict: true` obligatoire (interdiction de `any`, validation systématique des entrées externes).
- **Style :** Tailwind CSS uniquement. Interdiction stricte de créer des fichiers `.css` séparés (hors point d'entrée global Tailwind `src/app/globals.css`) et interdiction absolue d'utiliser la propriété `style` inline sur les composants React/DOM.
- **Composants UI :** `shadcn/ui` (Radix UI) + icônes `lucide-react`.
- **Validation de schémas :** `zod` pour l'intégralité des flux réseau (HTTP/WebSocket), variables d'environnement et états partagés.
- **Gestion d'état :** État local (`useState`) ou URL `searchParams` par défaut. Utilisation de `zustand` exclusivement pour l'état global partagé indispensable (`src/store/game-store.ts`, pont entre le moteur RTS/WebSocket et l'interface HUD).

### 1.2 Discipline de Versionning et de Maintenance
- **Numérotation unique (`v1.x.y`) :** Incrémenter `x` pour chaque nouvelle fonctionnalité, `y` pour chaque correction mineure. Ne jamais réutiliser un numéro de version, même en cas de rollback (sauter le numéro).
- **Zéro correction en mode pansement :** Toute anomalie (désynchronisation réseau, fuite mémoire, blocage de pathfinding, condition de course) doit faire l'objet d'une analyse de cause racine et d'une correction structurelle. Les contournements superficiels (`setTimeout` arbitraires, `try/catch` silencieux, téléportation forcée d'unités bloquées) sont interdits.

---

## 2. ARCHITECTURE MÉTIER & CHOIX TECHNIQUES VERROUILLÉS

### 2.1 Gameplay de Référence (Modèle Command & Conquer / Dune 2000)
- **Boucle économique :** Récolte de minerai/tiberium sur la carte via des moissonneuses (`Harvesters`) qui rapportent la ressource à une Raffinerie pour la convertir en crédits. Stockage limité nécessitant des Silos.
- **Construction et Énergie :** Déploiement d'un Chantier de Construction (`Construction Yard`) donnant accès aux structures. Bilan énergétique strict (`Centrales électriques`) : en cas de déficit d'énergie, la vitesse de production des bâtiments chute et le radar se désactive.
- **Production et Arbre Technologique :** Files de production parallèles par catégorie (`BUILDING`, `DEFENSE`, `INFANTRY`, `VEHICLE`).
- **Brouillard de guerre à deux niveaux :** Voile noir (`Shroud`) sur les zones jamais explorées ; Brouillard gris (`Fog of War`) masquant les mouvements ennemis sur les terrains déjà découverts hors du champ de vision des unités alliées.

### 2.2 Pipeline Visuel : Hybride Vectoriel / Bitmap (`OffscreenCanvas`)
- **Zéro fichier image externe requis :** Au chargement du client, le moteur graphique génère procéduralement chaque bâtiment, véhicule, unité d'infanterie (sur 16 angles d'orientation), projectile et tuile de terrain via des primitives vectorielles sur un `OffscreenCanvas`.
- **Conversion en Atlas Mémoire par lots asynchrones :** Ces tracés sont convertis en `ImageBitmap` et assemblés en mémoire RAM/VRAM par lots (`requestAnimationFrame`) avec barre de progression `shadcn/ui`, et application dynamique de la couleur de faction (*Team Color Masking*).
- **Rendu Haute Performance :** L'affichage en partie s'effectue via un composant React contenant un unique élément `canvas` pour la vue tactique (`world-renderer.ts`) et un second élément `canvas` dans le HUD pour la minimap/radar (`minimap-renderer.ts`).

### 2.3 Architecture Réseau & Limitation à 1 Salon Actif Simultané
- **Séparation des processus :** L'application Next.js (`web`) gère l'interface, les profils utilisateurs et l'API REST. Un processus Node.js/TypeScript distinct (`ws-server`) gère le serveur WebSocket (`/ws`) et l'exécution du moteur RTS.
- **Verrou de Salon Unique (`Single Active Match Mutex`) :** Une seule instance de salon en état `IN_PROGRESS` (ou `STARTING`) est autorisée à la fois. Les autres salons sont placés en file d'attente ordonnée (`QUEUED`) avec affichage de leur position en temps réel. Un *Watchdog* indépendant (toutes les 10s) vérifie l'activité `ping/pong` et libère le verrou après 60s d'inactivité totale ou dès la fin de la partie.
- **Synchronisation par Deltas & Resynchronisation :** Simulation autoritaire à 20 ticks/seconde (50 ms/tick) avec numérotation séquentielle stricte (`tickId`). Diffusion des deltas validés par `zod` et resynchronisation automatique par *Snapshot complet* en cas de saut de `tickId`.

### 2.4 Cohérence Sonore (Web Audio API)
- **Synthèse et Buffers Mémoire :** Génération procédurale des sons d'interface, tirs, explosions, moteurs et alertes EVA via la Web Audio API.
- **Contrôle acoustique :** Limitation stricte de polyphonie (max 4 instances simultanées du même son dans une fenêtre de 80 ms), variation `detune`, panoramique stéréo et atténuation selon la caméra, et *ducking* automatique du bus de combat lors des alertes EVA.
