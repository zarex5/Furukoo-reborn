'use strict';
// Ported from src/gameLogic.ts — must stay in sync with slotKey format

const PIECES_PER_PLAYER = 7;
const INITIAL_TIME_MS = 5 * 60 * 1000;
const TIME_BONUS_MS = 3 * 1000;

// Must match src/types.ts: `${line}${type}${slot}`
function slotKey(s) {
  return `${s.line}${s.type}${s.slot}`;
}

function adjacentSlots(s) {
  const result = [];
  if (s.type === 'V') {
    const { line: k, slot: pos } = s;
    if (pos > 1) result.push({ type: 'V', line: k, slot: pos - 1 });
    if (pos < 7) result.push({ type: 'V', line: k, slot: pos + 1 });
    if (k > 1)  result.push({ type: 'V', line: k - 1, slot: pos });
    if (k < 6)  result.push({ type: 'V', line: k + 1, slot: pos });
    if (pos >= 2) { result.push({ type: 'H', line: pos - 1, slot: k }); result.push({ type: 'H', line: pos - 1, slot: k + 1 }); }
    if (pos <= 6) { result.push({ type: 'H', line: pos,     slot: k }); result.push({ type: 'H', line: pos,     slot: k + 1 }); }
  } else {
    const { line: j, slot: pos } = s;
    if (pos > 1) result.push({ type: 'H', line: j, slot: pos - 1 });
    if (pos < 7) result.push({ type: 'H', line: j, slot: pos + 1 });
    if (j > 1)  result.push({ type: 'H', line: j - 1, slot: pos });
    if (j < 6)  result.push({ type: 'H', line: j + 1, slot: pos });
    if (pos >= 2) { result.push({ type: 'V', line: pos - 1, slot: j }); result.push({ type: 'V', line: pos - 1, slot: j + 1 }); }
    if (pos <= 6) { result.push({ type: 'V', line: pos,     slot: j }); result.push({ type: 'V', line: pos,     slot: j + 1 }); }
  }
  return result.filter(a => a.line >= 1 && a.line <= 6 && a.slot >= 1 && a.slot <= 7);
}

function allSquares() {
  const squares = [];
  for (let j = 1; j <= 5; j++)
    for (let k = 1; k <= 5; k++)
      squares.push([
        { type: 'H', line: j,     slot: k + 1 },
        { type: 'H', line: j + 1, slot: k + 1 },
        { type: 'V', line: k,     slot: j + 1 },
        { type: 'V', line: k + 1, slot: j + 1 },
      ]);
  return squares;
}

function checkWinner(pieces) {
  for (const [a, b, c, d] of allSquares()) {
    const pa = pieces[slotKey(a)];
    if (!pa) continue;
    if (pa === pieces[slotKey(b)] && pa === pieces[slotKey(c)] && pa === pieces[slotKey(d)]) return pa;
  }
  return null;
}

function legalMoves(from, pieces) {
  return adjacentSlots(from).filter(s => !pieces[slotKey(s)]);
}

function applyMove(game, to, from) {
  const newPieces = { ...game.pieces };
  const player = game.currentPlayer;
  if (from) delete newPieces[slotKey(from)];
  newPieces[slotKey(to)] = player;

  const now = Date.now();
  const elapsed = now - (game.lastMoveAt || now);
  const newRedPlaced  = player === 'red'   ? game.redPlaced   + (from ? 0 : 1) : game.redPlaced;
  const newBlackPlaced = player === 'black' ? game.blackPlaced + (from ? 0 : 1) : game.blackPlaced;
  const newPhase = newRedPlaced >= PIECES_PER_PLAYER && newBlackPlaced >= PIECES_PER_PLAYER ? 'movement' : 'placement';

  const newRedTimeMs   = player === 'red'   ? Math.max(0, game.redTimeMs   - elapsed) + TIME_BONUS_MS : game.redTimeMs;
  const newBlackTimeMs = player === 'black' ? Math.max(0, game.blackTimeMs - elapsed) + TIME_BONUS_MS : game.blackTimeMs;

  return {
    ...game,
    pieces: newPieces,
    currentPlayer: player === 'red' ? 'black' : 'red',
    redPlaced:   newRedPlaced,
    blackPlaced: newBlackPlaced,
    phase:       newPhase,
    moves:       [...game.moves, { player, from: from || null, to }],
    winner:      checkWinner(newPieces),
    redTimeMs:   newRedTimeMs,
    blackTimeMs: newBlackTimeMs,
    lastMoveAt:  now,
  };
}

// K=60 matches the example: A1945 vs B1560 → A gets +6 win, -24 draw, -54 loss
function calcEloDelta(playerElo, opponentElo, score) {
  const E = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(60 * (score - E));
}

function getEloRange(elo) {
  if (elo >= 2400) return '2400-3000';
  if (elo >= 2200) return '2200-2399';
  if (elo >= 2000) return '2000-2199';
  if (elo >= 1800) return '1800-1999';
  if (elo >= 1600) return '1600-1799';
  if (elo >= 1400) return '1400-1599';
  if (elo >= 1200) return '1200-1399';
  return '1000-1199';
}

function eloInfo(redElo, blackElo) {
  return {
    red:   { win: calcEloDelta(redElo, blackElo, 1), draw: calcEloDelta(redElo, blackElo, 0.5), loss: calcEloDelta(redElo, blackElo, 0) },
    black: { win: calcEloDelta(blackElo, redElo, 1), draw: calcEloDelta(blackElo, redElo, 0.5), loss: calcEloDelta(blackElo, redElo, 0) },
  };
}

module.exports = { slotKey, adjacentSlots, legalMoves, allSquares, checkWinner, applyMove, calcEloDelta, eloInfo, getEloRange, PIECES_PER_PLAYER, INITIAL_TIME_MS, TIME_BONUS_MS };
