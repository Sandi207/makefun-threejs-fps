// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, alive counts, kill
// feed, damage direction, buy menu, round banners, scoreboard and the 2D minimap. It
// never touches the simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GEAR } from './weapons.js';

const COPY = {
  start: {
    title: 'SIEGE LINE',
    copy: 'Meridian Yards — a container yard at dusk. Vanguard attacks, Jackals hold the sites. Plant the device at A or B, or eliminate the other team. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'SIEGE LINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthValue = $('health-value');
  const healthBar = $('health-bar');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundValue = $('round-value');
  const scoreV = $('score-v');
  const scoreJ = $('score-j');
  const aliveV = $('alive-v');
  const aliveJ = $('alive-j');
  const feedEl = $('killfeed');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const damageEl = $('damage');
  const flashEl = $('flash');
  const buyEl = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const scoreboardEl = $('scoreboard');
  const scoreboardBody = $('scoreboard-body');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  const bombEl = $('bomb-timer');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastFeedKey = '';
  let buyHandler = null;
  let playHandler = null;

  // The buy menu is built once from the arsenal; rows are buttons the player clicks.
  const buyItems = [];
  for (const def of Object.values(WEAPONS)) {
    if (def.id === 'p9') continue;
    buyItems.push({ id: def.id, name: def.name, price: def.price, desc: `${def.damage} dmg · ${def.mag} rnd mag · ${def.auto ? 'auto' : 'semi'}` });
  }
  buyItems.push(
    { id: 'kevlar', name: GEAR.kevlar.name, price: GEAR.kevlar.price, desc: GEAR.kevlar.desc },
    { id: 'flash', name: GEAR.flash.name, price: GEAR.flash.price, desc: GEAR.flash.desc },
    { id: 'smoke', name: GEAR.smoke.name, price: GEAR.smoke.price, desc: GEAR.smoke.desc },
  );
  for (const item of buyItems) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.item = item.id;
    row.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => {
      if (buyHandler) buyHandler(item.id, row);
    });
    buyList.appendChild(row);
  }

  function setText(el, value) {
    const text = String(value);
    if (el.textContent !== text) el.textContent = text;
  }

  return {
    setHealth(hp, armor) {
      setText(healthValue, Math.max(0, Math.ceil(hp)));
      setText(armorValue, Math.max(0, Math.ceil(armor)));
      healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      healthBar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, mag);
      setText(ammoReserve, `/ ${reserve}`);
      setText(weaponName, name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyValue, `$${value}`);
      setText(buyMoney, `$${value}`);
    },
    setScore(v, j) {
      setText(scoreV, v);
      setText(scoreJ, j);
    },
    setRound(n) {
      setText(roundValue, `ROUND ${n}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timerValue.classList.toggle('buy-phase', phase === 'buy');
    },
    setAlive(v, j) {
      setText(aliveV, `${v} alive`);
      setText(aliveJ, `${j} alive`);
    },
    setBombTimer(seconds) {
      if (seconds == null) {
        bombEl.hidden = true;
        return;
      }
      bombEl.hidden = false;
      setText(bombEl, `DEVICE ${seconds.toFixed(0)}s`);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFrom(angle) {
      damageEl.style.setProperty('--dir', `${angle}deg`);
      damageEl.classList.remove('show');
      void damageEl.offsetWidth;
      damageEl.classList.add('show');
    },
    flashWhite(ms = 900) {
      flashEl.style.transition = 'none';
      flashEl.style.opacity = '1';
      requestAnimationFrame(() => {
        flashEl.style.transition = `opacity ${ms}ms linear`;
        flashEl.style.opacity = '0';
      });
    },
    banner(text, sub = '', ms = 2600) {
      setText(bannerTitle, text);
      setText(bannerSub, sub);
      bannerEl.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), ms);
    },
    moveBanner(top) {
      bannerEl.style.top = top;
    },
    killfeed(feed) {
      const key = feed.map((f) => f.text).join('|');
      if (key === lastFeedKey) return;
      lastFeedKey = key;
      feedEl.innerHTML = '';
      for (const entry of feed.slice(0, 5)) {
        const div = document.createElement('div');
        div.textContent = entry.text;
        feedEl.appendChild(div);
      }
    },
    showBuy(open, money) {
      buyEl.hidden = !open;
      setText(buyMoney, `$${money}`);
      if (open) {
        const first = buyList.querySelector('.buy-row');
        if (first) first.focus();
      }
    },
    markBought(row, ok) {
      row.classList.remove('bought', 'denied');
      void row.offsetWidth;
      row.classList.add(ok ? 'bought' : 'denied');
    },
    showScoreboard(show, rows) {
      scoreboardEl.hidden = !show;
      if (!show) return;
      scoreboardBody.innerHTML = '';
      for (const row of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="${row.team}">${row.name}</td><td>${row.kills}</td><td>${row.deaths}</td><td>${row.alive ? '●' : '✕'}</td><td>$${row.money}</td>`;
        scoreboardBody.appendChild(tr);
      }
    },
    drawMinimap(player, agents, sites, spotted, bomb) {
      const w = minimap.width;
      const h = minimap.height;
      const sx = w / 64;
      const sy = h / 48;
      const X = (x) => (x + 32) * sx;
      const Y = (z) => (z + 24) * sy;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(20, 22, 26, 0.82)';
      mapCtx.fillRect(0, 0, w, h);
      // Site zones.
      for (const site of Object.values(sites)) {
        mapCtx.fillStyle = site.id === 'A' ? 'rgba(55, 201, 120, 0.3)' : 'rgba(242, 167, 27, 0.3)';
        mapCtx.beginPath();
        mapCtx.arc(X(site.center.x), Y(site.center.z), site.radius * sx, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.fillStyle = '#e8e4d8';
        mapCtx.font = 'bold 11px system-ui, sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.fillText(site.id, X(site.center.x), Y(site.center.z) + 4);
      }
      // Teammates blue, spotted enemies red, the player a white arrow.
      for (const agent of agents) {
        if (!agent.alive) continue;
        const isFriend = agent.team === 'vanguard';
        const seen = isFriend || spotted.has(agent.id);
        if (!seen) continue;
        mapCtx.fillStyle = isFriend ? '#4da3ff' : '#ff5a3c';
        mapCtx.beginPath();
        mapCtx.arc(X(agent.position.x), Y(agent.position.z), agent.hasBomb ? 5 : 3.5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      if (bomb) {
        mapCtx.fillStyle = '#ff5a3c';
        mapCtx.font = 'bold 12px system-ui, sans-serif';
        mapCtx.fillText('◉', X(bomb.x), Y(bomb.z));
      }
      mapCtx.save();
      mapCtx.translate(X(player.position.x), Y(player.position.z));
      mapCtx.rotate(-player.yaw);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4.5, 5);
      mapCtx.lineTo(-4.5, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end'
        ? `${data.winner === 'vanguard' ? 'Vanguard takes Meridian Yards.' : 'Jackals hold Meridian Yards.'} Final score ${data.scoreV}–${data.scoreJ}. You had ${data.kills} eliminations.`
        : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playHandler = handler;
      play.addEventListener('click', () => playHandler());
    },
    onBuy(handler) {
      buyHandler = handler;
    },
  };
}
