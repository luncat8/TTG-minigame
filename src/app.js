// Page wiring: settings controls, board input, bot scheduling, and status text.
(function () {
	'use strict';

	var BOT_DELAY_MS = 450;
	var HUMAN = 'human';
	var BOT = 'bot';
	var GRAVITY_LABELS = ['Down ↓', 'Left ←', 'Up ↑', 'Right →'];

	var game = GravityModel.createGame({});
	var view = { hoverCell: -1, cursorCell: 0, showCursor: false, canPlace: false };
	var pendingBotTimer = 0;
	var pendingBotMove = null;
	var el = {};
	var slotRows = [];

	function $(id) {
		return document.getElementById(id);
	}

	function slotName(slot) {
		return 'Player ' + (slot + 1);
	}

	function strategyLabel(id) {
		return GravityBots.findStrategy(id).label;
	}

	function isHumanTurn() {
		return !game.over && game.slots[game.activeSlot].controller === HUMAN;
	}

	function fillSelect(select, options) {
		select.textContent = '';
		for (var i = 0; i < options.length; i++) {
			var option = document.createElement('option');
			option.value = options[i].value;
			option.textContent = options[i].label;
			select.appendChild(option);
		}
	}

	function numberOptions(min, max) {
		var options = [];
		for (var n = min; n <= max; n++) {
			options.push({ value: String(n), label: String(n) });
		}
		return options;
	}

	function buildSettings() {
		fillSelect(el.playerCount, numberOptions(GravityModel.MIN_PLAYERS, GravityModel.MAX_PLAYERS));
		fillSelect(el.boardSize, numberOptions(GravityModel.MIN_SIZE, GravityModel.MAX_SIZE));
		el.playerCount.value = String(game.playerCount);
		el.boardSize.value = String(game.board.size);
		el.playerCount.addEventListener('change', onPlayerCountChange);
		el.boardSize.addEventListener('change', onBoardSizeChange);
	}

	function buildRules() {
		var definitions = GravityModel.RULE_DEFINITIONS;
		for (var i = 0; i < definitions.length; i++) {
			addRuleCheckbox(definitions[i]);
		}
	}

	function addRuleCheckbox(definition) {
		var label = document.createElement('label');
		var box = document.createElement('input');
		box.type = 'checkbox';
		box.checked = game.rules[definition.key];
		box.addEventListener('change', function () {
			onRuleChange(definition.key, box.checked);
		});
		label.appendChild(box);
		label.appendChild(document.createTextNode(' ' + definition.label));
		el.rules.appendChild(label);
	}

	function buildSlotRows() {
		var controllerOptions = [{ value: HUMAN, label: 'Human' }, { value: BOT, label: 'Bot' }];
		var strategyOptions = GravityBots.STRATEGIES.map(function (s) {
			return { value: s.id, label: s.label };
		});
		for (var slot = 0; slot < GravityModel.MAX_PLAYERS; slot++) {
			slotRows.push(buildSlotRow(slot, controllerOptions, strategyOptions));
		}
	}

	function buildSlotRow(slot, controllerOptions, strategyOptions) {
		var row = document.createElement('div');
		row.className = 'player-row';
		row.setAttribute('role', 'listitem');

		var swatch = document.createElement('canvas');
		swatch.className = 'swatch';
		swatch.setAttribute('aria-hidden', 'true');

		var identity = document.createElement('div');
		var name = document.createElement('strong');
		name.className = 'player-name';
		name.textContent = slotName(slot);
		var score = document.createElement('span');
		score.className = 'score';
		identity.appendChild(name);
		identity.appendChild(score);

		var controllerSelect = document.createElement('select');
		controllerSelect.setAttribute('aria-label', slotName(slot) + ' controller');
		fillSelect(controllerSelect, controllerOptions);

		var strategySelect = document.createElement('select');
		strategySelect.setAttribute('aria-label', slotName(slot) + ' bot strategy');
		fillSelect(strategySelect, strategyOptions);

		var controls = document.createElement('div');
		controls.className = 'player-controls';
		controls.appendChild(labeledSelect('Controller', controllerSelect));
		controls.appendChild(labeledSelect('Strategy', strategySelect));

		var onSlotChange = function () {
			onControllerChange(slot, controllerSelect.value, strategySelect.value);
		};
		controllerSelect.addEventListener('change', onSlotChange);
		strategySelect.addEventListener('change', onSlotChange);

		row.appendChild(swatch);
		row.appendChild(identity);
		row.appendChild(controls);
		el.slots.appendChild(row);
		// Drawn after attaching so the canvas has its CSS size.
		GravityRender.renderSwatch(swatch, slot);
		return { row: row, controller: controllerSelect, strategy: strategySelect, score: score };
	}

	function labeledSelect(caption, select) {
		var label = document.createElement('label');
		var text = document.createElement('span');
		text.textContent = caption;
		label.appendChild(text);
		label.appendChild(select);
		return label;
	}

	function updateSlotRows() {
		for (var slot = 0; slot < GravityModel.MAX_PLAYERS; slot++) {
			updateSlotRow(slot);
		}
	}

	function updateSlotRow(slot) {
		var state = game.slots[slot];
		var rowView = slotRows[slot];
		var active = slot < game.playerCount;
		var isActive = active && !game.over && game.activeSlot === slot;
		rowView.row.classList.toggle('inactive', !active);
		rowView.row.classList.toggle('on-turn', isActive);
		rowView.controller.value = state.controller;
		rowView.controller.disabled = !active;
		rowView.strategy.value = state.strategy || GravityBots.DEFAULT_STRATEGY_ID;
		rowView.strategy.disabled = !active || state.controller !== BOT;
		var points = state.score + (state.score === 1 ? ' point' : ' points');
		rowView.score.textContent = active ? points : points + ' · inactive';
	}

	function updateRuleBoxes() {
		var boxes = el.rules.querySelectorAll('input');
		var definitions = GravityModel.RULE_DEFINITIONS;
		for (var i = 0; i < boxes.length; i++) {
			boxes[i].checked = game.rules[definitions[i].key];
		}
	}

	function gravityText() {
		return GravityModel.GRAVITY_NAMES[game.gravity];
	}

	function activePlayerText() {
		return GravityRender.SYMBOLS[game.activeSlot] + ' · ' + slotName(game.activeSlot);
	}

	function statusText() {
		if (game.over) {
			return gameOverText();
		}
		var slot = game.slots[game.activeSlot];
		var turn = activePlayerText();
		if (slot.controller === BOT) {
			return turn + ' is thinking with ' + strategyLabel(slot.strategy) + '.';
		}
		if (game.rotatedThisTurn) {
			return turn + ' · Gravity now falls ' + gravityText() + '. Place a mark.';
		}
		if (game.rules.rotateGravityEachTurn) {
			return turn + ' · Gravity falls ' + gravityText() + ' now and rotates again after this turn. Place a mark.';
		}
		return turn + ' · Place a mark, or rotate gravity once.';
	}

	function gameOverText() {
		var leaders = GravityModel.leadingSlots(game);
		var score = game.slots[leaders[0]].score;
		var names = leaders.map(slotName).join(' and ');
		if (leaders.length === 1) {
			return 'Game over. ' + names + ' wins with ' + score + ' points. Press Clean to play again.';
		}
		return 'Game over. Tie between ' + names + ' at ' + score + ' points. Press Clean to play again.';
	}

	function updateGravityControls() {
		var nextGravity = (game.gravity + 1) & 3;
		el.gravityReadout.textContent = 'Gravity ' + GRAVITY_LABELS[game.gravity];
		el.rotate.textContent = game.rotatedThisTurn
			? 'Gravity rotated'
			: 'Rotate to ' + GRAVITY_LABELS[nextGravity];
		el.rotate.disabled = !isHumanTurn() || game.rotatedThisTurn;
	}

	function renderBoard() {
		view.canPlace = isHumanTurn();
		GravityRender.renderBoard(el.board, game, view);
	}

	function renderAll() {
		renderBoard();
		el.status.textContent = statusText();
		updateSlotRows();
		updateRuleBoxes();
		updateGravityControls();
	}

	// Every state change renders and then lets the next bot turn start.
	function refresh() {
		renderAll();
		scheduleBotTurn();
	}

	function cancelBotTurn() {
		clearTimeout(pendingBotTimer);
		pendingBotTimer = 0;
		pendingBotMove = null;
	}

	function scheduleBotTurn() {
		if (pendingBotTimer !== 0 || game.over) {
			return;
		}
		if (game.slots[game.activeSlot].controller !== BOT) {
			return;
		}
		pendingBotTimer = setTimeout(runBotTurn, BOT_DELAY_MS);
	}

	// A bot that rotates shows the new gravity first, then places after a short pause.
	function runBotTurn() {
		pendingBotTimer = 0;
		if (game.over) {
			return;
		}
		var slot = game.slots[game.activeSlot];
		var move = GravityBots.chooseMove(game, slot.strategy);
		if (move.rotate) {
			GravityModel.rotateGravity(game);
			pendingBotMove = move;
			renderAll();
			pendingBotTimer = setTimeout(placeBotMove, BOT_DELAY_MS);
			return;
		}
		GravityModel.placeMark(game, move.cell);
		refresh();
	}

	function placeBotMove() {
		pendingBotTimer = 0;
		var move = pendingBotMove;
		pendingBotMove = null;
		if (move) {
			GravityModel.placeMark(game, move.cell);
		}
		refresh();
	}

	function placeHuman(cell) {
		if (!isHumanTurn() || !GravityModel.canPlaceAt(game, cell)) {
			return;
		}
		GravityModel.placeMark(game, cell);
		refresh();
	}

	function rotateHuman() {
		if (!isHumanTurn()) {
			return;
		}
		if (GravityModel.rotateGravity(game)) {
			refresh();
		}
	}

	function onPlayerCountChange() {
		cancelBotTurn();
		GravityModel.setPlayerCount(game, Number(el.playerCount.value));
		refresh();
	}

	function onBoardSizeChange() {
		cancelBotTurn();
		GravityModel.setBoardSize(game, Number(el.boardSize.value));
		view.cursorCell = Math.min(view.cursorCell, game.board.cells.length - 1);
		refresh();
	}

	function onRuleChange(key, value) {
		cancelBotTurn();
		GravityModel.setRule(game, key, value);
		refresh();
	}

	function onControllerChange(slot, controller, strategy) {
		cancelBotTurn();
		GravityModel.setSlotController(game, slot, controller, strategy);
		refresh();
	}

	function onClean() {
		cancelBotTurn();
		GravityModel.clean(game);
		refresh();
	}

	function pointerCell(event) {
		var rect = el.board.getBoundingClientRect();
		return GravityRender.cellAt(event.clientX - rect.left, event.clientY - rect.top, el.board.clientWidth, game.board.size);
	}

	function onBoardPointerMove(event) {
		view.hoverCell = pointerCell(event);
		renderBoard();
	}

	function onBoardPointerLeave() {
		view.hoverCell = -1;
		renderBoard();
	}

	function onBoardClick(event) {
		placeHuman(pointerCell(event));
	}

	var ROW_STEPS = { ArrowUp: -1, ArrowDown: 1 };
	var COLUMN_STEPS = { ArrowLeft: -1, ArrowRight: 1 };

	function moveCursor(key) {
		var size = game.board.size;
		var col = view.cursorCell % size;
		var row = Math.floor(view.cursorCell / size);
		if (ROW_STEPS[key]) {
			row = clampIndex(row + ROW_STEPS[key], size);
		} else {
			col = clampIndex(col + COLUMN_STEPS[key], size);
		}
		view.cursorCell = row * size + col;
	}

	function clampIndex(value, size) {
		return value < 0 ? 0 : value >= size ? size - 1 : value;
	}

	function onBoardKeyDown(event) {
		var key = event.key;
		if (ROW_STEPS[key] || COLUMN_STEPS[key]) {
			event.preventDefault();
			moveCursor(key);
			renderBoard();
		} else if (key === 'Enter' || key === ' ') {
			event.preventDefault();
			placeHuman(view.cursorCell);
		} else if (key === 'r' || key === 'R') {
			rotateHuman();
		}
	}

	function onBoardFocus() {
		view.showCursor = true;
		renderBoard();
	}

	function onBoardBlur() {
		view.showCursor = false;
		renderBoard();
	}

	function bindEvents() {
		el.rotate.addEventListener('click', rotateHuman);
		el.clean.addEventListener('click', onClean);
		el.board.addEventListener('click', onBoardClick);
		el.board.addEventListener('pointermove', onBoardPointerMove);
		el.board.addEventListener('pointerleave', onBoardPointerLeave);
		el.board.addEventListener('keydown', onBoardKeyDown);
		el.board.addEventListener('focus', onBoardFocus);
		el.board.addEventListener('blur', onBoardBlur);
		window.addEventListener('resize', renderBoard);
	}

	function init() {
		el.board = $('board');
		el.status = $('status');
		el.gravityReadout = $('gravity-readout');
		el.rotate = $('rotate');
		el.clean = $('clean');
		el.playerCount = $('player-count');
		el.boardSize = $('board-size');
		el.rules = $('rules');
		el.slots = $('slots');
		buildSettings();
		buildRules();
		buildSlotRows();
		bindEvents();
		refresh();
	}

	init();
})();
