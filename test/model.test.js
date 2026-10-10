'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/model.js');

// Digits are slot+1 owners; '.' is empty. Rows are listed top to bottom.
function setBoard(board, rows) {
	for (let y = 0; y < board.size; y++) {
		for (let x = 0; x < board.size; x++) {
			const ch = rows[y][x];
			board.cells[y * board.size + x] = ch === '.' ? 0 : Number(ch);
		}
	}
}

function readBoard(board) {
	const rows = [];
	for (let y = 0; y < board.size; y++) {
		let row = '';
		for (let x = 0; x < board.size; x++) {
			const v = board.cells[y * board.size + x];
			row += v === 0 ? '.' : String(v);
		}
		rows.push(row);
	}
	return rows;
}

function rulesWith(overrides) {
	return Object.assign(M.defaultRules(), overrides);
}

function resolve(board, rules, gravity) {
	const points = new Int32Array(M.MAX_PLAYERS);
	const removed = M.resolveBoard(board, rules, gravity === undefined ? M.GRAVITY_DOWN : gravity, points);
	return { points, removed };
}

function boardFrom(size, rows) {
	const board = M.createBoard(size);
	setBoard(board, rows);
	return board;
}

test('window count on a 7x7 board is 120, 50 of them diagonal', () => {
	const geometry = M.getGeometry(7);
	assert.equal(geometry.windowCount, 120);
	assert.equal(geometry.windowDiagonal.reduce((a, b) => a + b, 0), 50);
});

test('gravity down stacks pieces at the bottom and keeps their order', () => {
	const board = boardFrom(5, ['1....', '.....', '2....', '.....', '1....']);
	M.settleBoard(board, M.GRAVITY_DOWN);
	assert.deepEqual(readBoard(board), ['.....', '.....', '1....', '2....', '1....']);
});

test('gravity up stacks pieces at the top and keeps their order', () => {
	const board = boardFrom(5, ['.....', '.....', '1....', '.....', '2....']);
	M.settleBoard(board, M.GRAVITY_UP);
	assert.deepEqual(readBoard(board), ['1....', '2....', '.....', '.....', '.....']);
});

test('gravity left stacks each row at the left and keeps order', () => {
	const board = boardFrom(5, ['...1.', '.2...', '.....', '.....', '.....']);
	M.settleBoard(board, M.GRAVITY_LEFT);
	assert.deepEqual(readBoard(board), ['1....', '2....', '.....', '.....', '.....']);
});

test('gravity right stacks each row at the right and keeps order', () => {
	const board = boardFrom(5, ['1.2..', '.....', '.....', '.....', '.....']);
	M.settleBoard(board, M.GRAVITY_RIGHT);
	assert.deepEqual(readBoard(board), ['...12', '.....', '.....', '.....', '.....']);
});

test('horizontal three scores one point for its owner and is not removed by default', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '111..']);
	const { points, removed } = resolve(board, M.defaultRules());
	assert.equal(points[0], 1);
	assert.equal(removed, 0);
});

test('vertical three scores one point for its owner', () => {
	const board = boardFrom(5, ['.....', '.....', '2....', '2....', '2....']);
	const { points } = resolve(board, M.defaultRules());
	assert.equal(points[1], 1);
});

test('mixed owners do not form a window', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '112..']);
	const { points } = resolve(board, M.defaultRules());
	assert.equal(points.reduce((a, b) => a + b, 0), 0);
});

test('four in a row contains two overlapping windows and scores two points', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '1111.']);
	const { points } = resolve(board, rulesWith({ removeGroups: false }));
	assert.equal(points[0], 2);
});

test('diagonal threes are ignored by default', () => {
	const board = boardFrom(5, ['..3..', '.3...', '3....', '.....', '.....']);
	const { points } = resolve(board, M.defaultRules());
	assert.equal(points[2], 0);
});

test('diagonal threes score in both directions when enabled', () => {
	const downLeft = boardFrom(5, ['....3', '...3.', '..3..', '.....', '.....']);
	assert.equal(resolve(downLeft, rulesWith({ scoreDiagonal: true })).points[2], 1);

	const downRight = boardFrom(5, ['.....', '.....', '1....', '.1...', '..1..']);
	assert.equal(resolve(downRight, rulesWith({ scoreDiagonal: true })).points[0], 1);
});

test('linear scoring off suppresses horizontal and vertical windows', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '111..']);
	const { points, removed } = resolve(board, rulesWith({ scoreLinear: false, removeGroups: false }));
	assert.equal(points[0], 0);
	assert.equal(removed, 0);
});

test('four-connected L-shaped group is removed when group removal is on', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '..1..', '111..']);
	const { removed } = resolve(board, M.defaultRules());
	assert.equal(removed, 4);
	assert.deepEqual(readBoard(board), ['.....', '.....', '.....', '.....', '.....']);
});

test('diagonal-only contact does not connect a group', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '..11.', '11...']);
	const { removed } = resolve(board, M.defaultRules());
	assert.equal(removed, 0);
});

test('groups of two of each owner touching across owners are kept', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '1122.']);
	const { removed } = resolve(board, M.defaultRules());
	assert.equal(removed, 0);
	assert.equal(readBoard(board)[4], '1122.');
});

test('group threshold is a model option: minimum size 5 keeps a four-group', () => {
	const fourBoard = boardFrom(5, ['.....', '.....', '.....', '.....', '1111.']);
	assert.equal(resolve(fourBoard, rulesWith({ groupMinSize: 5 })).removed, 0);

	const fiveBoard = boardFrom(5, ['.....', '.....', '.....', '.....', '11111']);
	assert.equal(resolve(fiveBoard, rulesWith({ groupMinSize: 5 })).removed, 5);
});

test('group removal off keeps a four-group in place', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '1111.']);
	const { removed } = resolve(board, rulesWith({ removeGroups: false }));
	assert.equal(removed, 0);
	assert.equal(readBoard(board)[4], '1111.');
});

test('remove scored threes clears the matched cells and keeps unmatched neighbours', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '111.2']);
	const { points, removed } = resolve(board, rulesWith({ removeScoredThrees: true, removeGroups: false }));
	assert.equal(points[0], 1);
	assert.equal(removed, 3);
	assert.equal(readBoard(board)[4], '....2');
});

test('remove scored threes clears all four cells of an overlapping four-run', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '1111.']);
	const { points, removed } = resolve(board, rulesWith({ removeScoredThrees: true, removeGroups: false }));
	assert.equal(points[0], 2);
	assert.equal(removed, 4);
});

test('remove scored threes with linear scoring off leaves the three untouched', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '111..']);
	const { removed } = resolve(board, rulesWith({ removeScoredThrees: true, scoreLinear: false, removeGroups: false }));
	assert.equal(removed, 0);
});

test('score every turn re-awards a standing three on each resolution', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '111..']);
	const rules = rulesWith({ scoreEveryTurn: true });
	assert.equal(resolve(board, rules).points[0], 1);
	assert.equal(resolve(board, rules).points[0], 1);
});

test('score only new awards a standing three once and never again', () => {
	const board = boardFrom(5, ['.....', '.....', '.....', '.....', '111..']);
	const rules = rulesWith({ scoreEveryTurn: false });
	assert.equal(resolve(board, rules).points[0], 1);
	assert.equal(resolve(board, rules).points[0], 0);
});

// Owner 1 has a four-run on the floor that gets removed. Owner 2's diagonal
// pieces fall into the freed floor cells and form a three only in the settle.
const DEFERRED_ROWS = ['.....', '..2..', '.2...', '2....', '1111.'];

test('score only new defers a three formed only by the final settle to the next resolution', () => {
	const board = boardFrom(5, DEFERRED_ROWS);
	const rules = rulesWith({ scoreEveryTurn: false });
	const first = resolve(board, rules);
	assert.equal(first.points[0], 2, 'owner 1 scores both windows of the four-run');
	assert.equal(first.points[1], 0, 'owner 2 three does not exist at detection time');
	assert.equal(readBoard(board)[4], '222..', 'the three is formed by the final settle');
	assert.equal(resolve(board, rules).points[1], 1, 'it is scored as new at the next resolution');
});

test('score every turn also scores the deferred three at the next resolution', () => {
	const board = boardFrom(5, DEFERRED_ROWS);
	const rules = rulesWith({ scoreEveryTurn: true });
	resolve(board, rules);
	assert.equal(resolve(board, rules).points[1], 1);
});

test('a rule change refreshes the snapshot without awarding points', () => {
	const game = M.createGame({ size: 5, rules: rulesWith({ scoreEveryTurn: false }) });
	setBoard(game.board, ['.....', '.....', '3....', '.3...', '..3..']);
	M.setRule(game, 'scoreDiagonal', true);
	assert.equal(game.slots[2].score, 0);
	assert.equal(resolve(game.board, game.rules).points[2], 0, 'the existing diagonal is already in the snapshot');
});

test('rotation is once per turn and placement advances the turn', () => {
	const game = M.createGame({ size: 5 });
	assert.equal(M.rotateGravity(game), true);
	assert.equal(M.rotateGravity(game), false);
	assert.equal(game.gravity, M.GRAVITY_LEFT);
	assert.equal(M.placeMark(game, 24), 0);
	assert.equal(game.activeSlot, 1);
	assert.equal(game.rotatedThisTurn, false);
});

test('gravity rotates clockwise through down, left, up, right', () => {
	const game = M.createGame({ size: 5 });
	const seen = [game.gravity];
	for (let i = 0; i < 4; i++) {
		assert.ok(M.placeMark(game, i) >= 0, 'every placement in this sequence is legal');
		M.rotateGravity(game);
		seen.push(game.gravity);
	}
	assert.deepEqual(seen, [M.GRAVITY_DOWN, M.GRAVITY_LEFT, M.GRAVITY_UP, M.GRAVITY_RIGHT, M.GRAVITY_DOWN]);
});

test('placement settles toward the current gravity edge', () => {
	const game = M.createGame({ size: 5 });
	M.placeMark(game, 3);
	assert.equal(game.board.cells[4 * 5 + 3], 1);
});

test('placement target previews the settled destination in every gravity', () => {
	const cases = [
		{ gravity: M.GRAVITY_DOWN, source: 2, target: 22 },
		{ gravity: M.GRAVITY_LEFT, source: 14, target: 10 },
		{ gravity: M.GRAVITY_UP, source: 22, target: 2 },
		{ gravity: M.GRAVITY_RIGHT, source: 10, target: 14 }
	];
	for (const item of cases) {
		const game = M.createGame({ size: 5 });
		game.gravity = item.gravity;
		assert.equal(M.placementTarget(game, item.source), item.target);
	}
});

test('placement target respects stable order on an unsettled line', () => {
	const game = M.createGame({ size: 5 });
	game.gravity = M.GRAVITY_LEFT;
	game.board.cells[2 * 5] = 1;
	game.board.cells[2 * 5 + 3] = 2;
	assert.equal(M.placementTarget(game, 2 * 5 + 2), 2 * 5 + 1);
	assert.equal(M.placementTarget(game, 2 * 5), -1, 'an occupied source is illegal');
});

test('placing on an occupied cell is rejected without changing the turn', () => {
	const game = M.createGame({ size: 5 });
	M.placeMark(game, 24);
	assert.equal(M.placeMark(game, 24), -1);
	assert.equal(game.activeSlot, 1);
});

test('placing a symbol that completes a three scores for the mover', () => {
	const game = M.createGame({ size: 5 });
	setBoard(game.board, ['.....', '.....', '.....', '.....', '11...']);
	M.placeMark(game, 4 * 5 + 2);
	assert.equal(game.slots[0].score, 1);
});

test('full board ends the game and blocks further moves', () => {
	const game = M.createGame({ size: 5 });
	const rows = [];
	for (let y = 0; y < 5; y++) {
		let row = '';
		for (let x = 0; x < 5; x++) {
			row += (x + y) % 2 === 0 ? '1' : '2';
		}
		rows.push(row);
	}
	setBoard(game.board, rows);
	game.board.cells[12] = 0;
	M.placeMark(game, 12);
	assert.equal(game.over, true);
	assert.equal(M.placeMark(game, 0), -1);
	assert.equal(M.rotateGravity(game), false);
});

test('resize grows with empty cells and settles pieces without scoring', () => {
	const game = M.createGame({ size: 5 });
	setBoard(game.board, ['.....', '.....', '.....', '.....', '111..']);
	M.setBoardSize(game, 7);
	assert.equal(game.board.size, 7);
	assert.equal(game.slots[0].score, 0);
	assert.equal(game.board.cells[6 * 7 + 0], 1);
	assert.equal(game.board.cells[6 * 7 + 2], 1);
	assert.equal(M.emptyCellCount(game), 49 - 3);
});

test('resize shrink keeps the top-left overlap and crops pieces outside', () => {
	const game = M.createGame({ size: 7 });
	game.board.cells[1 * 7 + 1] = 1;
	game.board.cells[6 * 7 + 6] = 2;
	M.setBoardSize(game, 5);
	assert.equal(game.board.size, 5);
	assert.equal(M.emptyCellCount(game), 24);
	assert.equal(game.board.cells[4 * 5 + 1], 1, 'the surviving piece settles toward the floor');
});

test('resize that fills the board ends the game', () => {
	const game = M.createGame({ size: 7 });
	for (let y = 0; y < 5; y++) {
		for (let x = 0; x < 5; x++) {
			game.board.cells[y * 7 + x] = ((x + y) % 2) + 1;
		}
	}
	M.setBoardSize(game, 5);
	assert.equal(game.over, true);
});

test('reducing players keeps the inactive slot marks and score and passes the turn to slot 0', () => {
	const game = M.createGame({ size: 5, playerCount: 3 });
	game.activeSlot = 2;
	game.slots[2].score = 4;
	game.board.cells[24] = 3;
	M.setPlayerCount(game, 2);
	assert.equal(game.activeSlot, 0);
	assert.equal(game.slots[2].score, 4);
	assert.equal(game.board.cells[24], 3);
	assert.equal(M.nextActiveSlot(game, 1), 0);
});

test('an inactive slot still scores into its own row', () => {
	const game = M.createGame({ size: 5, playerCount: 2 });
	setBoard(game.board, ['.....', '.....', '.....', '.....', '333..']);
	M.playOnBoard(game.board, game.rules, game.gravity, 1, 0, game.points);
	assert.equal(game.points[2], 1);
});

test('clean clears the board and scores and keeps size, players, controllers, and rules', () => {
	const game = M.createGame({ size: 6, playerCount: 4, rules: rulesWith({ scoreDiagonal: true }) });
	M.setSlotController(game, 1, 'bot', 'gravity-heuristic');
	M.placeMark(game, 0);
	M.rotateGravity(game);
	game.slots[0].score = 5;
	M.clean(game);
	assert.equal(game.board.size, 6);
	assert.equal(game.playerCount, 4);
	assert.equal(game.slots[1].controller, 'bot');
	assert.equal(game.rules.scoreDiagonal, true);
	assert.equal(game.gravity, M.GRAVITY_DOWN);
	assert.equal(game.slots[0].score, 0);
	assert.equal(M.emptyCellCount(game), 36);
});

test('leadingSlots reports ties among active slots only', () => {
	const game = M.createGame({ size: 5, playerCount: 3 });
	game.slots[0].score = 2;
	game.slots[1].score = 5;
	game.slots[2].score = 5;
	game.slots[3].score = 99;
	assert.deepEqual(M.leadingSlots(game), [1, 2]);
});
