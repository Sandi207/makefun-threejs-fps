// Procedural canvas textures: every surface in Meridian Yards is drawn in code, so the
// game ships no image assets and makes no network request. Each texture is a small
// canvas turned into a THREE.CanvasTexture with repeat wrapping.
import * as THREE from 'three';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx, size, count, colors, alpha) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    const w = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * size, Math.random() * size, w, w);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  // Weathered concrete: grey base, darker blotches, hairline cracks.
  const concrete = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#484b51';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ['#3a3d42', '#55585e', '#63666c'], 0.5);
    ctx.strokeStyle = 'rgba(20, 21, 24, 0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      let x = Math.random() * s;
      let y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j += 1) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, 8, 6);

  // Corrugated steel: vertical ribs with rust streaks, for containers and the warehouse.
  const steel = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#4a525e';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, 0, 3, s);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 8, 0, 4, s);
    }
    speckle(ctx, s, 500, ['#6b4a2f', '#7a5a35', '#3c4148'], 0.45);
    ctx.fillStyle = 'rgba(122, 74, 47, 0.25)';
    for (let i = 0; i < 12; i += 1) {
      const x = Math.random() * s;
      ctx.fillRect(x, Math.random() * s * 0.4, 2 + Math.random() * 3, 40 + Math.random() * 90);
    }
  }, 3, 1);

  // Asphalt yard: near-black with painted lane dashes and tyre wear.
  const asphalt = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#313438';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 1400, ['#26292d', '#3d4046', '#484b51'], 0.5);
    ctx.fillStyle = 'rgba(242, 167, 27, 0.75)';
    ctx.fillRect(s * 0.46, 0, 10, s * 0.28);
    ctx.fillRect(s * 0.46, s * 0.62, 10, s * 0.28);
    ctx.fillStyle = 'rgba(232, 228, 216, 0.28)';
    ctx.fillRect(0, s * 0.48, s, 3);
  }, 10, 8);

  // Hazard stripes: diagonal amber and charcoal, for site borders and door frames.
  const hazard = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#1c1e21';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#f2a71b';
    for (let x = -s; x < s * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  }, 4, 1);

  // Crate wood: planks with grain lines and nail dots.
  const crate = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#6d5636';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      ctx.fillStyle = y % 84 === 0 ? '#755e3c' : '#675431';
      ctx.fillRect(0, y, s, 40);
      ctx.strokeStyle = 'rgba(30, 20, 10, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30, 20, 10, 0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i += 1) {
        const gy = y + 6 + Math.random() * 30;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(s * 0.3, gy + 3, s * 0.6, gy - 3, s, gy);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(20, 14, 8, 0.8)';
    for (const [nx, ny] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) {
      ctx.beginPath();
      ctx.arc(nx, ny, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return { concrete, steel, asphalt, hazard, crate };
}
