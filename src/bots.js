// Bot registry and the gravity-aware heuristic. Candidates are evaluated by
// simulating the real turn resolution on scratch boards; the live game is never mutated.
var GravityBots = (function (M) {
	'use strict';

	// Points of value for one qualifying window that keeps scoring on later turns.
	var STANDING_VALUE = 1.5;
	// Weight of the next player's best immediate reply (denial of opponent scoring).
	var DENIAL_WEIGHT = 1;

	var scratchBySize = {};

	function scratchFor(size) {
		if (!scratchBySize[size]) {
			scratchBySize[size] = {
				trial: M.createBoard(size),
				reply: M.createBoard(size),
				points: new Int32Array(M.MAX_PLAYERS),
				replyPoints: new Int32Array(M.MAX_PLAYERS)
			};
		}
		return scratchBySize[size];
	}

	function sumOpponentPoints(points, slot) {
		var total = 0;
		for (var other = 0; other < M.MAX_PLAYERS; other++) {
			if (other !== slot) {
				total += points[other];
			}
		}
		return total;
	}

	// Windows owned by `slot` minus windows owned by anyone else, on the current board.
	function standingBalance(board, slot) {
		var mine = slot + 1;
		var balance = 0;
		var owners = board.owners;
		for (var w = 0; w < owners.length; w++) {
			if (owners[w] === mine) {
				balance++;
			} else if (owners[w] !== 0) {
				balance--;
			}
		}
		return balance;
	}

	// Best points the next player can take in one turn from `trial`: they may keep or rotate gravity.
	function bestReplyGain(game, scratch, nextSlot, gravity) {
		var keep = bestGainForGravity(game, scratch, nextSlot, gravity);
		var rotate = bestGainForGravity(game, scratch, nextSlot, (gravity + 1) & 3);
		return keep > rotate ? keep : rotate;
	}

	function bestGainForGravity(game, scratch, nextSlot, gravity) {
		var best = 0;
		var board = scratch.trial;
		var cellCount = board.cells.length;
		for (var cell = 0; cell < cellCount; cell++) {
			if (board.cells[cell] !== 0) {
				continue;
			}
			M.copyBoard(scratch.reply, board);
			M.playOnBoard(scratch.reply, game.rules, gravity, cell, nextSlot, scratch.replyPoints);
			if (scratch.replyPoints[nextSlot] > best) {
				best = scratch.replyPoints[nextSlot];
			}
		}
		return best;
	}

	// Simulates one candidate (gravity, cell) and returns its heuristic value.
	function evaluateCandidate(game, scratch, slot, gravity, cell) {
		M.copyBoard(scratch.trial, game.board);
		M.playOnBoard(scratch.trial, game.rules, gravity, cell, slot, scratch.points);
		var gained = scratch.points[slot];
		var conceded = sumOpponentPoints(scratch.points, slot);
		M.detectMatches(scratch.trial, game.rules);
		var standing = standingBalance(scratch.trial, slot);
		var nextSlot = M.nextActiveSlot(game, slot);
		var denial = bestReplyGain(game, scratch, nextSlot, gravity);
		return gained - conceded + STANDING_VALUE * standing - DENIAL_WEIGHT * denial;
	}

	// Returns { cell, rotate } for the active slot. Keeps gravity on ties and prefers lower cell indices.
	function chooseGravityHeuristic(game) {
		var slot = game.activeSlot;
		var scratch = scratchFor(game.board.size);
		var best = { cell: -1, rotate: false };
		var bestValue = -Infinity;
		var rotations = game.rotatedThisTurn ? 1 : 2;
		for (var option = 0; option < rotations; option++) {
			var gravity = option === 0 ? game.gravity : (game.gravity + 1) & 3;
			var cellCount = game.board.cells.length;
			for (var cell = 0; cell < cellCount; cell++) {
				if (!M.canPlaceAt(game, cell)) {
					continue;
				}
				var value = evaluateCandidate(game, scratch, slot, gravity, cell);
				if (value > bestValue) {
					bestValue = value;
					best.cell = cell;
					best.rotate = option === 1;
				}
			}
		}
		return best;
	}

	var STRATEGIES = [
		{ id: 'gravity-heuristic', label: 'Gravity heuristic', choose: chooseGravityHeuristic }
	];
	var DEFAULT_STRATEGY_ID = 'gravity-heuristic';

	function findStrategy(id) {
		for (var i = 0; i < STRATEGIES.length; i++) {
			if (STRATEGIES[i].id === id) {
				return STRATEGIES[i];
			}
		}
		return findStrategy(DEFAULT_STRATEGY_ID);
	}

	// Chooses a move for the active slot using the strategy registered under `strategyId`.
	function chooseMove(game, strategyId) {
		return findStrategy(strategyId).choose(game);
	}

	var api = {
		STRATEGIES: STRATEGIES,
		DEFAULT_STRATEGY_ID: DEFAULT_STRATEGY_ID,
		findStrategy: findStrategy,
		chooseMove: chooseMove,
		chooseGravityHeuristic: chooseGravityHeuristic,
		evaluateCandidate: evaluateCandidate,
		standingBalance: standingBalance
	};
	return api;
})(typeof module !== 'undefined' ? require('./model.js') : GravityModel);

if (typeof module !== 'undefined') {
	module.exports = GravityBots;
}
