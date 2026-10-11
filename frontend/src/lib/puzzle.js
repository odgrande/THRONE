// The sliding puzzle rules, same as the server's (backend/src/services/puzzle.js).
// A move is the board index of the tile that slides into the gap.
export const SIZE = 4;

export function neighbours(gap) {
  const r = Math.floor(gap / SIZE);
  const c = gap % SIZE;
  const out = [];
  if (r > 0) out.push(gap - SIZE);
  if (r < SIZE - 1) out.push(gap + SIZE);
  if (c > 0) out.push(gap - 1);
  if (c < SIZE - 1) out.push(gap + 1);
  return out;
}

export function applyMove(board, index) {
  const gap = board.indexOf(0);
  if (!neighbours(gap).includes(index)) return null;
  const next = [...board];
  next[gap] = next[index];
  next[index] = 0;
  return next;
}

export const isSolved = (board) => board.every((t, i) => t === (i === board.length - 1 ? 0 : i + 1));

// Arrow keys / swipes: the tile on that side of the gap moves INTO it, so
// "left" slides the tile right of the gap to the left.
export function tileForDirection(board, dir) {
  const gap = board.indexOf(0);
  const r = Math.floor(gap / SIZE);
  const c = gap % SIZE;
  if (dir === 'left' && c < SIZE - 1) return gap + 1;
  if (dir === 'right' && c > 0) return gap - 1;
  if (dir === 'up' && r < SIZE - 1) return gap + SIZE;
  if (dir === 'down' && r > 0) return gap - SIZE;
  return null;
}

// Practice boards (unranked): a random walk from solved.
export function practiceBoard(steps = 160) {
  let board = [...Array.from({ length: SIZE * SIZE - 1 }, (_, i) => i + 1), 0];
  let last = -1;
  for (let i = 0; i < steps; i++) {
    const gap = board.indexOf(0);
    const options = neighbours(gap).filter((p) => p !== last);
    const pick = options[Math.floor(Math.random() * options.length)];
    board = applyMove(board, pick);
    last = gap;
  }
  return isSolved(board) ? practiceBoard(steps) : board;
}

// Moves of an unfinished game, kept in this browser so a reload restores the
// exact position (the server's clock keeps running either way).
const KEY = 'throne.openGame';
export function saveProgress(attemptId, moves) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ attemptId, moves }));
  } catch {
    // storage blocked: a reload restarts from the original shuffle
  }
}
export function loadProgress(attemptId) {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return p?.attemptId === attemptId && Array.isArray(p.moves) ? p.moves : [];
  } catch {
    return [];
  }
}
export function clearProgress() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
