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

test('self-play with the every-turn rotation keeps every chosen move legal', () => {
	const rules = Object.assign(M.defaultRules(), { rotateGravityEachTurn: true });
	for (const playerCount of [2, 3, 4, 5, 6]) {
		const game = M.createGame({ size: 5, playerCount, rules });
		let turns = 0;
		while (!game.over && turns < 60) {
			const move = B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
			assert.ok(M.canPlaceAt(game, move.cell), 'chosen cell is empty');
			if (move.rotate) {
				assert.equal(M.rotateGravity(game), true);
			}
			assert.ok(M.placeMark(game, move.cell) >= 0);
			turns++;
		}
	}
});

// With few players the rotation keeps clearing groups as fast as they form, so
// the symmetric bot game cycles without filling the board; four to six still end.
test('self-play with the every-turn rotation terminates for four to six players', () => {
	const rules = Object.assign(M.defaultRules(), { rotateGravityEachTurn: true });
	for (const playerCount of [4, 5, 6]) {
		const game = M.createGame({ size: 5, playerCount, rules });
		let turns = 0;
		while (!game.over && turns < 400) {
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

test('the every-turn rotation prices in the gravity the next player inherits', () => {
	// Slot 1 owns a standing vertical three that is already in the snapshot, so it
	// scores nothing while the board stays settled downward. Once gravity rotates,
	// the same pieces realign into fresh windows the next player can still reach,
	// which only the every-turn rule puts into the candidate's denial term.
	const rows = ['.....', '.....', '2....', '2....', '2....'];
	const options = { scoreEveryTurn: false, removeGroups: false };
	const withRule = gameFrom(5, rows, Object.assign({ rotateGravityEachTurn: true }, options));
	const withoutRule = gameFrom(5, rows, options);
	const valueWith = B.evaluateCandidate(withRule, B.scratchFor(5), 0, M.GRAVITY_DOWN, 24);
	const valueWithout = B.evaluateCandidate(withoutRule, B.scratchFor(5), 0, M.GRAVITY_DOWN, 24);
	assert.ok(valueWith < valueWithout, 'the inherited rotation exposes the opponent to a reachable scoring gravity');
});
