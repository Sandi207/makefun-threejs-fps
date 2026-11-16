// The match: rounds, economy, the bomb and the scoreboard. One object owns the state
// every system reads — main.js steps it, hud.js renders it, bots.js asks it what to do.
// First to 5 round wins takes the match; a round ends on elimination, detonation or a
// defuse, and the 100 s clock running out hands the round to the Jackals.
import { WEAPONS, GEAR, START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, LOSS_STREAK_BONUS } from './weapons.js';

export const ROUND_TIME = 100;
export const BUY_TIME = 14;
export const BOMB_TIME = 35;
export const WIN_SCORE = 5;

export function createMatch(random) {
  const state = {
    phase: 'buy', // buy | live | roundEnd | matchEnd
    round: 1,
    score: { vanguard: 0, jackal: 0 },
    timer: BUY_TIME,
    bombPlanted: false,
    plantSite: null,
    bombPosition: null,
    bombTimer: 0,
    bombCarrier: null,
    money: START_MONEY,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    roundWinner: null,
    roundReason: '',
    banner: '',
    matchWinner: null,
    feed: [],
    player: null,
  };

  function pushFeed(text) {
    state.feed.unshift({ text, at: performance.now() });
    if (state.feed.length > 6) state.feed.pop();
  }

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_TIME;
    state.bombPlanted = false;
    state.plantSite = null;
    state.bombPosition = null;
    state.bombTimer = 0;
    state.roundWinner = null;
    state.roundReason = '';
    state.banner = `ROUND ${state.round} — ${state.round === 1 ? 'Vanguard attacks. Plant the device.' : 'Buy up, then take a site.'}`;
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.phase = 'roundEnd';
    state.timer = 5;
    if (winner === 'vanguard') {
      state.score.vanguard += 1;
      state.money += WIN_REWARD;
      state.lossStreak = 0;
      state.banner = `VANGUARD WINS THE ROUND — ${reason}`;
    } else {
      state.score.jackal += 1;
      state.money += LOSS_REWARD + Math.min(2, state.lossStreak) * LOSS_STREAK_BONUS;
      state.lossStreak += 1;
      state.banner = `JACKALS WIN THE ROUND — ${reason}`;
    }
    pushFeed(state.banner);
    if (state.score.vanguard >= WIN_SCORE || state.score.jackal >= WIN_SCORE) {
      state.matchWinner = state.score.vanguard >= WIN_SCORE ? 'vanguard' : 'jackal';
      state.phase = 'matchEnd';
      state.banner = state.matchWinner === 'vanguard'
        ? 'VANGUARD TAKES THE MATCH — Meridian Yards is yours.'
        : 'JACKALS TAKE THE MATCH — the yard holds. Play again?';
    }
  }

  function step(dt, counts) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_TIME;
        state.banner = 'GO — take a site';
        pushFeed('Round live — good luck');
      }
      return;
    }
    if (state.phase === 'live') {
      state.timer -= dt;
      if (state.bombPlanted) {
        state.bombTimer -= dt;
        if (state.bombTimer <= 0) {
          endRound('vanguard', 'device detonated');
          return;
        }
      }
      if (state.timer <= 0) {
        endRound(state.bombPlanted ? 'vanguard' : 'jackal', state.bombPlanted ? 'time expired after the plant' : 'time expired');
        return;
      }
      if (counts.vanguard === 0 && counts.jackal > 0) {
        endRound('jackal', 'Vanguard eliminated');
      } else if (counts.jackal === 0 && counts.vanguard > 0) {
        endRound('vanguard', 'Jackals eliminated');
      } else if (counts.vanguard === 0 && counts.jackal === 0) {
        endRound('jackal', 'both teams down');
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0 && state.phase === 'roundEnd') {
        state.round += 1;
        startRound();
      }
    }
  }

  function onKill(killer, victim) {
    if (killer && killer.isPlayer) {
      state.money += KILL_REWARD;
      state.kills += 1;
      pushFeed(`You eliminated ${victim.name}  +$${KILL_REWARD}`);
    } else if (victim && victim.isPlayer) {
      state.deaths += 1;
      pushFeed(`${killer ? killer.name : 'The yard'} eliminated you`);
    } else if (killer && victim) {
      pushFeed(`${killer.name} eliminated ${victim.name}`);
    }
  }

  function onPlanted(agent) {
    state.bombPlanted = true;
    state.plantSite = agent.targetSite;
    state.bombPosition = { x: agent.position.x, z: agent.position.z };
    state.bombTimer = BOMB_TIME;
    state.banner = `DEVICE PLANTED AT SITE ${state.plantSite} — ${BOMB_TIME}s`;
    pushFeed(state.banner);
  }

  function onDefused(agent) {
    state.bombPlanted = false;
    endRound('jackal', `defused by ${agent.name}`);
  }

  function buy(itemId) {
    const item = WEAPONS[itemId] ?? GEAR[itemId];
    if (!item) return { ok: false, reason: 'unknown item' };
    if (state.money < item.price) return { ok: false, reason: 'not enough money' };
    if (state.phase !== 'buy') return { ok: false, reason: 'buy phase is over' };
    state.money -= item.price;
    return { ok: true, item };
  }

  return {
    state,
    startRound,
    endRound,
    step,
    onKill,
    onPlanted,
    onDefused,
    buy,
    pushFeed,
    reset() {
      state.round = 1;
      state.score.vanguard = 0;
      state.score.jackal = 0;
      state.money = START_MONEY;
      state.lossStreak = 0;
      state.kills = 0;
      state.deaths = 0;
      state.matchWinner = null;
      state.feed = [];
      startRound();
    },
  };
}
