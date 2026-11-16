// Meridian Yards: an industrial container yard, 64 x 48 m, built from boxes in code.
// Vanguard (attackers, the player's team) spawn south; Jackals (defenders) spawn north.
// Site A is the warehouse on the west, site B the rail dock on the east, joined by a
// mid lane and two side lanes. Every box is a collider for movement and a surface a
// bullet stops on. The waypoint graph below is what the bots navigate.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeTextures } from './textures.js';

// Waypoint ids, so routes read as a short list of names.
const WP = {
  vSpawn: 0, vSpawn2: 1, midSouth: 2, mid: 3, midNorth: 4,
  westSouth: 5, westMid: 6, westNorth: 7, siteA: 8, siteA2: 9,
  eastSouth: 10, eastMid: 11, eastNorth: 12, siteB: 13, siteB2: 14,
  connectorW: 15, connectorE: 16, jSpawn: 17, jSpawn2: 18, jWest: 19, jEast: 20,
  aDoor: 21, bDoor: 22, yardWest: 23, yardEast: 24,
};

const NODES = [
  [0, 20], [-8, 20], // 0,1 Vanguard spawn
  [0, 12], [0, 4], [0, -6], // 2,3,4 mid lane
  [-16, 14], [-16, 4], [-16, -6], // 5,6,7 west lane
  [-24, -13], [-20, -17], // 8,9 site A
  [16, 14], [16, 4], [16, -6], // 10,11,12 east lane
  [24, -13], [20, -17], // 13,14 site B
  [-8, -2], [8, -2], // 15,16 connectors
  [0, -18], [-12, -18], [12, -18], // 17,18,19/20 Jackal spawn and holds
  [-19, -10], [19, -10], // 21,22 site doors
  [-26, 8], [26, 8], // 23,24 yard corners
];

const LINKS = {
  0: [1, 2, 5, 10], 1: [0, 2, 5],
  2: [0, 1, 3, 5, 10], 3: [2, 4, 15, 16], 4: [3, 17, 15, 16],
  5: [0, 2, 6, 23], 6: [5, 7, 15], 7: [6, 8, 21], 8: [7, 9, 21], 9: [8, 17, 19],
  10: [0, 2, 11, 24], 11: [10, 12, 16], 12: [11, 13, 22], 13: [12, 14, 22], 14: [13, 17, 20],
  15: [3, 6, 4], 16: [3, 11, 4],
  17: [4, 9, 14, 18, 19, 20], 18: [17, 19, 20], 19: [9, 17, 21], 20: [14, 17, 22],
  21: [7, 8, 19], 22: [12, 13, 20],
  23: [5, 6], 24: [10, 11],
};

function route(from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of LINKS[node] ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      if (next === to) {
        const path = [to];
        let at = to;
        while (prev.get(at) !== -1) {
          at = prev.get(at);
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function createWorld(scene) {
  const textures = makeTextures();
  const group = new THREE.Group();
  scene.add(group);

  const concrete = new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.95, metalness: 0.02 });
  const steel = new THREE.MeshStandardMaterial({ map: textures.steel, roughness: 0.6, metalness: 0.45 });
  const steelBlue = new THREE.MeshStandardMaterial({ map: textures.steel, color: new THREE.Color('#5a6b7d'), roughness: 0.6, metalness: 0.45 });
  const steelRust = new THREE.MeshStandardMaterial({ map: textures.steel, color: new THREE.Color('#7d5a3a'), roughness: 0.7, metalness: 0.35 });
  const asphalt = new THREE.MeshStandardMaterial({ map: textures.asphalt, roughness: 0.98, metalness: 0 });
  const hazard = new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.8, metalness: 0.1 });
  const crateMat = new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.9, metalness: 0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d2025'), roughness: 0.9, metalness: 0.1 });
  const lampMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f2a71b'), emissive: new THREE.Color('#f2a71b'), emissiveIntensity: 2.2 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the yard wall, 64 x 48 m, 5 m high, open to the dusk sky.
  box(64.4, 0.4, 48.4, 0, -0.2, 0, asphalt);
  box(0.5, 5, 48.4, -32.2, 2.5, 0, concrete);
  box(0.5, 5, 48.4, 32.2, 2.5, 0, concrete);
  box(64.4, 5, 0.5, 0, 2.5, -24.2, concrete);
  box(64.4, 5, 0.5, 0, 2.5, 24.2, concrete);

  // Site A warehouse, west: three walls and a roof lip, door facing the yard.
  box(0.6, 4.4, 12, -29.5, 2.2, -13, steel);
  box(9, 4.4, 0.6, -25.5, 2.2, -19.2, steel);
  box(9, 4.4, 0.6, -25.5, 2.2, -6.8, steel);
  box(9, 0.5, 12.6, -25.5, 4.6, -13, darkMat, false);
  box(0.4, 0.3, 3.4, -21.2, 0.15, -13, hazard, false);

  // Site B rail dock, east: a raised platform, rails and a dock office.
  box(10, 0.9, 12, 26.5, 0.45, -13, concrete);
  box(0.5, 0.5, 12, 22.2, 1.1, -13, hazard, false);
  box(6, 3.4, 0.5, 29.5, 1.7, -18.5, steelRust);
  box(6, 3.4, 0.5, 29.5, 1.7, -7.5, steelRust);
  box(0.3, 0.3, 11, 24.5, 1.05, -13, darkMat, false);
  box(0.3, 0.3, 11, 26.5, 1.05, -13, darkMat, false);

  // Container rows: the yard's cover. Each is 6.1 x 2.6 x 2.6, some stacked.
  const containers = [
    [-8, 1.3, 8, steelBlue, 0], [2, 1.3, 10, steel, 0], [12, 1.3, 8, steelRust, 0],
    [-12, 1.3, -2, steelRust, 0], [12, 1.3, -2, steelBlue, 0],
    [-4, 1.3, -10, steel, 0], [6, 1.3, -10, steelRust, 0],
    [-8, 3.9, 8, steel, 0], [12, 3.9, -2, steel, 0],
    [-20, 1.3, 2, steelBlue, 1], [20, 1.3, 2, steel, 1],
    [-26, 1.3, -2, steel, 1], [26, 1.3, 2, steelBlue, 1],
  ];
  for (const [x, y, z, mat, rot] of containers) {
    const mesh = box(rot ? 2.6 : 6.1, 2.6, rot ? 6.1 : 2.6, x, y, z, mat);
    mesh.rotation.y = rot ? Math.PI / 2 : 0;
    // Recompute the collider after the rotation: Box3 from the rotated mesh.
    colliders[colliders.length - 1] = new THREE.Box3().setFromObject(mesh);
  }

  // Crates: low cover to crouch behind, scattered on every lane.
  const crates = [
    [-4, 0.6, 16, 1.2], [4, 0.6, 16, 1.2], [0, 0.6, -12, 1.2],
    [-10, 0.6, 6, 1.2], [10, 0.6, 6, 1.2], [-10, 0.6, -12, 1.2], [10, 0.6, -12, 1.2],
    [-18, 0.6, -8, 1.2], [18, 0.6, -8, 1.2], [-2, 0.6, 0, 1.2], [2, 0.6, -2, 1.2],
    [-24, 0.6, -16, 1.2], [24, 0.6, -10, 1.2], [-14, 1.8, 14, 1.2], [14, 1.8, 14, 1.2],
  ];
  for (const [x, y, z, s] of crates) box(s, s, s, x, y, z, crateMat);

  // Mid pillar and the two lane walls that break the long sightlines.
  box(1.6, 4.2, 1.6, 0, 2.1, 4, concrete);
  box(0.6, 2.2, 8, -9, 1.1, -4, concrete);
  box(0.6, 2.2, 8, 9, 1.1, -4, concrete);

  // Floodlight poles with warm lamps; two carry real point lights.
  const poles = [[-14, 14], [14, 14], [-14, -14], [14, -14], [0, -20]];
  for (const [x, z] of poles) {
    box(0.25, 6, 0.25, x, 3, z, darkMat);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), lampMat);
    lamp.position.set(x, 6.1, z);
    group.add(lamp);
  }
  for (const [x, z] of [[-14, 14], [14, -14]]) {
    const light = new THREE.PointLight(new THREE.Color('#f2a71b'), 30, 26, 1.6);
    light.position.set(x, 5.6, z);
    scene.add(light);
  }

  // Site markers: a glowing ring on the ground and a floating letter sprite.
  function siteMarker(letter, color, x, z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.1, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(3.4, 3.4, 1);
    sprite.position.set(x, 4.6, z);
    group.add(sprite);
    return sprite;
  }
  const markerA = siteMarker('A', PALETTE.siteA, -24, -13);
  const markerB = siteMarker('B', PALETTE.siteB, 24, -13);

  // Distant skyline silhouettes outside the walls, for the dusk backdrop.
  const skylineMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#101318'), roughness: 1 });
  const skyline = [[-48, 8, -40, 14], [-20, 6, -52, 20], [12, 10, -48, 16], [40, 7, -44, 12], [52, 9, -20, 18], [-52, 6, 20, 16], [48, 12, 30, 20]];
  for (const [x, h, z, w] of skyline) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.6), skylineMat);
    mesh.position.set(x, h / 2, z);
    group.add(mesh);
  }

  // Lighting: dusk hemisphere, a low warm key sun, a cool fill.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#6b7d99'), new THREE.Color('#2a241c'), 1.35));
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.0);
  key.position.set(28, 22, 18);
  key.target.position.set(-6, 0, -6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -40;
  key.shadow.camera.right = 40;
  key.shadow.camera.top = 40;
  key.shadow.camera.bottom = -40;
  key.shadow.camera.far = 90;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d94b8'), 0.5);
  fill.position.set(-20, 14, 22);
  scene.add(fill);

  const sites = {
    A: { id: 'A', center: new THREE.Vector3(-24, 0, -13), radius: 4.6, marker: markerA },
    B: { id: 'B', center: new THREE.Vector3(24, 0, -13), radius: 4.6, marker: markerB },
  };
  const spawns = {
    vanguard: [
      new THREE.Vector3(-6, 0, 20), new THREE.Vector3(-2, 0, 21), new THREE.Vector3(2, 0, 21),
      new THREE.Vector3(6, 0, 20), new THREE.Vector3(0, 0, 18),
    ],
    jackal: [
      new THREE.Vector3(-6, 0, -20), new THREE.Vector3(-2, 0, -21), new THREE.Vector3(2, 0, -21),
      new THREE.Vector3(6, 0, -20), new THREE.Vector3(0, 0, -18),
    ],
  };

  return {
    colliders,
    shootables,
    sites,
    spawns,
    group,
    waypoints: {
      nodes: NODES,
      nearest(x, z) {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < NODES.length; i += 1) {
          const dx = NODES[i][0] - x;
          const dz = NODES[i][1] - z;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      },
      route,
      siteNode(siteId) {
        return siteId === 'A' ? WP.siteA : WP.siteB;
      },
      holdNode(team) {
        return team === 'vanguard' ? WP.midSouth : WP.jSpawn;
      },
    },
  };
}
