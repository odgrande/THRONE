import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SIZE, tileForDirection } from '../lib/puzzle.js';

// The Throne puzzle in 3D (three.js). Loaded only when a game opens.
// Controlled: the parent owns `board` and receives onMove(index); this just
// draws it and animates tiles to their new places. Tap a tile, swipe, or use
// the arrow keys. Falls back to a flat board when WebGL is unavailable.

// Tiles are colored by their home row, so players can read the board at a glance.
const ROW_COLORS = ['#D02020', '#1040C0', '#F0C020', '#121212'];
const ROW_TEXT = ['#FFFFFF', '#FFFFFF', '#121212', '#FFFFFF'];

function tileTexture(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const row = Math.floor((n - 1) / SIZE);
  g.fillStyle = ROW_COLORS[row];
  g.fillRect(0, 0, 256, 256);
  // Bauhaus accent: a quarter circle in the corner.
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(256, 256, 110, Math.PI, 1.5 * Math.PI);
  g.lineTo(256, 256);
  g.fill();
  g.fillStyle = ROW_TEXT[row];
  g.font = '900 150px Outfit, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 128, 138);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const posOf = (index) => {
  const r = Math.floor(index / SIZE);
  const c = index % SIZE;
  return new THREE.Vector3(c - (SIZE - 1) / 2, (SIZE - 1) / 2 - r, 0);
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

// Swipe / key direction helpers shared by both boards.
function useControls(board, onMove, disabled) {
  useEffect(() => {
    const onKey = (e) => {
      if (disabled) return;
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }[e.key];
      if (!dir) return;
      const idx = tileForDirection(board, dir);
      if (idx !== null) {
        e.preventDefault();
        onMove(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [board, onMove, disabled]);
}

const swipeDir = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');

// The flat fallback (also used where WebGL is off).
export function Puzzle2D({ board, onMove, disabled, solved }) {
  useControls(board, onMove, disabled);
  const start = useRef(null);
  return (
    <div
      className={`grid aspect-square w-full touch-none select-none grid-cols-4 gap-1.5 border-4 border-ink bg-onyx p-1.5 ${solved ? 'animate-pulse' : ''}`}
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || disabled) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.hypot(dx, dy) > 24) {
          const idx = tileForDirection(board, swipeDir(dx, dy));
          if (idx !== null) onMove(idx);
        }
      }}
      role="grid"
      aria-label="Sliding puzzle"
    >
      {board.map((n, i) =>
        n ? (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onMove(i)}
            className="flex items-center justify-center border-2 border-ink text-2xl font-black sm:text-3xl"
            style={{ background: ROW_COLORS[Math.floor((n - 1) / SIZE)], color: ROW_TEXT[Math.floor((n - 1) / SIZE)] }}
            aria-label={`Tile ${n}`}
          >
            {n}
          </button>
        ) : (
          <span key="gap" aria-hidden="true" />
        ),
      )}
    </div>
  );
}

export default function Puzzle3D({ board, onMove, disabled = false, solved = false }) {
  const host = useRef(null);
  const sceneRef = useRef(null);
  const boardRef = useRef(board);
  const moveRef = useRef(onMove);
  const disabledRef = useRef(disabled);
  boardRef.current = board;
  moveRef.current = onMove;
  disabledRef.current = disabled;
  const [failed, setFailed] = useState(() => !webglAvailable());
  useControls(board, onMove, disabled || failed);

  // Build the scene once.
  useEffect(() => {
    if (failed) return;
    const el = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, -2.6, 7.4);
    camera.lookAt(0, -0.15, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-3, 4, 6);
    scene.add(sun);

    const group = new THREE.Group();
    scene.add(group);
    // The plinth.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.35, SIZE + 0.35, 0.4), new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.6 }));
    plinth.position.z = -0.32;
    group.add(plinth);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.55, SIZE + 0.55, 0.22), new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.5 }));
    rim.position.z = -0.5;
    group.add(rim);

    const body = new THREE.BoxGeometry(0.92, 0.92, 0.34);
    const face = new THREE.PlaneGeometry(0.9, 0.9);
    const tiles = new Map();
    for (let n = 1; n < SIZE * SIZE; n++) {
      const t = new THREE.Group();
      const row = Math.floor((n - 1) / SIZE);
      const mat = new THREE.MeshStandardMaterial({ color: ROW_COLORS[row], roughness: 0.45, metalness: 0.05 });
      const b = new THREE.Mesh(body, mat);
      const f = new THREE.Mesh(face, new THREE.MeshStandardMaterial({ map: tileTexture(n), roughness: 0.4 }));
      f.position.z = 0.171;
      b.userData.tile = n;
      f.userData.tile = n;
      t.add(b, f);
      const p = posOf(boardRef.current.indexOf(n));
      t.position.copy(p);
      t.userData.target = p.clone();
      group.add(t);
      tiles.set(n, t);
    }

    const resize = () => {
      const w = el.clientWidth;
      renderer.setSize(w, w, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Pointer: tap a tile, or swipe; the board leans toward the pointer.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let lean = { x: 0, y: 0 };
    let down = null;
    const toNdc = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const onDown = (e) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onMovePtr = (e) => {
      toNdc(e);
      lean = { x: ndc.x, y: ndc.y };
    };
    const onUp = (e) => {
      const s = down;
      down = null;
      if (!s || disabledRef.current) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) > 24) {
        const idx = tileForDirection(boardRef.current, swipeDir(dx, dy));
        if (idx !== null) moveRef.current(idx);
        return;
      }
      toNdc(e);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(group.children, true).find((h) => h.object.userData.tile);
      if (hit) moveRef.current(boardRef.current.indexOf(hit.object.userData.tile));
    };
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMovePtr);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', () => (lean = { x: 0, y: 0 }));

    let raf = 0;
    let spin = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      for (const t of tiles.values()) {
        t.position.lerp(t.userData.target, 1 - Math.pow(0.0005, dt));
        // A little hop while sliding.
        const d = t.position.distanceTo(t.userData.target);
        t.position.z = Math.min(0.25, d * 0.5);
      }
      group.rotation.x += (-lean.y * 0.18 - group.rotation.x) * 0.08;
      group.rotation.y += (lean.x * 0.22 - group.rotation.y) * 0.08;
      if (sceneRef.current?.celebrate) {
        spin = Math.min(spin + dt * 2.2, Math.PI * 2);
        group.rotation.z = spin;
        if (spin >= Math.PI * 2) {
          sceneRef.current.celebrate = false;
          group.rotation.z = 0;
          spin = 0;
        }
      }
      renderer.render(scene, camera);
    };
    loop();

    sceneRef.current = { tiles, celebrate: false };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (m) {
          m.map?.dispose?.();
          m.dispose?.();
        }
      });
      cv.remove();
      sceneRef.current = null;
    };
  }, [failed]);

  // New board -> new targets (the loop animates the slide).
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    board.forEach((n, i) => {
      if (n) s.tiles.get(n).userData.target = posOf(i);
    });
  }, [board]);

  useEffect(() => {
    if (solved && sceneRef.current) sceneRef.current.celebrate = true;
  }, [solved]);

  if (failed) return <Puzzle2D board={board} onMove={onMove} disabled={disabled} solved={solved} />;
  return <div ref={host} className="aspect-square w-full touch-none select-none" role="application" aria-label="3D sliding puzzle: tap a tile next to the gap, swipe, or use the arrow keys" />;
}
