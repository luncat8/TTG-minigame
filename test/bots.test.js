'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/model.js');
const B = require('../src/bots.js');

function setBoard(board, rows) {
	for (let y = 0; y < board.size; y++) {
		for (let x = 0; x < board.size; x++) {
			const ch = rows[y][x];
			board.cells[y * board.size + x] = ch === '.' ? 0 : Number(ch);
		}
	}
}

function gameFrom(size, rows, overrides) {
	const game = M.createGame({ size, playerCount: 2, rules: Object.assign(M.defaultRules(), overrides) });
	setBoard(game.board, rows);
	M.refreshSnapshot(game.board, game.rules);
	return game;
}

function countOwner(board, owner) {
	let count = 0;
	for (let i = 0; i < board.cells.length; i++) {
		if (board.cells[i] === owner) {
			count++;
		}
	}
	return count;
}

// Best immediate points the active slot can take from its current position, with keep or rotate.
function bestImmediateGain(game, slot) {
	const scratch = M.createBoard(game.board.size);
	const points = new Int32Array(M.MAX_PLAYERS);
	let best = 0;
	for (let rotate = 0; rotate < 2; rotate++) {
		const gravity = (game.gravity + rotate) & 3;
		for (let cell = 0; cell < game.board.cells.length; cell++) {
			if (!M.isCellEmpty(game, cell)) {
				continue;
			}
			M.copyBoard(scratch, game.board);
			M.playOnBoard(scratch, game.rules, gravity, cell, slot, points);
			best = Math.max(best, points[slot]);
		}
	}
	return best;
}

function snapshotState(game) {
	return {
		cells: Array.from(game.board.cells),
		previous: Array.from(game.board.previousOwners),
		gravity: game.gravity,
		rotated: game.rotatedThisTurn,
		scores: game.slots.map((s) => s.score),
		activeSlot: game.activeSlot
	};
}

test('registry exposes the gravity heuristic and falls back to it for unknown ids', () => {
	assert.deepEqual(B.STRATEGIES.map((s) => s.id), ['gravity-heuristic']);
	const game = gameFrom(5, ['.....', '.....', '.....', '.....', '.....']);
	const move = B.chooseMove(game, 'no-such-strategy');
	assert.ok(M.canPlaceAt(game, move.cell));
});

test('chosen move is legal and rotation is only offered when unused this turn', () => {
	const game = gameFrom(5, ['.....', '.....', '.....', '.....', '.....']);
	M.rotateGravity(game);
	const move = B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
	assert.equal(move.rotate, false);
	assert.ok(M.canPlaceAt(game, move.cell));
});

test('decision never mutates the live game', () => {
	const game = gameFrom(5, ['.....', '.....', '.....', '.....', '111..']);
	const before = snapshotState(game);
	B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
	assert.deepEqual(snapshotState(game), before);
});

test('keeps a standing three rather than growing it into a removable group when group removal is on', () => {
	const game = gameFrom(5, ['.....', '.....', '.....', '.....', '111..']);
	const move = B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
	assert.notEqual(move.cell % 5, 3, 'a symbol dropped in column 3 would extend the three');
	if (move.rotate) {
		M.rotateGravity(game);
	}
	M.placeMark(game, move.cell);
	assert.equal(countOwner(game.board, 1), 4, 'the three survives and the new symbol stays');
});

test('extends the three when group removal is off, because the four-run is then kept and scores more', () => {
	const game = gameFrom(5, ['.....', '.....', '.....', '.....', '111..'], { removeGroups: false });
	const move = B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
	assert.equal(move.cell % 5, 3, 'a symbol dropped in column 3 extends the three');
	assert.equal(move.rotate, false);
});

test('blocks an immediate three by the opponent when it can', () => {
	// Slot 1 has two pieces on the floor with a gap at x=2. Without a block it scores with a gravity-down drop.
	const game = gameFrom(5, ['.....', '.....', '.....', '.....', '22.2.'], { removeGroups: false });
	game.activeSlot = 0;
	const move = B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
	M.placeMark(game, move.cell);
	assert.equal(game.activeSlot, 1);
	assert.equal(bestImmediateGain(game, 1), 0, 'the opponent has no immediate scoring left');
});

test('self-play with the heuristic: every chosen move is legal and every game terminates', () => {
	for (const playerCount of [2, 3, 4]) {
		const game = M.createGame({ size: 5, playerCount });
		let turns = 0;
		while (!game.over && turns < 100) {
			const move = B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
			assert.ok(M.canPlaceAt(game, move.cell), 'chosen cell is empty');
			if (move.rotate) {
				assert.equal(M.rotateGravity(game), true);
			}
			assert.ok(M.placeMark(game, move.cell) >= 0);
			turns++;
		}
		assert.equal(game.over, true);
	}
});
