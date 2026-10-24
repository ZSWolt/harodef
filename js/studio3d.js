// The 3D TV studio behind the HTML UI: board tower, podiums, player pieces, lights and camera.
// The HTML layer owns text and input; this module owns everything drawn in WebGL.
import * as THREE from 'three';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const W = 1920;
const H = 1080;

const COLOR = {
  red: new THREE.Color('#ff2f3d'),
  blue: new THREE.Color('#2e86ff'),
  gold: new THREE.Color('#ffc33d'),
  idle: new THREE.Color('#1b2c78'),
  black: new THREE.Color('#000000'),
  white: new THREE.Color('#ffffff'),
};

const BOARD = { z: -3.4, w: 4.4, h: 0.86, gap: 0.16, d: 0.42, base: 1.1 };
const slabY = (n) => BOARD.base + (8 - n) * (BOARD.h + BOARD.gap) + BOARD.h / 2;
const BOARD_TOP = slabY(1) + BOARD.h / 2;
const PODIUM = {
  chaser: new THREE.Vector3(-7.4, 2.2, -1.4),
  player: new THREE.Vector3(7.2, 0.5, 0.2),
};

// Camera shots. offset shifts the subject left (as a fraction of the width) to make room for HTML panels on the right.
const SHOTS = {
  home: { pos: [0, 6.5, 21], look: [0, 4.4, -2], offset: 0.2, orbit: true },
  lobby: { pos: [0, 7.4, 24], look: [0, 1.6, 0], offset: 0.16, orbit: true },
  draw: { pos: [0, 6, 19], look: [0, 4, -2], offset: 0 },
  chaser: { pos: [-3.8, 5.6, 7.2], look: [-7.4, 3.4, -1.4], offset: 0 },
  player: { pos: [4.4, 3.4, 9.6], look: [7.2, 1.1, 0.2], offset: 0.13 },
  out: { pos: [4.6, 3.6, 10.2], look: [7.2, 2.2, 0.2], offset: 0 },
  board: { pos: [-1.6, 5.4, 17.5], look: [0, 4.9, BOARD.z], offset: 0.23 },
  winPlayer: { pos: [4.2, 3.6, 9.4], look: [7.2, 2.5, 0.2], offset: 0.25 },
  winChaser: { pos: [-3.8, 5.4, 7.6], look: [-7.4, 3.8, -1.4], offset: 0.25 },
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

function drawText(ctx, text, x, y, { size = 64, weight = 800, color = '#fff', align = 'center', glow = null } = {}) {
  ctx.font = `${weight} ${size}px Rubik, "Noto Sans Hebrew", Arial, sans-serif`;
  // Pure numbers like "+10" must stay left-to-right.
  ctx.direction = /[\u0590-\u05FF]/.test(text) ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = glow ?? 'transparent';
  ctx.shadowBlur = glow ? size * 0.5 : 0;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function fitName(name, max = 12) {
  const s = String(name ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export async function createStudio(canvas) {
  try {
    await Promise.race([document.fonts?.load('800 64px Rubik'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    // Labels fall back to a system font.
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor('#04060e');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#04060e', 24, 48);
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.5, 90);
  const clock = new THREE.Clock();

  // ---------- tiny tween manager (one owner per property) ----------
  const tweens = new Set();
  function tween(duration, update) {
    const job = { t0: clock.elapsedTime, duration: reduceMotion ? 0.001 : duration, update };
    for (const other of tweens) if (other.key && other.key === update.key) tweens.delete(other);
    job.key = update.key;
    tweens.add(job);
  }

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#6f80ff', '#0a0c18', 0.55));
  function spot(color, intensity, pos, target) {
    const l = new THREE.SpotLight(color, intensity, 40, 0.42, 0.65, 0);
    l.position.copy(pos);
    l.target.position.copy(target);
    scene.add(l, l.target);
    return l;
  }
  const boardKey = spot('#cfd8ff', 3.2, new THREE.Vector3(0, 15, 9), new THREE.Vector3(0, 4.5, BOARD.z));
  const chaserSpot = spot('#ff3b46', 0, new THREE.Vector3(-6, 15, 4), PODIUM.chaser);
  const playerSpot = spot('#5aa2ff', 0, new THREE.Vector3(6, 15, 6), PODIUM.player);
  const fill = new THREE.DirectionalLight('#8796ff', 0.6);
  fill.position.set(-4, 8, 14);
  const front = new THREE.DirectionalLight('#ffffff', 1.1);
  front.position.set(2, 7, 22);
  scene.add(fill, front);

  // Visible light beams: additive cones that fade toward the floor.
  const beamMat = (color, opacity) =>
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float a = pow(vUv.y, 1.6) * uOpacity; gl_FragColor = vec4(uColor * a, a); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  const coneGeo = new THREE.ConeGeometry(1, 1, 40, 1, true);
  coneGeo.translate(0, -0.5, 0);
  function beam(from, to, radius, color, opacity) {
    const mesh = new THREE.Mesh(coneGeo, beamMat(color, opacity));
    const dir = new THREE.Vector3().subVectors(to, from);
    mesh.position.copy(from);
    mesh.scale.set(radius, dir.length(), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    mesh.renderOrder = 5;
    scene.add(mesh);
    return mesh;
  }
  const beams = {
    board: beam(new THREE.Vector3(0, 16, 6), new THREE.Vector3(0, 0, BOARD.z + 1.5), 3.6, '#9fb4ff', 0.16),
    chaser: beam(new THREE.Vector3(-6, 16, 4), new THREE.Vector3(-7.4, 0, -1.4), 2.4, '#ff3040', 0),
    player: beam(new THREE.Vector3(6, 16, 6), new THREE.Vector3(7.2, 0, 0.2), 2.2, '#3e8ef7', 0),
    side1: beam(new THREE.Vector3(-14, 15, -8), new THREE.Vector3(-5, 0, 2), 2.8, '#6a4dff', 0.07),
    side2: beam(new THREE.Vector3(14, 15, -8), new THREE.Vector3(5, 0, 2), 2.8, '#6a4dff', 0.07),
  };

  // ---------- floor ----------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(20, 96),
    new THREE.MeshStandardMaterial({ color: '#070a18', roughness: 0.28, metalness: 0.75 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ringMats = [];
  for (const [r, w, c] of [[3.4, 0.08, '#2e6bff'], [6.2, 0.05, '#4b3dff'], [10.4, 0.06, '#2e6bff'], [14.5, 0.04, '#4b3dff']]) {
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 128), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
    ringMats.push(mat);
  }
  // A split red/blue glow pool under the board, like the show's lighting.
  {
    const { canvas: c, ctx, tex } = canvasTexture(512, 512);
    const g = ctx.createRadialGradient(256, 256, 10, 256, 256, 256);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    void c;
    for (const [x, color] of [[-3.2, '#ff2f3d'], [3.2, '#2e86ff']]) {
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 9),
        new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.02, BOARD.z + 1);
      scene.add(pool);
    }
  }

  // ---------- LED wall ----------
  const LEDS = 64;
  const led = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 11, 0.2), new THREE.MeshBasicMaterial({ color: '#ffffff' }), LEDS);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < LEDS; i++) {
    const a = THREE.MathUtils.degToRad(195 + (150 * i) / (LEDS - 1));
    dummy.position.set(Math.cos(a) * 21, 5.5, Math.sin(a) * 21);
    dummy.lookAt(0, 5.5, 0);
    dummy.updateMatrix();
    led.setMatrixAt(i, dummy.matrix);
    led.setColorAt(i, COLOR.idle);
  }
  scene.add(led);
  const ledColor = new THREE.Color();
  let ledMode = 'idle';

  // ---------- the board tower ----------
  const board = new THREE.Group();
  board.position.z = BOARD.z;
  scene.add(board);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#10142a', roughness: 0.35, metalness: 0.8 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#3e7bff' });
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + 1.6, BOARD.base - 0.1, BOARD.d + 1.4), frameMat);
  pedestal.position.y = (BOARD.base - 0.1) / 2;
  board.add(pedestal);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, BOARD_TOP - BOARD.base + 1.6, BOARD.d + 0.5), frameMat);
    pillar.position.set(side * (BOARD.w / 2 + 0.35), (BOARD_TOP + BOARD.base + 1.6) / 2, 0);
    board.add(pillar);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, BOARD_TOP - BOARD.base + 1.6, 0.06), edgeMat);
    strip.position.set(side * (BOARD.w / 2 + 0.17), pillar.position.y, BOARD.d / 2 + 0.26);
    board.add(strip);
  }
  // Header plate with the show name.
  const header = canvasTexture(1024, 256);
  {
    const { ctx } = header;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1a1f3d');
    g.addColorStop(1, '#0a0d1e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#ffc33d';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 1008, 240);
    drawText(ctx, 'הרודף', 512, 120, { size: 150, weight: 900, color: '#ffffff', glow: '#ff2f3d' });
  }
  header.tex.needsUpdate = true;
  const headerPlate = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w + 1.05, (BOARD.w + 1.05) / 4), new THREE.MeshBasicMaterial({ map: header.tex }));
  headerPlate.position.set(0, BOARD_TOP + 1.0, BOARD.d / 2 + 0.26);
  board.add(headerPlate);

  const slabGeo = new THREE.BoxGeometry(BOARD.w, BOARD.h, BOARD.d);
  const slabs = [];
  for (let n = 1; n <= 8; n++) {
    const mat = new THREE.MeshStandardMaterial({ color: '#0a0f25', roughness: 0.2, metalness: 0.3, emissive: COLOR.idle.clone(), emissiveIntensity: 1 });
    const mesh = new THREE.Mesh(slabGeo, mat);
    mesh.position.y = slabY(n);
    board.add(mesh);
    const face = canvasTexture(1024, 200);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD.w * 0.98, BOARD.h * 0.92),
      new THREE.MeshBasicMaterial({ map: face.tex, transparent: true, depthWrite: false }),
    );
    label.position.set(0, slabY(n), BOARD.d / 2 + 0.012);
    board.add(label);
    slabs.push({ n, mat, face, target: COLOR.idle.clone(), level: 0.35, targetLevel: 0.35, flash: 0, text: null });
  }

  function drawSlab(s, text) {
    if (s.text === text) return;
    s.text = text;
    const { ctx, tex } = s.face;
    ctx.clearRect(0, 0, 1024, 200);
    drawText(ctx, String(s.n), 980, 100, { size: 64, weight: 700, color: 'rgba(255,255,255,0.55)', align: 'right' });
    if (text) drawText(ctx, text, 512, 104, { size: 110, weight: 900, color: '#ffffff', glow: 'rgba(0,0,0,0.6)' });
    tex.needsUpdate = true;
  }

  // ---------- podiums ----------
  function podium(pos, accent, platformH) {
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, platformH, 48), frameMat);
    base.position.y = platformH / 2;
    g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: accent }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = platformH;
    g.add(ring);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.15, 0.8), frameMat);
    desk.position.set(0, platformH + 0.57, 1.25);
    g.add(desk);
    const screen = canvasTexture(1024, 480);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.03), new THREE.MeshBasicMaterial({ map: screen.tex }));
    face.position.set(0, platformH + 0.57, 1.66);
    g.add(face);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.06, 0.86), new THREE.MeshBasicMaterial({ color: accent }));
    trim.position.set(0, platformH + 1.15, 1.25);
    g.add(trim);
    // Face the front of the studio.
    g.lookAt(pos.x * 0.35, 0, 14);
    scene.add(g);
    return { group: g, screen, ring, text: null };
  }
  const chaserPodium = podium(PODIUM.chaser, '#ff2f3d', PODIUM.chaser.y);
  const playerPodium = podium(PODIUM.player, '#2e86ff', PODIUM.player.y);

  function drawScreen(p, title, value, accent) {
    const key = `${title}|${value}|${accent}`;
    if (p.text === key) return;
    p.text = key;
    const { ctx, tex } = p.screen;
    const g = ctx.createLinearGradient(0, 0, 0, 480);
    g.addColorStop(0, '#0b1230');
    g.addColorStop(1, '#050816');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 480);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 1024, 14);
    drawText(ctx, fitName(title, 14), 512, 150, { size: 104, weight: 800, color: '#ffffff' });
    if (value !== '') drawText(ctx, value, 512, 330, { size: 150, weight: 900, color: accent, glow: accent });
    tex.needsUpdate = true;
  }
  drawScreen(chaserPodium, 'הרודף', '', '#ff2f3d');
  drawScreen(playerPodium, '', '', '#2e86ff');

  // ---------- team bench ----------
  const bench = new THREE.Mesh(
    new THREE.RingGeometry(11.2, 13.2, 64, 1, -1.25, 1.25),
    new THREE.MeshStandardMaterial({ color: '#0d1230', roughness: 0.4, metalness: 0.6, emissive: '#101a50', emissiveIntensity: 0.6 }),
  );
  bench.rotation.x = -Math.PI / 2;
  bench.position.y = 0.03;
  scene.add(bench);

  // ---------- player pieces ----------
  const pawnGeo = new THREE.LatheGeometry(
    [[0, 0], [0.62, 0], [0.62, 0.12], [0.5, 0.2], [0.42, 0.34], [0.3, 0.62], [0.24, 1.02], [0.22, 1.26], [0.4, 1.33], [0.4, 1.42], [0.2, 1.48], [0, 1.48]].map(
      ([x, y]) => new THREE.Vector2(x, y),
    ),
    40,
  );
  const headGeo = new THREE.SphereGeometry(0.36, 32, 24);
  const bandGeo = new THREE.TorusGeometry(0.6, 0.05, 8, 48);
  const figures = new Map();

  // Distinct piece colors, handed out in join order.
  const PALETTE = ['#f0a43a', '#33c4a0', '#e0558f', '#8d6cff', '#4fb2ff', '#e8cf45', '#ff7845', '#76d455', '#c27cf7', '#20c9e0', '#f76d82', '#a6dd3a', '#f59e0b', '#7aa2ff', '#e46fe9', '#9fb0c8'];
  let nextColor = 0;

  function makeFigure(p) {
    const g = new THREE.Group();
    const color = new THREE.Color(PALETTE[nextColor++ % PALETTE.length]).multiplyScalar(0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 });
    const body = new THREE.Mesh(pawnGeo, bodyMat);
    const headMat = new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, 0.12), roughness: 0.3, metalness: 0.2, emissive: '#3dff8f', emissiveIntensity: 0 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.82;
    const bandMat = new THREE.MeshBasicMaterial({ color: color.clone().offsetHSL(0, 0.2, 0.15) });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.14;
    const tag = canvasTexture(512, 128);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag.tex, depthWrite: false, transparent: true }));
    label.scale.set(2.6, 0.65, 1);
    label.position.y = 2.65;
    g.add(body, head, band, label);
    g.position.set(0, 0, 18);
    scene.add(g);
    const fig = { id: p.id, group: g, label, bodyMat, headMat, bandMat, baseColor: color, tag, speak: 0, speaking: false, target: null, role: null, labelKey: null, name: p.name };
    figures.set(p.id, fig);
    return fig;
  }

  function drawLabel(fig, name, me, role) {
    const key = `${name}|${me}|${role}`;
    if (fig.labelKey === key) return;
    fig.labelKey = key;
    const { ctx, tex } = fig.tag;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(5,8,20,0.72)';
    ctx.beginPath();
    ctx.roundRect(16, 18, 480, 92, 46);
    ctx.fill();
    const color = role === 'chaser' ? '#ff5a63' : role === 'player' ? '#7fb4ff' : me ? '#ffc33d' : '#ffffff';
    drawText(ctx, fitName(name, 12), 256, 66, { size: 56, weight: 800, color });
    tex.needsUpdate = true;
  }

  function styleFigure(fig, role) {
    if (fig.role === role) return;
    fig.role = role;
    if (role === 'chaser') {
      fig.bodyMat.color.set('#121218');
      fig.bodyMat.metalness = 0.8;
      fig.headMat.color.set('#1b1b22');
      fig.bandMat.color.copy(COLOR.red);
    } else {
      fig.bodyMat.color.copy(fig.baseColor);
      fig.bodyMat.metalness = 0.35;
      fig.headMat.color.copy(fig.baseColor).offsetHSL(0, 0, 0.12);
      fig.bandMat.color.copy(role === 'player' ? COLOR.blue : fig.baseColor.clone().offsetHSL(0, 0.2, 0.15));
    }
    fig.group.scale.setScalar(role === 'chaser' ? 1.18 : 1);
  }

  // Hop a piece to a new spot along an arc.
  function moveFigure(fig, to, faceTo) {
    const key = `${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)}`;
    if (fig.target === key) return;
    fig.target = key;
    const from = fig.group.position.clone();
    const dist = from.distanceTo(to);
    const startRot = fig.group.rotation.y;
    const look = new THREE.Vector3(faceTo.x - to.x, 0, faceTo.z - to.z);
    let endRot = Math.atan2(look.x, look.z);
    while (endRot - startRot > Math.PI) endRot -= Math.PI * 2;
    while (endRot - startRot < -Math.PI) endRot += Math.PI * 2;
    const update = (t) => {
      fig.group.position.lerpVectors(from, to, t);
      fig.group.position.y += Math.sin(t * Math.PI) * Math.min(3, 0.6 + dist * 0.18);
      fig.group.rotation.y = startRot + (endRot - startRot) * t;
    };
    update.key = `fig:${fig.id}`;
    tween(Math.min(1.6, 0.7 + dist * 0.06), update);
  }

  // The team waits on a curved bench behind the contestant's podium.
  function benchSpot(i, n) {
    const span = Math.min(1.0, 0.13 * Math.max(1, n - 1));
    const a = n === 1 ? -0.62 : -0.62 - span / 2 + (span * i) / (n - 1);
    return new THREE.Vector3(Math.cos(a) * 12.2, 0.03, Math.sin(a) * 12.2);
  }

  // In the lobby everyone lines up in front of the board, two rows when crowded.
  function lineupSpot(i, n) {
    const perRow = n > 8 ? Math.ceil(n / 2) : n;
    const row = Math.floor(i / perRow);
    const inRow = row === 0 ? Math.min(n, perRow) : n - perRow;
    const k = i - row * perRow;
    const gap = 1.55;
    const x = (k - (inRow - 1) / 2) * gap + (row ? gap / 2 : 0);
    return new THREE.Vector3(x, 0.03, 3.4 - row * 2.2 - Math.abs(x) * 0.12);
  }

  // ---------- particles (escape confetti / final) ----------
  const PARTS = 600;
  const partGeo = new THREE.BufferGeometry();
  const partPos = new Float32Array(PARTS * 3);
  const partCol = new Float32Array(PARTS * 3);
  const partVel = new Float32Array(PARTS * 3);
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
  partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
  const parts = new THREE.Points(
    partGeo,
    new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  parts.visible = false;
  scene.add(parts);
  let partLife = 0;
  function burst(origin, palette) {
    for (let i = 0; i < PARTS; i++) {
      partPos.set([origin.x + (Math.random() - 0.5), origin.y, origin.z + (Math.random() - 0.5)], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      partVel.set([Math.cos(a) * s * 0.6, 6 + Math.random() * 9, Math.sin(a) * s * 0.6], i * 3);
      const c = palette[i % palette.length];
      partCol.set([c.r, c.g, c.b], i * 3);
    }
    partGeo.attributes.position.needsUpdate = true;
    partGeo.attributes.color.needsUpdate = true;
    parts.visible = true;
    partLife = 4;
  }

  // ---------- camera ----------
  const cam = { pos: new THREE.Vector3(0, 12, 34), look: new THREE.Vector3(0, 4, -2), offset: 0, orbit: true, shot: null };
  let shake = 0;
  function setShot(name) {
    if (cam.shot === name) return;
    cam.shot = name;
    const s = SHOTS[name];
    const fromPos = cam.pos.clone();
    const fromLook = cam.look.clone();
    const fromOffset = cam.offset;
    const toPos = new THREE.Vector3(...s.pos);
    const toLook = new THREE.Vector3(...s.look);
    cam.orbit = !!s.orbit;
    const update = (t) => {
      const e = ease(t);
      cam.pos.lerpVectors(fromPos, toPos, e);
      cam.look.lerpVectors(fromLook, toLook, e);
      cam.offset = fromOffset + (s.offset - fromOffset) * e;
    };
    update.key = 'camera';
    tween(1.8, update);
  }

  // ---------- state from the game ----------
  let view = null;
  let me = null;
  let chaserShown = false;
  let lastOutcomeKey = null;
  let options = [];
  let attract = true;
  let boardState = { chaser: 1, player: 0, points: null };

  function roleFor(v, id) {
    if (v.phase === 'lobby') return null;
    if (id === v.chaserId && (v.phase !== 'draw' || chaserShown)) return 'chaser';
    if (id === v.currentId && ['qualify', 'qualified', 'choose', 'duel', 'reveal'].includes(v.phase)) return 'player';
    if (v.phase === 'final' && v.winner?.kind === 'player' && id === v.winner.id) return 'player';
    return null;
  }

  function syncFigures(v) {
    const alive = v.players.filter((p) => !p.gone);
    const ids = new Set(alive.map((p) => p.id));
    for (const [id, fig] of figures) {
      if (!ids.has(id)) {
        scene.remove(fig.group);
        fig.tag.tex.dispose();
        figures.delete(id);
      }
    }
    const benchers = alive.filter((p) => !roleFor(v, p.id));
    for (const p of alive) {
      const fig = figures.get(p.id) ?? makeFigure(p);
      const role = roleFor(v, p.id);
      styleFigure(fig, role);
      drawLabel(fig, p.name, p.id === me, role);
      const lineup = v.phase === 'lobby' || (v.phase === 'draw' && !chaserShown);
      if (role === 'chaser') moveFigure(fig, PODIUM.chaser, new THREE.Vector3(-2, 0, 14));
      else if (role === 'player') moveFigure(fig, PODIUM.player, new THREE.Vector3(2, 0, 14));
      else if (lineup) moveFigure(fig, lineupSpot(alive.indexOf(p), alive.length), new THREE.Vector3(0, 0, 20));
      else moveFigure(fig, benchSpot(benchers.indexOf(p), benchers.length), new THREE.Vector3(0, 0, 3));
      // Podium screens already show the name, so floating labels are only for the team.
      fig.label.visible = !role && ['lobby', 'draw', 'qualify', 'qualified'].includes(v.phase);
      const out = ['eliminated', 'caught', 'left'].includes(v.results?.[p.id]?.status) && !role;
      fig.bodyMat.opacity = out ? 0.45 : 1;
      fig.bodyMat.transparent = out;
    }
  }

  function updateBoard(v) {
    const inChase = ['choose', 'duel', 'reveal'].includes(v.phase);
    const d = v.duel;
    boardState = {
      chaser: inChase ? (d?.chaser ?? 1) : 1,
      player: inChase ? (d?.player ?? 4) : 0,
      points: inChase ? v.results?.[v.currentId]?.points : null,
    };
    options = v.phase === 'choose' ? [3, 5] : [];
    attract = ['lobby', 'draw', 'final'].includes(v.phase);
    for (const s of slabs) {
      const prev = s.state;
      let state = 'idle';
      if (!attract) {
        if (s.n <= boardState.chaser) state = 'chaser';
        else if (s.n === boardState.player) state = 'player';
        else if (s.n === 8) state = 'home';
        if (options.includes(s.n)) state = 'option';
      }
      if (prev && prev !== state && (state === 'chaser' || state === 'player')) s.flash = 1;
      s.state = state;
      const text =
        state === 'player' ? (boardState.points != null ? `${boardState.points} נק׳` : '') :
        state === 'option' ? (s.n === 3 ? '+10' : '−10') :
        state === 'chaser' && s.n === boardState.chaser ? 'הרודף' :
        s.n === 8 && !attract ? 'בית' : '';
      drawSlab(s, text);
    }
  }

  function updatePodiums(v) {
    const current = v.players.find((p) => p.id === v.currentId);
    const chaser = v.players.find((p) => p.id === v.chaserId);
    if (v.phase === 'qualify' || v.phase === 'qualified') {
      drawScreen(playerPodium, current?.name ?? '', String(v.qualify?.points ?? 0), v.phase === 'qualified' ? '#ff2f3d' : '#2e86ff');
    } else if (['choose', 'duel', 'reveal'].includes(v.phase)) {
      drawScreen(playerPodium, current?.name ?? '', String(v.results?.[v.currentId]?.points ?? 0), '#2e86ff');
    } else if (v.phase === 'final' && v.winner?.kind === 'player') {
      const w = v.players.find((p) => p.id === v.winner.id);
      drawScreen(playerPodium, w?.name ?? '', String(v.results[v.winner.id].points), '#ffc33d');
    } else {
      drawScreen(playerPodium, '', '', '#2e86ff');
    }
    drawScreen(chaserPodium, 'הרודף', chaser && (v.phase !== 'draw' || chaserShown) && v.phase !== 'lobby' ? fitName(chaser.name, 10) : '', '#ff2f3d');
  }

  function pickShot(v) {
    switch (v.phase) {
      case 'lobby':
        return 'lobby';
      case 'draw':
        return chaserShown ? 'chaser' : 'draw';
      case 'qualify':
        return 'player';
      case 'qualified':
        return 'out';
      case 'choose':
      case 'duel':
      case 'reveal':
        return 'board';
      case 'final':
        return v.winner?.kind === 'chaser' ? 'winChaser' : 'winPlayer';
      default:
        return 'home';
    }
  }

  function lightsFor(v) {
    const chaserOn = v.phase !== 'lobby' && (v.phase !== 'draw' || chaserShown);
    const playerOn = ['qualify', 'qualified', 'choose', 'duel', 'reveal'].includes(v.phase) || (v.phase === 'final' && v.winner?.kind === 'player');
    fade('chaserSpot', chaserSpot, 'intensity', chaserOn ? 5 : 0);
    fade('playerSpot', playerSpot, 'intensity', playerOn ? 5 : 0);
    fade('chaserBeam', beams.chaser.material.uniforms.uOpacity, 'value', chaserOn ? 0.22 : 0);
    fade('playerBeam', beams.player.material.uniforms.uOpacity, 'value', playerOn ? 0.2 : 0);
    playerSpot.color.set(v.phase === 'qualified' ? '#ff3b46' : v.phase === 'final' ? '#ffd36b' : '#5aa2ff');
    beams.player.material.uniforms.uColor.value.set(v.phase === 'qualified' ? '#ff3040' : v.phase === 'final' ? '#ffc33d' : '#3e8ef7');
  }

  function fade(key, obj, prop, to) {
    const from = obj[prop];
    if (Math.abs(from - to) < 1e-3) return;
    const update = (t) => {
      obj[prop] = from + (to - from) * t;
    };
    update.key = `fade:${key}`;
    tween(0.8, update);
  }

  function outcome(v) {
    const r = v.duel?.reveal;
    if (v.phase !== 'reveal' || !r?.outcome) return;
    const key = `${v.currentId}:${v.duel.round}`;
    if (lastOutcomeKey === key) return;
    lastOutcomeKey = key;
    setTimeout(() => {
      if (r.outcome === 'caught') {
        ledMode = 'caught';
        shake = 0.5;
        for (const s of slabs) s.flash = 1.4;
      } else {
        ledMode = 'escaped';
        burst(new THREE.Vector3(0, 1.2, BOARD.z + 0.6), [COLOR.gold, COLOR.white, COLOR.blue]);
      }
    }, 900);
  }

  function setView(v, myId) {
    const prevPhase = view?.phase;
    view = v;
    me = myId;
    if (v.phase === 'draw' && prevPhase !== 'draw') chaserShown = false;
    if (v.phase !== 'draw') chaserShown = true;
    if (v.phase === 'lobby') chaserShown = false;
    ledMode = ['choose', 'duel', 'reveal'].includes(v.phase) ? (v.phase === 'reveal' && v.duel?.reveal?.outcome ? ledMode : 'chase') : v.phase === 'final' ? 'final' : 'idle';
    syncFigures(v);
    updateBoard(v);
    updatePodiums(v);
    lightsFor(v);
    setShot(pickShot(v));
    outcome(v);
    if (v.phase === 'final' && prevPhase !== 'final') {
      const at = v.winner?.kind === 'chaser' ? PODIUM.chaser : PODIUM.player;
      setTimeout(() => burst(new THREE.Vector3(at.x, at.y + 2.5, at.z), v.winner?.kind === 'chaser' ? [COLOR.red, COLOR.white] : [COLOR.gold, COLOR.white, COLOR.blue]), 600);
    }
  }

  function revealChaser() {
    chaserShown = true;
    if (view) setView(view, me);
  }

  function setHome() {
    view = null;
    attract = true;
    setShot('home');
  }

  function speaking(id, on) {
    const fig = figures.get(id);
    if (fig) fig.speaking = on;
  }

  // ---------- size ----------
  function resize(scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(2560, Math.round(W * scale * dpr));
    renderer.setPixelRatio(1);
    renderer.setSize(w, Math.round((w * H) / W), false);
  }

  // ---------- frame loop ----------
  const tmpColor = new THREE.Color();
  const pos = new THREE.Vector3();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    for (const job of tweens) {
      const p = Math.min(1, (t - job.t0) / job.duration);
      job.update(p);
      if (p >= 1) tweens.delete(job);
    }

    // Camera with a gentle idle drift; orbit shots slowly circle the set.
    pos.copy(cam.pos);
    if (!reduceMotion) {
      if (cam.orbit) {
        const a = Math.sin(t * 0.07) * 0.38;
        const r = Math.hypot(pos.x, pos.z - cam.look.z);
        pos.x = Math.sin(a) * r;
        pos.z = cam.look.z + Math.cos(a) * r;
      } else {
        pos.x += Math.sin(t * 0.31) * 0.18;
        pos.y += Math.sin(t * 0.23) * 0.1;
      }
      if (shake > 0) {
        pos.x += (Math.random() - 0.5) * shake;
        pos.y += (Math.random() - 0.5) * shake;
        shake = Math.max(0, shake - dt * 0.9);
      }
    }
    camera.position.copy(pos);
    camera.lookAt(cam.look);
    camera.setViewOffset(W, H, cam.offset * W, 0, W, H);

    // Board slabs.
    for (const s of slabs) {
      let color = COLOR.idle;
      let level = 0.35;
      if (attract) {
        const wave = (Math.sin(t * 2.2 - s.n * 0.8) + 1) / 2;
        color = s.n === 8 ? COLOR.gold : COLOR.blue;
        level = 0.25 + wave * 0.9;
      } else if (s.state === 'chaser') {
        color = COLOR.red;
        level = 1.25;
      } else if (s.state === 'player') {
        color = COLOR.blue;
        level = 1.6 + Math.sin(t * 4) * 0.15;
      } else if (s.state === 'option') {
        color = COLOR.gold;
        level = 0.6 + ((Math.sin(t * 5) + 1) / 2) * 0.9;
      } else if (s.state === 'home') {
        color = COLOR.gold;
        level = 0.45;
      }
      if (ledMode === 'caught') {
        color = COLOR.red;
        level = 0.9 + Math.abs(Math.sin(t * 9)) * 0.8;
      }
      s.target.copy(color);
      s.mat.emissive.lerp(s.target, Math.min(1, dt * 7));
      s.level += (level - s.level) * Math.min(1, dt * 7);
      s.flash = Math.max(0, s.flash - dt * 1.6);
      s.mat.emissiveIntensity = s.level + s.flash * 2.2;
    }

    // LED wall waves.
    for (let i = 0; i < LEDS; i++) {
      const wave = (Math.sin(t * 1.6 + i * 0.35) + 1) / 2;
      if (ledMode === 'chase') tmpColor.copy(i < LEDS / 2 ? COLOR.blue : COLOR.red).multiplyScalar(0.25 + wave * 0.55);
      else if (ledMode === 'caught') tmpColor.copy(COLOR.red).multiplyScalar(0.5 + Math.abs(Math.sin(t * 9)) * 0.6);
      else if (ledMode === 'escaped' || ledMode === 'final') tmpColor.copy(COLOR.gold).multiplyScalar(0.3 + wave * 0.7);
      else tmpColor.setHSL(0.64 + 0.07 * Math.sin(t * 0.4 + i * 0.12), 0.85, 0.12 + wave * 0.2);
      led.setColorAt(i, tmpColor);
    }
    led.instanceColor.needsUpdate = true;
    for (const [i, m] of ringMats.entries()) m.opacity = 0.35 + 0.3 * ((Math.sin(t * 1.3 - i) + 1) / 2);

    // Speaking glow and a slight idle bob for pieces.
    for (const fig of figures.values()) {
      fig.speak += ((fig.speaking ? 1 : 0) - fig.speak) * Math.min(1, dt * 10);
      fig.headMat.emissiveIntensity = fig.speak * 0.9;
    }

    // Particles.
    if (partLife > 0) {
      partLife -= dt;
      for (let i = 0; i < PARTS; i++) {
        partVel[i * 3 + 1] -= 9.8 * dt;
        partPos[i * 3] += partVel[i * 3] * dt;
        partPos[i * 3 + 1] = Math.max(0.05, partPos[i * 3 + 1] + partVel[i * 3 + 1] * dt);
        partPos[i * 3 + 2] += partVel[i * 3 + 2] * dt;
      }
      partGeo.attributes.position.needsUpdate = true;
      parts.material.opacity = Math.min(1, partLife);
      if (partLife <= 0) parts.visible = false;
    }

    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  setShot('home');

  return {
    setView,
    setHome,
    revealChaser,
    speaking,
    resize,
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
}
