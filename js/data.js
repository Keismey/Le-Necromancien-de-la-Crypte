/* Le Nécromancien de la Crypte — données de jeu (équilibrage).
   Tout ce qui se règle (stats, coûts, vagues) est ici, séparé du code. */
window.GAME_DATA = {
  rarityMult: [1, 2.5, 5],          // commune, rare, légendaire
  quality: { bad: 0.7, good: 1.0, perfect: 1.2 },
  fragileLoss: 0.15,                // lien fragile : chance de perdre le membre par coup subi
  creatureBase: { hp: 20, str: 2, mag: 0, spd: 0, def: 0 },
  maxCreatures: 6,
  cryptHp: 10,
  fluidStock: 3,                    // doses par fluide et par nuit
  soulGaugeKill: 10, soulGaugeBoss: 35,
  rallyHp: 0.3,                     // Rappel d'os : PV rendus
  starSouls: 10,                    // âmes par étoile gagnée
  grindSouls: [1, 3, 8],            // broyeur d'os, par rareté

  // Emplacements du corps. arm2/arm3 dépendent de la taille de l'autel.
  slots: ['back', 'head', 'torso', 'arm0', 'arm1', 'arm2', 'arm3', 'legs', 'core'],
  slotType: { head: 'head', torso: 'torso', arm0: 'arm', arm1: 'arm', arm2: 'arm', arm3: 'arm', legs: 'legs', back: 'back', core: 'core' },
  altarArms: [2, 3, 4],

  // Pièces : emplacement, origine (pour les bonus de set), dessin, stats (rareté commune)
  pieces: {
    p_skull:  { slot: 'head',  src: 'peasant', art: 'skull',       st: { hp: 8, mag: 1, def: 1 } },
    p_ribs:   { slot: 'torso', src: 'peasant', art: 'ribcage',     st: { hp: 35, def: 4 } },
    p_arm:    { slot: 'arm',   src: 'peasant', art: 'bonearm',     st: { str: 5, spd: 1 } },
    p_legs:   { slot: 'legs',  src: 'peasant', art: 'bonelegs',    st: { hp: 8, spd: 5 } },
    p_heart:  { slot: 'core',  src: 'peasant', art: 'rottenheart', st: { hp: 15, str: 1 } },
    w_helm:   { slot: 'head',  src: 'warrior', art: 'helm',        st: { hp: 14, def: 6 } },
    w_plate:  { slot: 'torso', src: 'warrior', art: 'plate',       st: { hp: 55, def: 12 } },
    w_arm:    { slot: 'arm',   src: 'warrior', art: 'steelarm',    st: { str: 8, def: 2 } },
    w_legs:   { slot: 'legs',  src: 'warrior', art: 'greaves',     st: { hp: 14, def: 5, spd: 2 } },
    r_hood:   { slot: 'head',  src: 'rogue',   art: 'hood',        st: { hp: 6, str: 3, spd: 3 } },
    r_blade:  { slot: 'arm',   src: 'rogue',   art: 'bladearm',    st: { str: 8, spd: 3 } },
    r_legs:   { slot: 'legs',  src: 'rogue',   art: 'agilelegs',   st: { hp: 6, spd: 10 } },
    r_cape:   { slot: 'back',  src: 'rogue',   art: 'cape',        st: { hp: 6, spd: 4, def: 3 } },
    m_skull:  { slot: 'head',  src: 'mage',    art: 'runeskull',   st: { hp: 6, mag: 9 } },
    m_wings:  { slot: 'back',  src: 'mage',    art: 'wings',       st: { hp: 6, mag: 4, spd: 5 }, fly: true },
    m_hand:   { slot: 'arm',   src: 'mage',    art: 'arcanehand',  st: { mag: 8 } },
    m_gem:    { slot: 'core',  src: 'mage',    art: 'soulgem',     st: { hp: 8, mag: 6 } },
    pr_halo:  { slot: 'head',  src: 'priest',  art: 'halo',        st: { hp: 12, mag: 5, def: 4 } },
    pr_heart: { slot: 'core',  src: 'priest',  art: 'sacredheart', st: { hp: 30, mag: 3, def: 4 }, heal: true },
    pa_plate: { slot: 'torso', src: 'paladin', art: 'holyplate',   st: { hp: 75, def: 18, mag: 2 } },
    pa_sword: { slot: 'arm',   src: 'paladin', art: 'swordarm',    st: { str: 12, def: 3 } },
    g_torso:  { slot: 'torso', src: 'golem',   art: 'golemtorso',  st: { hp: 110, def: 12 } },
    g_arm:    { slot: 'arm',   src: 'golem',   art: 'golemarm',    st: { str: 11, hp: 20 } },
    g_head:   { slot: 'head',  src: 'golem',   art: 'gargoyle',    st: { hp: 20, def: 8, str: 3 } },
    g_legs:   { slot: 'legs',  src: 'golem',   art: 'golemlegs',   st: { hp: 28, def: 7 } },
    // Pièces légendaires des boss (rareté 2 imposée)
    L_arm:    { slot: 'arm',   src: 'boss', art: 'captainarm', st: { str: 6, def: 2 } },
    L_wings:  { slot: 'back',  src: 'boss', art: 'archwings',  st: { mag: 4, spd: 4 }, fly: true },
    L_legs:   { slot: 'legs',  src: 'boss', art: 'queenlegs',  st: { spd: 6, hp: 4 } },
    L_heart:  { slot: 'core',  src: 'boss', art: 'priestheart', st: { hp: 10, mag: 3, def: 2 }, heal: true }
  },

  // Reliques du Titan (une par boss), utilisées seulement pour le Titan d'Os
  relics: {
    capt:  { slot: 'arm0', art: 'captainarm' },
    arch:  { slot: 'back', art: 'archwings' },
    queen: { slot: 'legs', art: 'queenlegs' },
    priest:{ slot: 'core', art: 'priestheart' },
    angel: { slot: 'head', art: 'crownskull' }
  },

  // Pièces lâchées par chaque héros (tirage uniforme dans la liste)
  drops: {
    peasant: ['p_skull', 'p_ribs', 'p_arm', 'p_arm', 'p_legs', 'p_heart'],
    warrior: ['w_helm', 'w_plate', 'w_arm', 'w_arm', 'w_legs', 'p_arm'],
    rogue:   ['r_hood', 'r_blade', 'r_blade', 'r_legs', 'r_cape'],
    mage:    ['m_skull', 'm_wings', 'm_hand', 'm_hand', 'm_gem'],
    priest:  ['pr_halo', 'pr_heart', 'p_ribs', 'p_skull'],
    paladin: ['pa_plate', 'pa_sword', 'w_helm', 'w_legs'],
    elite:   ['g_torso', 'g_arm', 'g_arm', 'g_head', 'g_legs']
  },
  dropCount: [0.65, 0.28, 0.07],    // probabilité de 1, 2, 3 pièces
  rareChance: 0.06, rareChancePerNight: 0.02,

  // Héros (valeurs de la nuit 1). move = px/s, rate = s entre deux attaques
  heroes: {
    peasant: { hp: 20,  str: 3,  mag: 0, def: 0,  move: 36, rate: 1.5, range: 20 },
    warrior: { hp: 55,  str: 5,  mag: 0, def: 20, move: 28, rate: 1.6, range: 20, ignoreLight: true },
    rogue:   { hp: 35,  str: 5,  mag: 0, def: 6,  move: 44, rate: 1.1, range: 20, disarm: 3, crit: 0.25 },
    mage:    { hp: 35,  str: 0,  mag: 6, def: 4,  move: 30, rate: 2.0, range: 110, boneBurn: 1.3 },
    priest:  { hp: 45,  str: 0,  mag: 4, def: 10, move: 28, rate: 2.2, range: 80, heal: 6 },
    paladin: { hp: 100, str: 8,  mag: 0, def: 35, move: 24, rate: 1.7, range: 20, darkResist: 0.5 }
  },
  heroHpPerNight: 0.16, heroDmgPerNight: 0.1,
  elite: { hpMul: 3, dmgMul: 1.5, size: 1.3 },

  bosses: {
    2:  { id: 'captain', base: 'warrior', hp: 320,  str: 14, mag: 0,  def: 40, move: 22, rate: 1.4, range: 22, relic: 'capt',  legend: 'L_arm' },
    4:  { id: 'archmage', base: 'mage',   hp: 280,  str: 0,  mag: 16, def: 15, move: 24, rate: 1.8, range: 120, splash: true, relic: 'arch', legend: 'L_wings' },
    6:  { id: 'queen', base: 'rogue',     hp: 400,  str: 16, mag: 0,  def: 25, move: 40, rate: 0.8, range: 22, disarm: 1, dodge: 0.3, relic: 'queen', legend: 'L_legs' },
    8:  { id: 'highpriest', base: 'priest', hp: 520, str: 0, mag: 14, def: 35, move: 22, rate: 1.8, range: 90, heal: 25, healAll: true, relic: 'priest', legend: 'L_heart' },
    10: { id: 'archangel', base: 'paladin', hp: 1300, str: 26, mag: 12, def: 55, move: 20, rate: 1.3, range: 24, darkResist: 0.5, relic: 'angel' }
  },

  // Composition des vagues par nuit (poids). Nuit N : 3 vagues de (4 + 2N) héros.
  nights: [
    { peasant: 8, warrior: 2 },
    { peasant: 6, warrior: 4 },
    { peasant: 4, warrior: 5, rogue: 1 },
    { peasant: 2, warrior: 4, rogue: 3, mage: 1 },
    { warrior: 4, rogue: 3, mage: 3 },
    { warrior: 3, rogue: 3, mage: 3, priest: 1 },
    { warrior: 3, rogue: 2, mage: 2, priest: 2, paladin: 1 },
    { warrior: 2, rogue: 2, mage: 2, priest: 2, paladin: 2 },
    { warrior: 2, rogue: 2, mage: 2, priest: 2, paladin: 2 },
    { warrior: 1, rogue: 2, mage: 2, priest: 2, paladin: 3 }
  ],
  wavesPerNight: 3,
  spawnGap: [2.6, 1.6],             // écart entre héros : nuit 1 → nuit 10

  traps: {
    spikes:  { cd: 4,  dmg: 25, light: true },
    trapdoor:{ cd: 8,  stun: 3 },
    brasero: { cd: 10, burn: 9, dur: 4 },
    coffin:  { cd: 12, dmg: 10, push: 90 }
  },
  trapDmgPerNight: 0.2,
  trapZone: 30,

  fluids: {
    blood:     { color: '#d22b3a' },
    poison:    { color: '#7dff4a' },
    ice:       { color: '#7fd6ff' },
    fire:      { color: '#ff8a2a' },
    lightning: { color: '#ffe14a' },
    soul:      { color: '#f2f0ff' }
  },
  fluidOrder: ['blood', 'poison', 'ice', 'fire', 'lightning', 'soul'],

  // Bonus de set : 3 pièces de même origine
  sets: {
    peasant: { hpMul: 1.3 },
    warrior: { dmgTaken: 0.75 },
    rogue:   { crit: 0.3, critMul: 2 },
    mage:    { splash: 0.5 },
    priest:  { aura: 2 },
    paladin: { stun: 0.2 },
    golem:   { taunt: true, defMul: 1.25 }
  },

  // Grimoires secrets : recettes (pièces requises) → créature légendaire
  recipes: [
    { id: 'brawler',  need: { g_head: 1, p_arm: 4 }, rate: 0.6 },
    { id: 'chimera',  need: { m_wings: 1, r_legs: 1, m_skull: 1 }, magMul: 1.5, ranged: true },
    { id: 'saint',    need: { pr_heart: 1, pr_halo: 1, pa_plate: 1 }, hpMul: 1.3, aura: 3 },
    { id: 'colossus', need: { g_torso: 1, g_legs: 1, g_arm: 2 }, hpMul: 1.5, taunt: true, push: true },
    { id: 'shadow',   need: { r_hood: 1, r_blade: 2, r_legs: 1, r_cape: 1 }, crit: 0.5, critMul: 2.5 }
  ],

  // Boutique (coûts en âmes). req = nuit à avoir terminée.
  shop: [
    { id: 'trap_trapdoor', cost: 30, req: 1 },
    { id: 'trap_brasero',  cost: 50, req: 2 },
    { id: 'trap_coffin',   cost: 70, req: 3 },
    { id: 'fluid_poison',  cost: 20, req: 3 },
    { id: 'fluid_ice',     cost: 30, req: 3 },
    { id: 'fluid_fire',    cost: 35, req: 3 },
    { id: 'fluid_lightning', cost: 45, req: 4 },
    { id: 'fluid_soul',    cost: 60, req: 5 },
    { id: 'altar_1',       cost: 80, req: 3 },
    { id: 'altar_2',       cost: 160, req: 6, needs: 'altar_1' },
    { id: 'grim_0',        cost: 50, req: 6 },
    { id: 'grim_1',        cost: 70, req: 6 },
    { id: 'grim_2',        cost: 90, req: 6 },
    { id: 'grim_3',        cost: 100, req: 7 },
    { id: 'grim_4',        cost: 120, req: 7 }
  ],

  sew: { tol: 12, perfect: 5, good: 10, minCover: 0.8, easyMul: 1.8, tutoMul: 2.6 },
  inoculateTime: 0.8               // secondes par dose en maintenant le doigt
};
