'use strict';
// Bot-only self-play: compares group-removal thresholds under the default rules.
// Usage: node experiments/selfplay.js [games=40] [thresholds=4,5] [size=7] [players=3]
// Games differ only by a seeded random opening move; every later move is the heuristic bot.

const M = require('../src/model.js');
const B = require('../src/bots.js');

const games = Number(process.argv[2] || 40);
const thresholds = (process.argv[3] || '4,5').split(',').map(Number);
const size = Number(process.argv[4] || M.DEFAULT_SIZE);
const playerCount = Number(process.argv[5] || M.DEFAULT_PLAYERS);

function makeRandom(seed) {
	let state = seed >>> 0;
	return function next() {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function playGame(groupMinSize, seed) {
	const random = makeRandom(seed);
	const game = M.createGame({ size, playerCount, rules: Object.assign(M.defaultRules(), { groupMinSize }) });
	const stats = { turns: 0, removalTurns: 0, removedCells: 0, groupsRemoved: 0 };
	const opening = Math.floor(random() * size * size);
	M.placeMark(game, opening);
	stats.turns++;
	while (!game.over) {
		const move = B.chooseMove(game, B.DEFAULT_STRATEGY_ID);
		if (move.rotate) {
			M.rotateGravity(game);
		}
		const removed = M.placeMark(game, move.cell);
		stats.turns++;
		if (removed > 0) {
			stats.removalTurns++;
			stats.removedCells += removed;
		}
	}
	const scores = game.slots.slice(0, playerCount).map((s) => s.score);
	const total = scores.reduce((a, b) => a + b, 0);
	const leaders = M.leadingSlots(game);
	return {
		turns: stats.turns,
		removalTurns: stats.removalTurns,
		removedCells: stats.removedCells,
		totalPoints: total,
		spread: Math.max(...scores) - Math.min(...scores),
		tie: leaders.length > 1 ? 1 : 0,
		scores
	};
}

function mean(values) {
	return values.reduce((a, b) => a + b, 0) / values.length;
}

function summarize(groupMinSize) {
	const results = [];
	const started = Date.now();
	for (let g = 0; g < games; g++) {
		results.push(playGame(groupMinSize, 1000 + g));
	}
	const seconds = (Date.now() - started) / 1000;
	return {
		groupMinSize,
		games,
		meanTurns: mean(results.map((r) => r.turns)),
		meanRemovalTurns: mean(results.map((r) => r.removalTurns)),
		meanRemovedCells: mean(results.map((r) => r.removedCells)),
		meanTotalPoints: mean(results.map((r) => r.totalPoints)),
		meanSpread: mean(results.map((r) => r.spread)),
		tieRate: mean(results.map((r) => r.tie)),
		secondsPerGame: seconds / games
	};
}

function format(row) {
	return [
		'threshold=' + row.groupMinSize,
		'games=' + row.games,
		'turns=' + row.meanTurns.toFixed(1),
		'removalTurns=' + row.meanRemovalTurns.toFixed(1),
		'removedCells=' + row.meanRemovedCells.toFixed(1),
		'points=' + row.meanTotalPoints.toFixed(1),
		'spread=' + row.meanSpread.toFixed(2),
		'tieRate=' + row.tieRate.toFixed(2),
		'sec/game=' + row.secondsPerGame.toFixed(2)
	].join('  ');
}

console.log('self-play size=' + size + ' players=' + playerCount + ' rules=default');
for (const threshold of thresholds) {
	console.log(format(summarize(threshold)));
}
