// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2c3547');
scene.fog = new THREE.Fog(new THREE.Color('#2c3547'), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, random);
const match = createMatch(random);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders);
const weapon = createWeaponRig(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 130;

// The player as an agent, so bots can see and shoot them with the same code path.
const playerAgent = {
  id: 'player', name: 'You', team: 'vanguard', isPlayer: true,
  position: player.state.position, alive: true, health: 100, armor: 0,
  kills: 0, deaths: 0, hasBomb: false,
};
match.state.player = playerAgent;

// Invisible hit boxes around the player, so bot fire is a real raycast, not a dice roll.
const playerHit = new THREE.Group();
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.78, 0.32), hitMat);
playerTorso.position.y = 1.02;
playerTorso.userData = { part: 'torso', agent: playerAgent };
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), hitMat);
playerHead.position.y = 1.56;
playerHead.userData = { part: 'head', agent: playerAgent };
const playerLegs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), hitMat);
playerLegs.position.y = 0.33;
playerLegs.userData = { part: 'legs', agent: playerAgent };
playerHit.add(playerTorso, playerHead, playerLegs);
scene.add(playerHit);
const playerHitMeshes = [playerTorso, playerHead, playerLegs];

const loadout = { primary: 'longbow', flash: 0, smoke: 0, kevlar: false };
let currentSlot = 1;
let buyOpen = false;
let suppressPause = false;
let prevPhase = '';
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let wasFiring = false;
let plantProgress = 0;
let plantSiteId = null;
let stepAccum = 0;
let lastBeepSecond = -1;
let spectateBot = null;

// Tracers: a small pool of lines, reused so shooting allocates nothing per frame.
const tracers = [];
for (let i = 0; i < 10; i += 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to, color = 0xffd27a) {
  const tracer = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  const positions = tracer.line.geometry.attributes.position.array;
  positions[0] = from.x;
  positions[1] = from.y;
  positions[2] = from.z;
  positions[3] = to.x;
  positions[4] = to.y;
  positions[5] = to.z;
  tracer.line.geometry.attributes.position.needsUpdate = true;
  tracer.line.material.color.setHex(color);
  tracer.life = 0.07;
  tracer.line.material.opacity = 0.9;
}

// Grenades in flight and smoke clouds on the ground.
const grenades = [];
const smokes = [];
const smokeMat = new THREE.MeshBasicMaterial({ color: 0x8a8f96, transparent: true, opacity: 0.85, depthWrite: false });
function inSmoke(a, b) {
  for (const cloud of smokes) {
    if (performance.now() / 1000 > cloud.until) continue;
    // Distance from the cloud centre to the segment a-b.
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const lenSq = abx * abx + aby * aby + abz * abz || 1;
    let t = ((cloud.x - a.x) * abx + (cloud.y - a.y) * aby + (cloud.z - a.z) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const dx = a.x + abx * t - cloud.x;
    const dy = a.y + aby * t - cloud.y;
    const dz = a.z + abz * t - cloud.z;
    if (dx * dx + dy * dy + dz * dz < cloud.radius * cloud.radius) return true;
  }
  return false;
}

function lineOfSight(a, b) {
  const dir = new THREE.Vector3(b.x - a.x, (b.y + 1.4) - (a.y + 1.5), b.z - a.z);
  const dist = dir.length();
  if (dist < 0.5) return true;
  dir.normalize();
  raycaster.set(new THREE.Vector3(a.x, a.y + 1.5, a.z), dir);
  raycaster.far = dist;
  const hit = raycaster.intersectObjects(world.shootables, false)[0];
  raycaster.far = 130;
  return !hit;
}

// The planted device: a dark box with a blinking red lamp.
const bombGroup = new THREE.Group();
const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x1d2025, roughness: 0.6 }));
const bombLamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 10, 8),
  new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
);
bombLamp.position.set(0, 0.22, 0);
bombGroup.add(bombBody, bombLamp);
bombGroup.visible = false;
scene.add(bombGroup);

const direction = new THREE.Vector3();
const eyePoint = new THREE.Vector3();
const muzzlePoint = new THREE.Vector3();

function muzzleOf(agent) {
  if (agent.isPlayer) {
    camera.getWorldDirection(direction);
    return muzzlePoint.set(camera.position.x, camera.position.y, camera.position.z).addScaledVector(direction, 0.6);
  }
  const yaw = agent.yaw;
  return muzzlePoint.set(
    agent.position.x - Math.sin(yaw) * 0.4,
    agent.position.y + 1.35,
    agent.position.z - Math.cos(yaw) * 0.4,
  );
}

function damageAgent(target, baseDamage, part, attacker) {
  if (!target.alive) return;
  const mult = part === 'head' ? (attacker && attacker.weapon ? attacker.weapon.headMult : 4) : part === 'legs' ? 0.75 : 1;
  let damage = baseDamage * mult;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, damage * 0.5);
    target.armor -= absorbed;
    damage -= absorbed;
  }
  target.health -= damage;
  if (target.isPlayer) {
    audio.hurt();
    hud.setHealth(target.health, target.armor);
  }
  if (target.health > 0) return;
  target.alive = false;
  target.health = 0;
  if (target.isPlayer) {
    match.state.deaths += 1;
  } else if (attacker && attacker.isPlayer) {
    match.state.kills += 1;
  }
  match.onKill(attacker, target);
  if (attacker && attacker.isPlayer) {
    audio.kill();
    hud.hitMarker(true, shot ? 4000 : 120);
  }
  if (target.hasBomb) {
    target.hasBomb = false;
    const carrier = bots.agents.find((a) => a.team === 'vanguard' && a.alive);
    if (carrier) {
      carrier.hasBomb = true;
      match.state.bombCarrier = carrier.id;
      match.pushFeed(`${carrier.name} picks up the device`);
    } else if (playerAgent.alive) {
      playerAgent.hasBomb = true;
      match.state.bombCarrier = 'player';
      match.pushFeed('You pick up the device');
    }
  }
}

function shootPlayer() {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return;
  }
  const def = weapon.state.def;
  playerAgent.weapon = def;
  const pellets = def.pellets ?? 1;
  camera.getWorldDirection(direction);
  const speed = player.groundSpeed();
  const spread = weapon.spread(speed, input.state.ads, player.state.crouching, !player.state.onGround);
  const from = muzzleOf(playerAgent);
  for (let p = 0; p < pellets; p += 1) {
    const dir = direction.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    raycaster.set(camera.position, dir);
    raycaster.far = def.range;
    const hit = raycaster.intersectObjects(world.shootables.concat(bots.hitMeshes), false)[0];
    raycaster.far = 130;
    const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, def.range);
    spawnTracer(from.clone(), end, def.tracer === '#9fd0ff' ? 0x9fd0ff : 0xffd27a);
    if (hit && hit.object.userData.agent) {
      const target = hit.object.userData.agent;
      if (target.team !== 'vanguard') {
        damageAgent(target, def.damage, hit.object.userData.part, playerAgent);
        hud.hitMarker(target.health <= 0, shot ? 4000 : 90);
        audio.hit();
      }
    }
  }
  audio.shot(def.id);
  weapon.pullTrigger();
  player.recoil(def.recoil * (0.9 + random() * 0.2), (random() * 2 - 1) * def.recoil * 0.3);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
}

function shootBot(agent, enemy) {
  const from = new THREE.Vector3(agent.position.x, agent.position.y + 1.5, agent.position.z);
  const aim = new THREE.Vector3(enemy.position.x, enemy.position.y + 1.2, enemy.position.z);
  const dist = from.distanceTo(aim);
  const err = agent.skill.error * dist;
  aim.x += (random() * 2 - 1) * err;
  aim.y += (random() * 2 - 1) * err * 0.7;
  aim.z += (random() * 2 - 1) * err;
  const dir = aim.sub(from).normalize();
  raycaster.set(from, dir);
  raycaster.far = agent.weapon.range;
  const hit = raycaster.intersectObjects(world.shootables.concat(bots.hitMeshes, playerHitMeshes), false)[0];
  raycaster.far = 130;
  const end = hit ? hit.point : from.clone().addScaledVector(dir, agent.weapon.range);
  spawnTracer(muzzleOf(agent).clone(), end, 0xffb45e);
  const distToPlayer = from.distanceTo(player.state.position);
  if (distToPlayer < 40) audio.shot(agent.weapon.id);
  else if (distToPlayer < 90) audio.distantShot();
  if (hit && hit.object.userData.agent) {
    const target = hit.object.userData.agent;
    if (target.team !== agent.team) {
      damageAgent(target, agent.weapon.damage, hit.object.userData.part, agent);
      if (target.isPlayer) {
        const angle = Math.atan2(agent.position.x - player.state.position.x, agent.position.z - player.state.position.z);
        hud.damageFrom((angle * 180) / Math.PI);
      }
    }
  }
}

function throwGrenade(kind) {
  if (match.state.phase !== 'live') return;
  if (kind === 'flash' && loadout.flash <= 0) return;
  if (kind === 'smoke' && loadout.smoke <= 0) return;
  camera.getWorldDirection(direction);
  const pos = camera.position.clone().addScaledVector(direction, 0.5);
  const vel = direction.clone().multiplyScalar(11);
  vel.y += 3.5;
  grenades.push({ kind, pos, vel, fuse: 0.85 });
  if (kind === 'flash') loadout.flash -= 1;
  else loadout.smoke -= 1;
}

function detonateGrenade(grenade) {
  if (grenade.kind === 'smoke') {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 12), smokeMat);
    mesh.position.copy(grenade.pos);
    mesh.position.y = Math.max(1.2, grenade.pos.y);
    scene.add(mesh);
    smokes.push({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, radius: 4.2, until: elapsed + 12, mesh });
    return;
  }
  // Flashbang: anyone within 26 m looking at it, with a clear line, is blinded.
  const targets = [...bots.agents, playerAgent];
  for (const target of targets) {
    if (!target.alive) continue;
    const dx = grenade.pos.x - target.position.x;
    const dy = grenade.pos.y - (target.position.y + 1.5);
    const dz = grenade.pos.z - target.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 26) continue;
    const yaw = target.isPlayer ? player.state.yaw : target.yaw;
    const facing = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const toFlash = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
    if (facing.dot(toFlash) < 0.15) continue;
    if (!lineOfSight(target.position, grenade.pos)) continue;
    if (target.isPlayer) {
      hud.flashWhite(Math.max(400, 2600 - dist * 70));
    } else {
      target.blindUntil = elapsed + Math.max(0.6, 2.8 - dist * 0.08);
    }
  }
  audio.plantBeep();
}

function resetRound() {
  // Positions, health, weapons, economy buys, and a new bomb carrier.
  const carrierIsPlayer = random() < 0.5;
  const carrierBot = bots.agents.find((a) => a.team === 'vanguard' && a.alive);
  bots.reset(match.state.round, carrierIsPlayer ? null : carrierBot ? carrierBot.id : null);
  for (const agent of bots.agents) {
    if (random() < 0.6 && agent.weapon.id === 'fang') {
      agent.weapon = WEAPONS.longbow;
      agent.mag = agent.weapon.mag;
      agent.reserve = agent.weapon.reserve;
    }
    if (random() < 0.35) agent.armor = 50;
  }
  const spawnIndex = Math.floor(random() * world.spawns.vanguard.length);
  const spawn = world.spawns.vanguard[spawnIndex];
  player.teleport(spawn.x, spawn.z, Math.PI);
  playerAgent.alive = true;
  playerAgent.health = 100;
  playerAgent.armor = loadout.kevlar ? 50 : 0;
  playerAgent.hasBomb = carrierIsPlayer;
  match.state.bombCarrier = carrierIsPlayer ? 'player' : carrierBot ? carrierBot.id : null;
  weapon.refill(WEAPONS[loadout.primary]);
  currentSlot = 1;
  bombGroup.visible = false;
  plantProgress = 0;
  plantSiteId = null;
  spectateBot = null;
  hud.setHealth(100, playerAgent.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.score.vanguard, match.state.score.jackal);
  hud.setRound(match.state.round);
  if (carrierIsPlayer) hud.banner('YOU CARRY THE DEVICE', 'Plant it at site A or B — hold E inside the ring', 3400);
  else hud.banner(match.state.banner, '', 2600);
}

function onPhaseChange(phase) {
  if (phase === 'buy') {
    resetRound();
  } else if (phase === 'live') {
    audio.roundStart();
    hud.banner('GO', 'Take a site — or hold the yard', 1800);
  } else if (phase === 'roundEnd') {
    if (match.state.roundWinner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    hud.banner(match.state.banner, match.state.roundReason, 4200);
  } else if (phase === 'matchEnd') {
    if (match.state.matchWinner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showOverlay('end', {
      winner: match.state.matchWinner,
      scoreV: match.state.score.vanguard,
      scoreJ: match.state.score.jackal,
      kills: match.state.kills,
    });
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    if (buyOpen) {
      buyOpen = false;
      hud.showBuy(false, match.state.money);
    }
  } else if (!suppressPause && match.state.phase !== 'matchEnd') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
  suppressPause = false;
}

hud.onPlay(() => {
  if (shot) return;
  if (match.state.phase === 'matchEnd') {
    match.reset();
    resetRound();
  }
  input.requestLock();
});

hud.onBuy((itemId, row) => {
  const result = match.buy(itemId);
  if (!result.ok) {
    audio.denied();
    hud.markBought(row, false);
    return;
  }
  audio.buy();
  hud.markBought(row, true);
  hud.setMoney(match.state.money);
  const item = result.item;
  if (WEAPONS[itemId]) {
    loadout.primary = itemId;
    weapon.refill(WEAPONS[itemId]);
    currentSlot = 1;
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, item.name);
  } else if (itemId === 'kevlar') {
    loadout.kevlar = true;
    playerAgent.armor = 50;
    hud.setHealth(playerAgent.health, 50);
  } else if (itemId === 'flash') {
    loadout.flash += 1;
  } else if (itemId === 'smoke') {
    loadout.smoke += 1;
  }
});

function botContext() {
  return {
    bombPlanted: match.state.bombPlanted,
    plantSite: match.state.plantSite,
    bombPosition: match.state.bombPosition,
    lineOfSight,
    inSmoke,
    aliveCount: (team) => {
      if (team === 'vanguard') return bots.aliveCount('vanguard') + (playerAgent.alive ? 1 : 0);
      return bots.aliveCount('jackal');
    },
    enemiesOf(agent) {
      if (agent.team === 'vanguard') {
        return bots.agents.filter((a) => a.team === 'jackal' && a.alive);
      }
      const foes = bots.agents.filter((a) => a.team === 'vanguard' && a.alive);
      if (playerAgent.alive) foes.push(playerAgent);
      return foes;
    },
    shootBot,
    onPlanted(agent) {
      match.onPlanted(agent);
      bombGroup.position.set(agent.position.x, 0.2, agent.position.z);
      bombGroup.visible = true;
      audio.plantBeep();
    },
    onDefused(agent) {
      match.onDefused(agent);
      bombGroup.visible = false;
      audio.explosion();
    },
  };
}

function syncCamera() {
  if (!playerAgent.alive && spectateBot && spectateBot.alive) {
    const bot = spectateBot;
    camera.position.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    camera.rotation.set(0, bot.yaw, 0, 'YXZ');
    return;
  }
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  playerHit.position.set(body.position.x, body.position.y, body.position.z);
  playerHit.rotation.y = body.yaw;
}

function step(dt) {
  elapsed += dt;
  const phase = match.state.phase;
  if (phase !== prevPhase) {
    onPhaseChange(phase);
    prevPhase = phase;
  }
  const counts = {
    vanguard: bots.aliveCount('vanguard') + (playerAgent.alive ? 1 : 0),
    jackal: bots.aliveCount('jackal'),
  };
  match.step(dt, counts);

  // Player movement and actions.
  if (playerAgent.alive && phase !== 'matchEnd') {
    player.step(dt, input.state.keys, input.state.ads);
    if (input.pressed('KeyR')) {
      if (weapon.reload()) audio.reload();
    }
    if (input.pressed('Digit1') && currentSlot !== 1) {
      currentSlot = 1;
      weapon.refill(WEAPONS[loadout.primary]);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
    }
    if (input.pressed('Digit2') && currentSlot !== 2) {
      currentSlot = 2;
      weapon.refill(WEAPONS.p9);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
    }
    if (input.pressed('KeyG')) throwGrenade('flash');
    if (input.pressed('KeyH')) throwGrenade('smoke');
    // Footsteps.
    stepAccum += player.groundSpeed() * dt;
    if (stepAccum > 2.4 && player.state.onGround) {
      stepAccum = 0;
      audio.step(player.groundSpeed() > 4);
    }
    // Planting: the carrier holds E inside a site ring.
    if (playerAgent.hasBomb && phase === 'live' && !match.state.bombPlanted) {
      let site = null;
      for (const s of Object.values(world.sites)) {
        const d = Math.hypot(player.state.position.x - s.center.x, player.state.position.z - s.center.z);
        if (d < s.radius) site = s;
      }
      if (site && input.state.keys.has('KeyE')) {
        plantProgress += dt;
        plantSiteId = site.id;
        if (plantProgress >= 3) {
          plantProgress = 0;
          playerAgent.hasBomb = false;
          match.onPlanted({ targetSite: site.id, position: player.state.position });
          bombGroup.position.set(player.state.position.x, 0.2, player.state.position.z);
          bombGroup.visible = true;
          audio.plantBeep();
        }
      } else {
        plantProgress = 0;
        plantSiteId = null;
      }
    }
  }
  if (!playerAgent.alive && !spectateBot) {
    spectateBot = bots.agents.find((a) => a.team === 'vanguard' && a.alive) ?? null;
    if (spectateBot) hud.banner('YOU ARE DOWN', `Spectating ${spectateBot.name}`, 2600);
  }

  weapon.step(dt);
  bots.step(dt, elapsed, botContext());

  // Grenade flight and smoke expiry.
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 20 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.1) {
      g.pos.y = 0.1;
      g.vel.set(0, 0, 0);
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      detonateGrenade(g);
      grenades.splice(i, 1);
    }
  }
  for (let i = smokes.length - 1; i >= 0; i -= 1) {
    if (elapsed > smokes[i].until) {
      scene.remove(smokes[i].mesh);
      smokes.splice(i, 1);
    }
  }

  // Tracers fade.
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.9;
    }
  }

  // Bomb beeps and the blinking lamp.
  if (match.state.bombPlanted) {
    const second = Math.ceil(match.state.bombTimer);
    if (second !== lastBeepSecond) {
      lastBeepSecond = second;
      audio.bombTick();
    }
    bombLamp.material.color.setHex(Math.floor(elapsed * 4) % 2 === 0 ? 0xff2a1a : 0x550000);
    if (match.state.bombTimer <= 0) {
      bombGroup.visible = false;
      audio.explosion();
    }
  }

  // HUD: cheap values every frame, the minimap ten times a second.
  hud.setTimer(match.state.timer, phase);
  hud.setAlive(counts.vanguard, counts.jackal);
  hud.setBombTimer(match.state.bombPlanted ? match.state.bombTimer : null);
  hud.killfeed(match.state.feed);
  const spreadPx = weapon.spread(player.groundSpeed(), input.state.ads, player.state.crouching, !player.state.onGround) * 900;
  hud.setCrosshairGap(6 + spreadPx);
  if (Math.floor(elapsed * 10) !== Math.floor((elapsed - dt) * 10)) {
    const spotted = new Set();
    for (const agent of bots.agents) {
      if (agent.team === 'jackal' && agent.alive && agent.lastSeenAt > elapsed - 4) spotted.add(agent.id);
    }
    hud.drawMinimap(player.state, bots.agents, world.sites, spotted, match.state.bombPosition);
  }
  // Scoreboard while Tab is held.
  if (input.state.keys.has('Tab')) {
    const rows = [
      { name: 'You', team: 'vanguard', kills: match.state.kills, deaths: match.state.deaths, alive: playerAgent.alive, money: match.state.money },
      ...bots.agents.map((a) => ({
        name: a.name, team: a.team, kills: 0, deaths: 0, alive: a.alive, money: 0,
      })),
    ];
    hud.showScoreboard(true, rows);
  } else {
    hud.showScoreboard(false, []);
  }
  // Buy menu toggle.
  if (input.pressed('KeyB') && phase === 'buy') {
    buyOpen = !buyOpen;
    if (buyOpen) {
      suppressPause = true;
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      input.requestLock();
    }
    hud.showBuy(buyOpen, match.state.money);
  }
  if (phase !== 'buy' && buyOpen) {
    buyOpen = false;
    hud.showBuy(false, match.state.money);
  }
  // Channel progress bar.
  const channel = document.getElementById('channel');
  if (plantProgress > 0 && plantSiteId) {
    channel.hidden = false;
    channel.querySelector('.channel-fill').style.width = `${(plantProgress / 3) * 100}%`;
    channel.querySelector('.channel-label').textContent = `PLANTING AT SITE ${plantSiteId}`;
  } else {
    channel.hidden = true;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);
    // Fire here, once per animation frame: automatic weapons while held, semi-automatic
    // on the rising edge of the click. The cooldown in weapon.step paces the rate.
    if (input.state.firing && weapon.ready() && playerAgent.alive) {
      if (weapon.state.def.auto || !wasFiring) shootPlayer();
    }
    wasFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    camera.position.set(16, 10, 22);
    camera.lookAt(0, 1, -8);
    hud.drawMinimap(player.state, bots.agents, world.sites, new Set(), null);
    hud.showOverlay('start');
    paintTwiceThenReady(true);
    return;
  }
  if (name === 'play') {
    // Clear ground: the player stands south-east of mid, the Jackal in the open west
    // of the mid pillar, so the sightline misses the pillar and the shot lands.
    player.teleport(10, 14, 0);
    const jackal = bots.agents.find((a) => a.team === 'jackal');
    const jackal2 = bots.agents.find((a) => a.team === 'jackal' && a !== jackal);
    if (jackal) {
      jackal.position.set(-8, 0, -2);
      jackal.body.group.position.copy(jackal.position);
      jackal.path = [];
      jackal.state = 'hold';
      jackal.holdUntil = 9999;
    }
    if (jackal2) {
      jackal2.position.set(4, 0, -6);
      jackal2.body.group.position.copy(jackal2.position);
      jackal2.path = [];
      jackal2.state = 'hold';
      jackal2.holdUntil = 9999;
    }
    const mate = bots.agents.find((a) => a.team === 'vanguard');
    if (mate) {
      mate.position.set(-3, 0, 15);
      mate.body.group.position.copy(mate.position);
      mate.path = [];
      mate.state = 'hold';
      mate.holdUntil = 9999;
    }
    settle(30);
    if (jackal) {
      aimAt(new THREE.Vector3(jackal.position.x, jackal.position.y + 1.2, jackal.position.z));
      shootPlayer();
      settle(6);
    }
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
    paintTwiceThenReady(false);
    return;
  }
  // end: the match is over, Vanguard won 5-3. The banner and the scoreboard carry
  // the result; the start overlay stays hidden so they read at a glance.
  match.state.score.vanguard = 5;
  match.state.score.jackal = 3;
  match.state.matchWinner = 'vanguard';
  player.teleport(0, 14, 0);
  settle(20);
  match.state.phase = 'matchEnd';
  hud.setScore(5, 3);
  hud.setRound(8);
  hud.banner('VANGUARD WINS THE MATCH', 'Final score 5–3 · You had 7 eliminations', 60000);
  hud.showScoreboard(true, [
    { name: 'You', team: 'vanguard', kills: 7, deaths: 3, alive: true, money: 4200 },
    ...bots.agents.map((a) => ({ name: a.name, team: a.team, kills: 2, deaths: 3, alive: a.team === 'vanguard', money: 1500 })),
  ]);
  paintTwiceThenReady(true);
}

function paintTwiceThenReady(cinematic) {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    if (!cinematic) syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

bots.createAll();
match.startRound();
resetRound();
prevPhase = 'buy';
syncCamera();
hud.setHealth(100, playerAgent.armor);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
