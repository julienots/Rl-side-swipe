// Palettes et décors originaux des arènes.
export const THEMES = {
  horizon: {
    skyTop: '#141c46', skyBottom: '#e0705a', structure: '#1b2038', structureEdge: '#2c3358',
    interiorTop: 'rgba(30,40,90,0.30)', interiorBottom: 'rgba(255,160,110,0.10)',
    line: 'rgba(255,255,255,0.75)', accent: '#ffd27a', floorGlow: '#ffe2a8', deco: 'stadium',
  },
  boite: {
    skyTop: '#06181b', skyBottom: '#1f6f6a', structure: '#122428', structureEdge: '#1f3d42',
    interiorTop: 'rgba(10,60,60,0.35)', interiorBottom: 'rgba(120,255,220,0.08)',
    line: 'rgba(200,255,240,0.7)', accent: '#8ff7e0', floorGlow: '#8ff7e0', deco: 'lamps',
  },
  fonderie: {
    skyTop: '#140e0b', skyBottom: '#6a3518', structure: '#2a211b', structureEdge: '#4a3628',
    interiorTop: 'rgba(60,30,10,0.35)', interiorBottom: 'rgba(255,140,40,0.10)',
    line: 'rgba(255,220,180,0.7)', accent: '#ff9a3c', floorGlow: '#ffb15e', deco: 'factory', hazard: true,
  },
  orbitale: {
    skyTop: '#02030c', skyBottom: '#1b1647', structure: '#121830', structureEdge: '#26315a',
    interiorTop: 'rgba(40,50,120,0.25)', interiorBottom: 'rgba(120,160,255,0.08)',
    line: 'rgba(190,210,255,0.75)', accent: '#8fb8ff', floorGlow: '#a9c6ff', deco: 'space',
  },
  neon: {
    skyTop: '#07011a', skyBottom: '#2a0845', structure: '#130923', structureEdge: '#ff3fd8',
    interiorTop: 'rgba(60,0,90,0.30)', interiorBottom: 'rgba(0,255,255,0.06)',
    line: 'rgba(120,255,255,0.8)', accent: '#ff3fd8', floorGlow: '#2ff3ff', deco: 'grid', neonEdge: true,
  },
  cratere: {
    skyTop: '#000004', skyBottom: '#1d2333', structure: '#2b2f3a', structureEdge: '#454b5c',
    interiorTop: 'rgba(80,90,120,0.20)', interiorBottom: 'rgba(200,210,255,0.06)',
    line: 'rgba(230,236,255,0.7)', accent: '#d8e2ff', floorGlow: '#d8e2ff', deco: 'moon',
  },
};

export function getTheme(id) { return THEMES[id] || THEMES.horizon; }
