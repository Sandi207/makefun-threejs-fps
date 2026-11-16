// The bots: nine agents with names, a waypoint brain and human limits. They rush sites,
// hold angles, rotate on intel, plant and defuse, and fall back when outnumbered. Aim is
// reaction time plus error, so rounds are winnable but tense; hearing a shot pulls a bot
// toward the sound. A bot is a body (torso/head/legs hit meshes), a weapon and a state.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { moveBody, RADIUS } from './player.js';

export const BOT_NAMES = {
  vanguard: ['Rook', 'Havoc', 'Mira', 'Sable'],
  jackal: ['Dingo', 'Vex', 'Razor', 'Koda', 'Fang'],
};

const SKILL = [
  { reaction: 0.55, error: 0.028, burst: 3, speed: 3.7 },
  { reaction: 0.45, error: 0.022, burst: 4, speed: 4.0 },
  { reaction: 0.65, error: 0.032, burst: 3, speed: 3.6 },
  { reaction: 0.38, error: 0.018, burst: 5, speed: 4.3 },
  { reaction: 0.5, error: 0.025, burst: 4, speed: 3.9 },
];

function botBody(team) {
  const group = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'vanguard' ? PALETTE.vanguard : PALETTE.jackal),
    roughness: 0.65, metalness: 0.1,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23262b'), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8a37e'), roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.78, 0.32), vest);
  torso.position.y = 1.02;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.56;
  head.userData.part = 'head';
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.05), dark);
  visor.position.set(0, 1.57, 0.14);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), dark);
  legs.position.y = 0.33;
  legs.userData.part = 'legs';
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.28, 1.05, -0.2);
  group.add(torso, head, visor, legs, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
    }
  });
  return { group, torso, head, legs };
}

export function createBots(scene, world, random) {
  const agents = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();
  const overlaps = (x, y, z, height, lift) => {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  };

  function spawnAgent(team, index, spawn) {
    const skill = SKILL[index % SKILL.length];
    const body = botBody(team);
    body.group.position.copy(spawn);
    scene.add(body.group);
    const weaponId = ['fang', 'longbow', 'longbow', 'jackhammer', 'needle'][index % 5];
    const agent = {
      id: `${team}-${index}`,
      name: BOT_NAMES[team][index],
      team,
      skill,
      position: body.group.position,
      velocity: new THREE.Vector3(),
      yaw: team === 'vanguard' ? Math.PI : 0,
      health: 100,
      armor: 0,
      alive: true,
      weapon: WEAPONS[weaponId],
      mag: WEAPONS[weaponId].mag,
      reserve: WEAPONS[weaponId].reserve,
      cooldown: 0,
      reloadLeft: 0,
      state: 'rush',
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      targetSite: team === 'vanguard' ? (random() < 0.5 ? 'A' : 'B') : null,
      hasBomb: false,
      visibleEnemy: null,
      lastSeen: null,
      lastSeenAt: -99,
      lastHeard: null,
      lastHeardAt: -99,
      reactAt: 0,
      burstLeft: 0,
      burstPause: 0,
      channel: 0,
      blindUntil: 0,
      thinkAt: random() * 0.15,
      body,
      fall: 0,
    };
    for (const mesh of [body.torso, body.head, body.legs]) {
      mesh.userData.agent = agent;
      hitMeshes.push(mesh);
    }
    agents.push(agent);
    return agent;
  }

  function reset(round, carrierId) {
    for (const agent of agents) {
      const spawn = world.spawns[agent.team][agents.filter((a) => a.team === agent.team).indexOf(agent)];
      agent.position.copy(spawn);
      agent.velocity.set(0, 0, 0);
      agent.yaw = agent.team === 'vanguard' ? Math.PI : 0;
      agent.health = 100;
      agent.armor = 0;
      agent.alive = true;
      agent.mag = agent.weapon.mag;
      agent.reserve = agent.weapon.reserve;
      agent.cooldown = 0;
      agent.reloadLeft = 0;
      agent.state = 'rush';
      agent.path = [];
      agent.pathIndex = 0;
      agent.holdUntil = 0;
      agent.targetSite = agent.team === 'vanguard' ? (random() < 0.5 ? 'A' : 'B') : null;
      agent.hasBomb = agent.id === carrierId;
      agent.visibleEnemy = null;
      agent.lastSeen = null;
      agent.lastSeenAt = -99;
      agent.lastHeard = null;
      agent.lastHeardAt = -99;
      agent.channel = 0;
      agent.blindUntil = 0;
      agent.body.group.rotation.set(0, agent.yaw, 0);
      agent.body.group.visible = true;
      agent.fall = 0;
    }
  }

  function createAll() {
    for (let i = 0; i < 4; i += 1) spawnAgent('vanguard', i, world.spawns.vanguard[i + 1]);
    for (let i = 0; i < 5; i += 1) spawnAgent('jackal', i, world.spawns.jackal[i]);
  }

  function faceToward(agent, x, z) {
    const dx = x - agent.position.x;
    const dz = z - agent.position.z;
    agent.yaw = Math.atan2(-dx, -dz);
  }

  // One perception tick: can this bot see the enemy? FOV, range, smoke and walls all count.
  function canSee(agent, enemy, now, ctx) {
    const dx = enemy.position.x - agent.position.x;
    const dy = (enemy.position.y + 1.4) - (agent.position.y + 1.5);
    const dz = enemy.position.z - agent.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 58) return false;
    const angle = Math.atan2(-dx, -dz);
    let diff = angle - agent.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 1.15) return false;
    if (ctx.inSmoke(agent.position, enemy.position)) return false;
    return ctx.lineOfSight(agent.position, enemy.position);
  }

  function pickObjective(agent, now, ctx) {
    const wp = world.waypoints;
    if (agent.team === 'vanguard') {
      if (ctx.bombPlanted) {
        agent.state = 'hold';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.siteNode(ctx.plantSite));
      } else if (agent.hasBomb) {
        agent.state = 'rush';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.siteNode(agent.targetSite));
      } else if (agent.lastHeardAt > now - 4 && agent.lastHeard) {
        agent.state = 'rotate';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.nearest(agent.lastHeard.x, agent.lastHeard.z));
      } else if (agent.lastSeenAt > now - 5 && agent.lastSeen) {
        agent.state = 'rotate';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.nearest(agent.lastSeen.x, agent.lastSeen.z));
      } else if (random() < 0.45) {
        agent.state = 'hold';
        const hold = [wp.holdNode('vanguard'), 3, 15, 16][Math.floor(random() * 4)];
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), hold);
        agent.holdUntil = now + 4 + random() * 5;
      } else {
        agent.state = 'rush';
        agent.targetSite = random() < 0.5 ? 'A' : 'B';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.siteNode(agent.targetSite));
      }
    } else {
      if (ctx.bombPlanted) {
        agent.state = 'defuse';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.siteNode(ctx.plantSite));
      } else if (agent.lastHeardAt > now - 4 && agent.lastHeard) {
        agent.state = 'rotate';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.nearest(agent.lastHeard.x, agent.lastHeard.z));
      } else if (agent.lastSeenAt > now - 5 && agent.lastSeen) {
        agent.state = 'rotate';
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), wp.nearest(agent.lastSeen.x, agent.lastSeen.z));
      } else {
        agent.state = 'hold';
        const hold = [17, 19, 20, 9, 14][Math.floor(random() * 5)];
        agent.path = wp.route(wp.nearest(agent.position.x, agent.position.z), hold);
        agent.holdUntil = now + 6 + random() * 6;
      }
    }
    agent.pathIndex = 0;
  }

  function stepAgent(agent, dt, now, ctx) {
    if (!agent.alive) {
      agent.fall = Math.min(1, agent.fall + dt / 0.4);
      agent.body.group.rotation.x = -agent.fall * 1.45;
      return;
    }
    agent.cooldown = Math.max(0, agent.cooldown - dt);
    const blind = now < agent.blindUntil;

    // Perception, staggered so nine bots never raycast on the same tick.
    if (now >= agent.thinkAt) {
      agent.thinkAt = now + 0.15 + random() * 0.05;
      agent.visibleEnemy = null;
      if (!blind) {
        for (const enemy of ctx.enemiesOf(agent)) {
          if (!enemy.alive) continue;
          if (canSee(agent, enemy, now, ctx)) {
            agent.visibleEnemy = enemy;
            agent.lastSeen = { x: enemy.position.x, z: enemy.position.z };
            agent.lastSeenAt = now;
            if (agent.reactAt === 0) agent.reactAt = now + agent.skill.reaction;
            break;
          }
        }
      }
      if (!agent.visibleEnemy && agent.state !== 'planting' && agent.state !== 'defusing') {
        if (agent.pathIndex >= agent.path.length) {
          if (agent.state === 'hold' && now < agent.holdUntil) {
            // Hold the angle: scan slowly.
            agent.yaw += dt * 0.25 * (Math.sin(now * 0.4 + agent.id.length) > 0 ? 1 : -1);
          } else {
            pickObjective(agent, now, ctx);
          }
        }
      }
      // Outnumbered and hurt: fall back toward spawn.
      const friends = ctx.aliveCount(agent.team);
      const foes = ctx.aliveCount(agent.team === 'vanguard' ? 'jackal' : 'vanguard');
      if (friends < foes && agent.health < 45 && agent.state !== 'planting' && agent.state !== 'defusing') {
        agent.state = 'retreat';
        agent.path = world.waypoints.route(
          world.waypoints.nearest(agent.position.x, agent.position.z),
          agent.team === 'vanguard' ? 0 : 17,
        );
        agent.pathIndex = 0;
      }
    }

    // Planting and defusing are channels: stand still on the objective.
    if (agent.hasBomb && !ctx.bombPlanted && agent.team === 'vanguard') {
      const site = world.sites[agent.targetSite];
      const d = Math.hypot(agent.position.x - site.center.x, agent.position.z - site.center.z);
      if (d < site.radius && !agent.visibleEnemy) {
        agent.state = 'planting';
        agent.channel += dt;
        if (agent.channel >= 3) {
          agent.channel = 0;
          ctx.onPlanted(agent);
        }
        agent.body.group.rotation.y = agent.yaw;
        return;
      }
      agent.channel = 0;
    }
    if (ctx.bombPlanted && agent.team === 'jackal') {
      const d = Math.hypot(agent.position.x - ctx.bombPosition.x, agent.position.z - ctx.bombPosition.z);
      if (d < 1.6 && !agent.visibleEnemy) {
        agent.state = 'defusing';
        agent.channel += dt;
        if (agent.channel >= 5) {
          agent.channel = 0;
          ctx.onDefused(agent);
        }
        agent.body.group.rotation.y = agent.yaw;
        return;
      }
      agent.channel = 0;
    }

    // Combat: face the enemy, wait out the reaction time, fire in bursts.
    const enemy = agent.visibleEnemy;
    if (enemy && enemy.alive && !blind) {
      faceToward(agent, enemy.position.x, enemy.position.z);
      if (now >= agent.reactAt && agent.cooldown === 0 && agent.reloadLeft === 0) {
        if (agent.burstLeft <= 0) {
          if (agent.burstPause > 0) {
            agent.burstPause -= dt;
          } else {
            agent.burstLeft = agent.skill.burst;
            agent.burstPause = 0.5 + random() * 0.7;
          }
        }
        if (agent.burstLeft > 0) {
          if (agent.mag <= 0) {
            agent.reloadLeft = agent.weapon.reload;
          } else {
            agent.mag -= 1;
            agent.burstLeft -= 1;
            agent.cooldown = agent.weapon.gap;
            const pellets = agent.weapon.pellets ?? 1;
            for (let p = 0; p < pellets; p += 1) ctx.shootBot(agent, enemy);
          }
        }
      }
      agent.velocity.x *= 0.8;
      agent.velocity.z *= 0.8;
    } else if (agent.pathIndex < agent.path.length) {
      const node = world.waypoints.nodes[agent.path[agent.pathIndex]];
      const dx = node[0] - agent.position.x;
      const dz = node[1] - agent.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.9) {
        agent.pathIndex += 1;
      } else {
        const speed = agent.skill.speed * (agent.state === 'retreat' ? 1.15 : 1);
        agent.velocity.x = (dx / dist) * speed;
        agent.velocity.z = (dz / dist) * speed;
        faceToward(agent, node[0], node[1]);
        agent.velocity.y -= 20 * dt;
        agent.position.y += agent.velocity.y * dt;
        if (agent.position.y < 0) {
          agent.position.y = 0;
          agent.velocity.y = 0;
        }
        moveBody(agent.position, agent.velocity, 1.72, overlaps, dt);
      }
    } else {
      agent.velocity.x *= 0.8;
      agent.velocity.z *= 0.8;
    }

    if (agent.reloadLeft > 0) {
      agent.reloadLeft = Math.max(0, agent.reloadLeft - dt);
      if (agent.reloadLeft === 0) {
        const need = agent.weapon.mag - agent.mag;
        const take = Math.min(need, agent.reserve);
        agent.mag += take;
        agent.reserve -= take;
      }
    }

    agent.body.group.position.copy(agent.position);
    agent.body.group.rotation.y = agent.yaw;
    agent.body.group.rotation.x = 0;
  }

  return {
    agents,
    hitMeshes,
    createAll,
    reset,
    step(dt, now, ctx) {
      for (const agent of agents) stepAgent(agent, dt, now, ctx);
    },
    aliveCount(team) {
      return agents.filter((a) => a.team === team && a.alive).length;
    },
    byId(id) {
      return agents.find((a) => a.id === id);
    },
  };
}
