// The look plan, in one place. Meridian Yards at dusk: cold steel blues and concrete
// greys, warm sodium lamps, and one hazard amber. The same names are the CSS custom
// properties in index.html, so the HUD and the 3D scene share one palette.
export const PALETTE = {
  canvas: '#171a20',
  surface: '#22262e',
  hairline: '#31363f',
  ink: '#e8e4d8',
  muted: '#9aa3ad',
  accent: '#f2a71b',
  vanguard: '#4da3ff',
  jackal: '#ff5a3c',
  siteA: '#37c978',
  siteB: '#f2a71b',
  ground: '#2a2d33',
};

export function shade(name) {
  return PALETTE[name];
}
