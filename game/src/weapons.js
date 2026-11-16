// The arsenal: five original guns, kevlar and two grenades. Each weapon owns its
// numbers — damage, fire rate, magazine, price, spread and recoil — and its view model.
// main.js owns the ray and the damage; game.js owns the money.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// name, price, damage (torso), head multiplier, fire gap, mag, reserve, reload time,
// spread still / moving, recoil pitch, automatic, range.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', price: 0, damage: 34, headMult: 4, gap: 0.16,
    mag: 12, reserve: 48, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02,
    recoil: 0.011, auto: false, range: 60, slot: 2, tracer: '#ffd27a',
  },
  fang: {
    id: 'fang', name: 'FANG-9 SMG', price: 1500, damage: 26, headMult: 4, gap: 0.075,
    mag: 32, reserve: 96, reload: 2.1, spreadStill: 0.006, spreadMove: 0.034,
    recoil: 0.008, auto: true, range: 55, slot: 1, tracer: '#ffd27a',
  },
  longbow: {
    id: 'longbow', name: 'LONGBOW Rifle', price: 2700, damage: 40, headMult: 4, gap: 0.1,
    mag: 25, reserve: 75, reload: 2.4, spreadStill: 0.0016, spreadMove: 0.026,
    recoil: 0.014, auto: true, range: 90, slot: 1, tracer: '#ffd27a',
  },
  jackhammer: {
    id: 'jackhammer', name: 'JACKHAMMER Shotgun', price: 1700, damage: 14, headMult: 3, gap: 0.85,
    mag: 6, reserve: 24, reload: 2.8, spreadStill: 0.03, spreadMove: 0.05,
    recoil: 0.05, auto: false, range: 26, pellets: 8, slot: 1, tracer: '#ffb45e',
  },
  needle: {
    id: 'needle', name: 'NEEDLE Sniper', price: 4750, damage: 110, headMult: 4, gap: 1.15,
    mag: 5, reserve: 15, reload: 3.2, spreadStill: 0.0008, spreadMove: 0.05,
    recoil: 0.06, auto: false, range: 120, slot: 1, tracer: '#9fd0ff',
  },
};

export const GEAR = {
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 650, desc: 'Halves damage taken' },
  flash: { id: 'flash', name: 'Flashbang', price: 200, desc: 'Blinds anyone looking at it' },
  smoke: { id: 'smoke', name: 'Smoke Canister', price: 300, desc: 'Blocks sight for 12 s' },
};

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.25 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  const long = def.id === 'needle' || def.id === 'longbow';
  const wide = def.id === 'jackhammer';
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(wide ? 0.11 : 0.09, 0.1, long ? 0.5 : 0.4), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, long ? 0.55 : 0.36), grip);
  barrel.position.set(0, 0.025, long ? -0.5 : -0.36);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), accent);
  sight.position.set(0, 0.075, -0.05);
  model.add(receiver, barrel, stock, sight);
  if (def.id === 'needle') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.05);
    model.add(scope);
  }
  if (def.id === 'jackhammer') {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.2), accent);
    pump.position.set(0, -0.02, -0.28);
    model.add(pump);
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createWeaponRig(camera) {
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let model = null;
  const state = {
    def: WEAPONS.longbow, mag: WEAPONS.longbow.mag, reserve: WEAPONS.longbow.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, reloadTotal: 0,
  };

  function equip(def) {
    if (model) {
      camera.remove(model);
      model = null;
    }
    model = buildViewModel(def);
    camera.add(model);
    state.def = def;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (model) {
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      if (state.reloadLeft > 0) {
        model.rotation.x = -0.55 * Math.min(1, (state.reloadTotal - state.reloadLeft) * 2);
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.gap;
      state.flash = 0.06;
      state.kick = state.def.id === 'needle' ? 0.11 : state.def.id === 'jackhammer' ? 0.1 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reload;
      state.reloadTotal = state.def.reload;
      return true;
    },
    refill(def) {
      equip(def);
    },
    spread(speed, ads, crouching, airborne) {
      let spread = state.def.spreadStill + Math.min(1, speed / 5.4) * state.def.spreadMove;
      if (ads) spread *= 0.45;
      if (crouching) spread *= 0.75;
      if (airborne) spread *= 2.2;
      return spread;
    },
  };
}
