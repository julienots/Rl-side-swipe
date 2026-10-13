// Catalogue des cosmétiques (tous originaux, purement visuels : même hitbox et mêmes stats pour tous).

export const RARITY = {
  commun: { name: 'Commun', color: '#b8c4d6', price: 300 },
  rare: { name: 'Rare', color: '#4fa8ff', price: 700 },
  epique: { name: 'Épique', color: '#b26bff', price: 1400 },
  legendaire: { name: 'Légendaire', color: '#ffb42e', price: 2600 },
};

export const CATEGORIES = [
  { id: 'body', name: 'Carrosserie' },
  { id: 'paint', name: 'Peinture' },
  { id: 'wheels', name: 'Roues' },
  { id: 'decal', name: 'Autocollant' },
  { id: 'trail', name: 'Traînée de boost' },
  { id: 'explosion', name: 'Effet de but' },
];

// unlock : 'default' | { level: n } | 'shop' | { challenge: id }
export const ITEMS = [
  // Carrosseries
  { id: 'rapace', cat: 'body', name: 'Rapace', rarity: 'commun', unlock: 'default' },
  { id: 'bloc', cat: 'body', name: 'Bloc', rarity: 'commun', unlock: 'default' },
  { id: 'fuseau', cat: 'body', name: 'Fuseau', rarity: 'rare', unlock: { level: 3 } },
  { id: 'bulle', cat: 'body', name: 'Bulle', rarity: 'rare', unlock: 'shop' },
  { id: 'comete', cat: 'body', name: 'Comète', rarity: 'epique', unlock: { level: 8 } },
  { id: 'scarabee', cat: 'body', name: 'Scarabée', rarity: 'epique', unlock: 'shop' },
  { id: 'mantis', cat: 'body', name: 'Mantis', rarity: 'legendaire', unlock: { challenge: 'champion' } },

  // Peintures
  { id: 'p_blanc', cat: 'paint', name: 'Craie', rarity: 'commun', unlock: 'default', color: '#e9eef5' },
  { id: 'p_graphite', cat: 'paint', name: 'Graphite', rarity: 'commun', unlock: 'default', color: '#3a4250' },
  { id: 'p_rouge', cat: 'paint', name: 'Piment', rarity: 'commun', unlock: 'default', color: '#e2384d' },
  { id: 'p_jaune', cat: 'paint', name: 'Citron', rarity: 'commun', unlock: { level: 2 }, color: '#f5d23a' },
  { id: 'p_vert', cat: 'paint', name: 'Menthe', rarity: 'commun', unlock: 'shop', color: '#3ad69b' },
  { id: 'p_violet', cat: 'paint', name: 'Aubergine', rarity: 'rare', unlock: { level: 4 }, color: '#7b3fe0' },
  { id: 'p_rose', cat: 'paint', name: 'Flamant', rarity: 'rare', unlock: 'shop', color: '#ff7ac3' },
  { id: 'p_cyan', cat: 'paint', name: 'Lagon', rarity: 'rare', unlock: 'shop', color: '#2fd6e6' },
  { id: 'p_or', cat: 'paint', name: 'Or brossé', rarity: 'epique', unlock: { level: 10 }, color: '#d7a83a', metallic: true },
  { id: 'p_chrome', cat: 'paint', name: 'Chrome', rarity: 'legendaire', unlock: 'shop', color: '#c9d3df', metallic: true },

  // Roues
  { id: 'w_standard', cat: 'wheels', name: 'Standard', rarity: 'commun', unlock: 'default' },
  { id: 'w_etoile', cat: 'wheels', name: 'Étoile', rarity: 'commun', unlock: { level: 2 } },
  { id: 'w_turbine', cat: 'wheels', name: 'Turbine', rarity: 'rare', unlock: 'shop' },
  { id: 'w_disque', cat: 'wheels', name: 'Disque', rarity: 'rare', unlock: { level: 6 } },
  { id: 'w_neon', cat: 'wheels', name: 'Néon', rarity: 'epique', unlock: 'shop' },

  // Autocollants
  { id: 'd_aucun', cat: 'decal', name: 'Aucun', rarity: 'commun', unlock: 'default' },
  { id: 'd_bandes', cat: 'decal', name: 'Bandes', rarity: 'commun', unlock: 'default' },
  { id: 'd_eclair', cat: 'decal', name: 'Éclair', rarity: 'rare', unlock: { level: 5 } },
  { id: 'd_damier', cat: 'decal', name: 'Damier', rarity: 'rare', unlock: 'shop' },
  { id: 'd_pois', cat: 'decal', name: 'Pois', rarity: 'commun', unlock: 'shop' },
  { id: 'd_vague', cat: 'decal', name: 'Vague', rarity: 'epique', unlock: { challenge: 'buteur' } },
  { id: 'd_numero', cat: 'decal', name: 'Numéro 7', rarity: 'rare', unlock: { level: 7 } },

  // Traînées de boost
  { id: 't_flamme', cat: 'trail', name: 'Flamme', rarity: 'commun', unlock: 'default' },
  { id: 't_plasma', cat: 'trail', name: 'Plasma', rarity: 'rare', unlock: { level: 3 } },
  { id: 't_etincelles', cat: 'trail', name: 'Étincelles', rarity: 'rare', unlock: 'shop' },
  { id: 't_bulles', cat: 'trail', name: 'Bulles', rarity: 'commun', unlock: 'shop' },
  { id: 't_pixels', cat: 'trail', name: 'Pixels', rarity: 'epique', unlock: { level: 9 } },
  { id: 't_arcenciel', cat: 'trail', name: 'Arc-en-ciel', rarity: 'legendaire', unlock: 'shop' },

  // Effets de but
  { id: 'e_onde', cat: 'explosion', name: 'Onde de choc', rarity: 'commun', unlock: 'default' },
  { id: 'e_confettis', cat: 'explosion', name: 'Confettis', rarity: 'rare', unlock: { level: 4 } },
  { id: 'e_feu', cat: 'explosion', name: "Feu d'artifice", rarity: 'epique', unlock: 'shop' },
  { id: 'e_pixels', cat: 'explosion', name: 'Pluie de pixels', rarity: 'rare', unlock: 'shop' },
  { id: 'e_vortex', cat: 'explosion', name: 'Vortex', rarity: 'legendaire', unlock: { level: 12 } },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export const DEFAULT_LOADOUT = {
  body: 'rapace', paint: 'p_blanc', wheels: 'w_standard', decal: 'd_bandes', trail: 't_flamme', explosion: 'e_onde',
};

export function itemsOf(cat) { return ITEMS.filter((i) => i.cat === cat); }

export function defaultOwned() { return ITEMS.filter((i) => i.unlock === 'default').map((i) => i.id); }

export function priceOf(item) { return RARITY[item.rarity]?.price ?? 500; }

/** Cosmétiques résolus pour le rendu (couleurs, styles). */
export function resolveLoadout(loadout = DEFAULT_LOADOUT) {
  const get = (cat) => {
    const id = loadout[cat];
    const it = ITEM_BY_ID.get(id);
    return it && it.cat === cat ? it : ITEM_BY_ID.get(DEFAULT_LOADOUT[cat]);
  };
  const paint = get('paint');
  return {
    body: get('body').id,
    paint: paint.color,
    metallic: !!paint.metallic,
    wheels: get('wheels').id,
    decal: get('decal').id,
    trail: get('trail').id,
    explosion: get('explosion').id,
  };
}

/** Cosmétiques aléatoires pour les bots (affichage uniquement). */
export function randomLoadout(rng) {
  const pick = (cat) => { const list = itemsOf(cat); return list[Math.floor(rng() * list.length) % list.length].id; };
  return resolveLoadout({
    body: pick('body'), paint: pick('paint'), wheels: pick('wheels'), decal: pick('decal'), trail: pick('trail'), explosion: pick('explosion'),
  });
}
