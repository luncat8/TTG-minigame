// Pure rules model: placement, gravity settling, matches, scoring, removal, turns.
// Buffers are allocated per board size; a turn mutates them in place.
var GravityModel = (function () {
	'use strict';

	var GRAVITY_DOWN = 0;
	var GRAVITY_LEFT = 1;
	var GRAVITY_UP = 2;
	var GRAVITY_RIGHT = 3;
	var GRAVITY_NAMES = ['down', 'left', 'up', 'right'];

	var MIN_PLAYERS = 2;
	var MAX_PLAYERS = 6;
	var DEFAULT_PLAYERS = 3;
	var MIN_SIZE = 5;
	var MAX_SIZE = 11;
	var DEFAULT_SIZE = 7;
	var WINDOW_LENGTH = 3;
	var DEFAULT_GROUP_MIN_SIZE = 4;

	// Flat table drives both the defaults and the checkbox list in the UI.
	var RULE_DEFINITIONS = [
		{ key: 'scoreLinear', label: 'Score three in a horizontal or vertical row', defaultValue: true },
		{ key: 'scoreDiagonal', label: 'Score diagonal threes', defaultValue: false },
		{ key: 'removeScoredThrees', label: 'Remove scored three-cell matches', defaultValue: false },
		{ key: 'removeGroups', label: 'Remove any group of four or more', defaultValue: true },
		{ key: 'scoreEveryTurn', label: 'Score every turn after gravity resolves', defaultValue: true }
	];

	var geometryCache = {};

	function defaultRules() {
		var rules = { groupMinSize: DEFAULT_GROUP_MIN_SIZE };
		for (var i = 0; i < RULE_DEFINITIONS.length; i++) {
			rules[RULE_DEFINITIONS[i].key] = RULE_DEFINITIONS[i].defaultValue;
		}
		return rules;
	}

	function clamp(value, min, max) {
		return value < min ? min : value > max ? max : value;
	}

	// Index tables for one size: window cell triples, and per-gravity line orders
	// where entry [gravity][line * size + k] is the cell at distance k from the gravity edge.
	function buildGeometry(size) {
		var cellCount = size * size;
		var windowList = [];
		var x, y;
		for (y = 0; y < size; y++) {
			for (x = 0; x < size; x++) {
				addWindowsFrom(windowList, size, x, y);
			}
		}
		var windowCount = windowList.length / (WINDOW_LENGTH + 1);
		var windowCells = new Int16Array(windowCount * WINDOW_LENGTH);
		var windowDiagonal = new Uint8Array(windowCount);
		for (var w = 0; w < windowCount; w++) {
			var base = w * (WINDOW_LENGTH + 1);
			windowDiagonal[w] = windowList[base + WINDOW_LENGTH];
			for (var j = 0; j < WINDOW_LENGTH; j++) {
				windowCells[w * WINDOW_LENGTH + j] = windowList[base + j];
			}
		}
		return {
			size: size,
			cellCount: cellCount,
			windowCount: windowCount,
			windowCells: windowCells,
			windowDiagonal: windowDiagonal,
			lines: buildLineTable(size)
		};
	}

	// Each window is stored as three cell indices followed by a diagonal flag.
	function addWindowsFrom(list, size, x, y) {
		var right = x + WINDOW_LENGTH - 1 < size;
		var down = y + WINDOW_LENGTH - 1 < size;
		var left = x - (WINDOW_LENGTH - 1) >= 0;
		if (right) {
			pushWindow(list, size, [x, y, x + 1, y, x + 2, y], 0);
		}
		if (down) {
			pushWindow(list, size, [x, y, x, y + 1, x, y + 2], 0);
		}
		if (right && down) {
			pushWindow(list, size, [x, y, x + 1, y + 1, x + 2, y + 2], 1);
		}
		if (left && down) {
			pushWindow(list, size, [x, y, x - 1, y + 1, x - 2, y + 2], 1);
		}
	}

	function pushWindow(list, size, coords, diagonal) {
		for (var i = 0; i < coords.length; i += 2) {
			list.push(coords[i + 1] * size + coords[i]);
		}
		list.push(diagonal);
	}

	function buildLineTable(size) {
		var table = new Int16Array(4 * size * size);
		for (var line = 0; line < size; line++) {
			for (var k = 0; k < size; k++) {
				var last = size - 1 - k;
				var offset = line * size + k;
				table[GRAVITY_DOWN * size * size + offset] = last * size + line;
				table[GRAVITY_LEFT * size * size + offset] = line * size + k;
				table[GRAVITY_UP * size * size + offset] = k * size + line;
				table[GRAVITY_RIGHT * size * size + offset] = line * size + last;
			}
		}
		return table;
	}

	function getGeometry(size) {
		if (!geometryCache[size]) {
			geometryCache[size] = buildGeometry(size);
		}
		return geometryCache[size];
	}

	// Scratch-capable board: cells hold 0 for empty or slot+1 for an owner.
	function createBoard(size) {
		var geometry = getGeometry(size);
		return {
			size: size,
			geometry: geometry,
			cells: new Int8Array(geometry.cellCount),
			owners: new Int8Array(geometry.windowCount),
			previousOwners: new Int8Array(geometry.windowCount),
			removal: new Uint8Array(geometry.cellCount),
			visited: new Uint8Array(geometry.cellCount),
			component: new Int16Array(geometry.cellCount)
		};
	}

	function copyBoard(target, source) {
		target.cells.set(source.cells);
		target.previousOwners.set(source.previousOwners);
	}

	function countEmpty(board) {
		var empty = 0;
		for (var i = 0; i < board.cells.length; i++) {
			if (board.cells[i] === 0) {
				empty++;
			}
		}
		return empty;
	}

	// Stable compaction: pieces keep their order and stack against the gravity edge.
	function settleBoard(board, gravity) {
		var cells = board.cells;
		var size = board.size;
		var lines = board.geometry.lines;
		var base = gravity * size * size;
		for (var line = 0; line < size; line++) {
			var lineBase = base + line * size;
			var write = 0;
			for (var k = 0; k < size; k++) {
				var source = lines[lineBase + k];
				var value = cells[source];
				if (value === 0) {
					continue;
				}
				cells[source] = 0;
				cells[lines[lineBase + write]] = value;
				write++;
			}
		}
	}

	function detectMatches(board, rules) {
		var geometry = board.geometry;
		var cells = board.cells;
		var owners = board.owners;
		var windowCells = geometry.windowCells;
		for (var w = 0; w < geometry.windowCount; w++) {
			owners[w] = windowOwner(cells, windowCells, w, geometry.windowDiagonal[w], rules);
		}
	}

	function windowOwner(cells, windowCells, w, diagonal, rules) {
		if (diagonal ? !rules.scoreDiagonal : !rules.scoreLinear) {
			return 0;
		}
		var a = cells[windowCells[w * 3]];
		if (a === 0) {
			return 0;
		}
		if (a === cells[windowCells[w * 3 + 1]] && a === cells[windowCells[w * 3 + 2]]) {
			return a;
		}
		return 0;
	}

	function scoreMatches(board, rules, points) {
		var owners = board.owners;
		var previous = board.previousOwners;
		for (var w = 0; w < owners.length; w++) {
			var owner = owners[w];
			if (owner !== 0 && (rules.scoreEveryTurn || previous[w] !== owner)) {
				points[owner - 1]++;
			}
		}
	}

	function markRemovals(board, rules) {
		var removal = board.removal;
		removal.fill(0);
		if (rules.removeScoredThrees) {
			markWindowCells(board);
		}
		if (rules.removeGroups) {
			markLargeGroups(board, rules.groupMinSize);
		}
	}

	function markWindowCells(board) {
		var owners = board.owners;
		var windowCells = board.geometry.windowCells;
		for (var w = 0; w < owners.length; w++) {
			if (owners[w] === 0) {
				continue;
			}
			for (var j = 0; j < WINDOW_LENGTH; j++) {
				board.removal[windowCells[w * WINDOW_LENGTH + j]] = 1;
			}
		}
	}

	function markLargeGroups(board, minSize) {
		var cells = board.cells;
		var visited = board.visited;
		visited.fill(0);
		for (var start = 0; start < cells.length; start++) {
			if (cells[start] !== 0 && visited[start] === 0) {
				markGroupFrom(board, start, minSize);
			}
		}
	}

	// Breadth-first search over orthogonal same-owner neighbours; the component
	// buffer doubles as the queue.
	function markGroupFrom(board, start, minSize) {
		var size = board.size;
		var cells = board.cells;
		var visited = board.visited;
		var component = board.component;
		var owner = cells[start];
		var count = 1;
		component[0] = start;
		visited[start] = 1;
		for (var head = 0; head < count; head++) {
			var cell = component[head];
			var column = cell % size;
			count = growGroup(board, cell, owner, column > 0, -1, count);
			count = growGroup(board, cell, owner, column < size - 1, 1, count);
			count = growGroup(board, cell, owner, cell >= size, -size, count);
			count = growGroup(board, cell, owner, cell < cells.length - size, size, count);
		}
		if (count >= minSize) {
			for (var i = 0; i < count; i++) {
				board.removal[component[i]] = 1;
			}
		}
	}

	// Appends the neighbour at `offset` to the queue if it joins the group; returns the new count.
	function growGroup(board, cell, owner, inside, offset, count) {
		if (!inside) {
			return count;
		}
		var next = cell + offset;
		if (board.visited[next] !== 0 || board.cells[next] !== owner) {
			return count;
		}
		board.visited[next] = 1;
		board.component[count] = next;
		return count + 1;
	}

	function applyRemovals(board) {
		var removed = 0;
		for (var i = 0; i < board.cells.length; i++) {
			if (board.removal[i] !== 0 && board.cells[i] !== 0) {
				board.cells[i] = 0;
				removed++;
			}
		}
		return removed;
	}

	// One resolution pass on a settled board. Writes points per slot and
	// leaves the board settled toward the gravity edge.
	function resolveBoard(board, rules, gravity, points) {
		detectMatches(board, rules);
		scoreMatches(board, rules, points);
		markRemovals(board, rules);
		var removed = applyRemovals(board);
		settleBoard(board, gravity);
		board.previousOwners.set(board.owners);
		return removed;
	}

	// Places the slot's symbol, settles, and resolves. Mutates `board` only.
	function playOnBoard(board, rules, gravity, cell, slot, points) {
		points.fill(0);
		board.cells[cell] = slot + 1;
		settleBoard(board, gravity);
		return resolveBoard(board, rules, gravity, points);
	}

	// Rebuilds the snapshot from the current board without awarding points.
	function refreshSnapshot(board, rules) {
		detectMatches(board, rules);
		board.previousOwners.set(board.owners);
	}

	function createSlots() {
		var slots = [];
		for (var i = 0; i < MAX_PLAYERS; i++) {
			slots.push({ score: 0, controller: 'human', strategy: '' });
		}
		return slots;
	}

	function createGame(options) {
		var opts = options || {};
		var size = clamp(opts.size || DEFAULT_SIZE, MIN_SIZE, MAX_SIZE);
		var game = {
			board: createBoard(size),
			rules: opts.rules || defaultRules(),
			slots: createSlots(),
			playerCount: clamp(opts.playerCount || DEFAULT_PLAYERS, MIN_PLAYERS, MAX_PLAYERS),
			activeSlot: 0,
			gravity: GRAVITY_DOWN,
			rotatedThisTurn: false,
			turnNumber: 1,
			over: false,
			points: new Int32Array(MAX_PLAYERS)
		};
		return game;
	}

	function emptyCellCount(game) {
		return countEmpty(game.board);
	}

	function isCellEmpty(game, cell) {
		return game.board.cells[cell] === 0;
	}

	function canRotateGravity(game) {
		return !game.over && !game.rotatedThisTurn;
	}

	function rotateGravity(game) {
		if (!canRotateGravity(game)) {
			return false;
		}
		game.gravity = (game.gravity + 1) & 3;
		game.rotatedThisTurn = true;
		return true;
	}

	function canPlaceAt(game, cell) {
		return !game.over && cell >= 0 && cell < game.board.cells.length && isCellEmpty(game, cell);
	}

	// Returns where a newly placed mark will land after stable settling, or -1
	// when the source cell is not a legal placement.
	function placementTarget(game, cell) {
		if (!canPlaceAt(game, cell)) {
			return -1;
		}
		var board = game.board;
		var size = board.size;
		var row = Math.floor(cell / size);
		var column = cell % size;
		var line = game.gravity === GRAVITY_DOWN || game.gravity === GRAVITY_UP ? column : row;
		var distance;
		if (game.gravity === GRAVITY_DOWN) {
			distance = size - 1 - row;
		} else if (game.gravity === GRAVITY_LEFT) {
			distance = column;
		} else if (game.gravity === GRAVITY_UP) {
			distance = row;
		} else {
			distance = size - 1 - column;
		}
		var lineBase = game.gravity * size * size + line * size;
		var occupiedBefore = 0;
		for (var k = 0; k < distance; k++) {
			if (board.cells[board.geometry.lines[lineBase + k]] !== 0) {
				occupiedBefore++;
			}
		}
		return board.geometry.lines[lineBase + occupiedBefore];
	}

	// Returns the turn's removed count, or -1 for an illegal placement.
	function placeMark(game, cell) {
		if (!canPlaceAt(game, cell)) {
			return -1;
		}
		var removed = playOnBoard(game.board, game.rules, game.gravity, cell, game.activeSlot, game.points);
		awardPoints(game);
		finishTurn(game);
		return removed;
	}

	function awardPoints(game) {
		for (var slot = 0; slot < MAX_PLAYERS; slot++) {
			game.slots[slot].score += game.points[slot];
		}
	}

	function finishTurn(game) {
		if (emptyCellCount(game) === 0) {
			game.over = true;
			return;
		}
		game.activeSlot = nextActiveSlot(game, game.activeSlot);
		game.rotatedThisTurn = false;
		game.turnNumber++;
	}

	function nextActiveSlot(game, slot) {
		return (slot + 1) % game.playerCount;
	}

	function setPlayerCount(game, count) {
		game.playerCount = clamp(count, MIN_PLAYERS, MAX_PLAYERS);
		if (game.activeSlot >= game.playerCount) {
			game.activeSlot = 0;
		}
	}

	function setBoardSize(game, size) {
		var nextSize = clamp(size, MIN_SIZE, MAX_SIZE);
		if (nextSize === game.board.size) {
			return;
		}
		var resized = createBoard(nextSize);
		copyOverlap(game.board, resized);
		settleBoard(resized, game.gravity);
		refreshSnapshot(resized, game.rules);
		game.board = resized;
		game.over = emptyCellCount(game) === 0;
	}

	// Keeps the top-left overlap of both boards; cells outside the target are dropped.
	function copyOverlap(source, target) {
		var overlap = Math.min(source.size, target.size);
		for (var y = 0; y < overlap; y++) {
			for (var x = 0; x < overlap; x++) {
				target.cells[y * target.size + x] = source.cells[y * source.size + x];
			}
		}
	}

	function setRule(game, key, value) {
		game.rules[key] = value;
		refreshSnapshot(game.board, game.rules);
	}

	function setSlotController(game, slot, controller, strategy) {
		game.slots[slot].controller = controller;
		game.slots[slot].strategy = strategy || game.slots[slot].strategy;
	}

	function clean(game) {
		var size = game.board.size;
		game.board = createBoard(size);
		game.gravity = GRAVITY_DOWN;
		game.activeSlot = 0;
		game.rotatedThisTurn = false;
		game.turnNumber = 1;
		game.over = false;
		for (var slot = 0; slot < MAX_PLAYERS; slot++) {
			game.slots[slot].score = 0;
		}
	}

	// Ranks active slots by score; returns the slot indices sharing the top score.
	function leadingSlots(game) {
		var leaders = [];
		var best = -1;
		for (var slot = 0; slot < game.playerCount; slot++) {
			var score = game.slots[slot].score;
			if (score > best) {
				best = score;
				leaders.length = 0;
			}
			if (score === best) {
				leaders.push(slot);
			}
		}
		return leaders;
	}

	var api = {
		GRAVITY_DOWN: GRAVITY_DOWN,
		GRAVITY_LEFT: GRAVITY_LEFT,
		GRAVITY_UP: GRAVITY_UP,
		GRAVITY_RIGHT: GRAVITY_RIGHT,
		GRAVITY_NAMES: GRAVITY_NAMES,
		MIN_PLAYERS: MIN_PLAYERS,
		MAX_PLAYERS: MAX_PLAYERS,
		DEFAULT_PLAYERS: DEFAULT_PLAYERS,
		MIN_SIZE: MIN_SIZE,
		MAX_SIZE: MAX_SIZE,
		DEFAULT_SIZE: DEFAULT_SIZE,
		RULE_DEFINITIONS: RULE_DEFINITIONS,
		defaultRules: defaultRules,
		getGeometry: getGeometry,
		createBoard: createBoard,
		copyBoard: copyBoard,
		settleBoard: settleBoard,
		detectMatches: detectMatches,
		playOnBoard: playOnBoard,
		resolveBoard: resolveBoard,
		refreshSnapshot: refreshSnapshot,
		createGame: createGame,
		emptyCellCount: emptyCellCount,
		isCellEmpty: isCellEmpty,
		canRotateGravity: canRotateGravity,
		rotateGravity: rotateGravity,
		canPlaceAt: canPlaceAt,
		placementTarget: placementTarget,
		placeMark: placeMark,
		nextActiveSlot: nextActiveSlot,
		setPlayerCount: setPlayerCount,
		setBoardSize: setBoardSize,
		setRule: setRule,
		setSlotController: setSlotController,
		clean: clean,
		leadingSlots: leadingSlots
	};

	return api;
})();

if (typeof module !== 'undefined') {
	module.exports = GravityModel;
}
