// Canvas drawing for the board and player swatches. Drawing runs on state changes only.
var GravityRender = (function (M) {
	'use strict';

	var MARGIN_RATIO = 0.09;
	var PALETTE = [
		{ fill: '#f8dce5', ink: '#713347' },
		{ fill: '#dcecf8', ink: '#2e5670' },
		{ fill: '#dff1e5', ink: '#315d41' },
		{ fill: '#eee2f7', ink: '#5e446f' },
		{ fill: '#fff0c7', ink: '#735f20' },
		{ fill: '#f8dec9', ink: '#744a2e' }
	];
	var SYMBOLS = ['X', 'O', '△', '□', '☆', '+'];
	var BACKGROUND = '#f7f4f8';
	var EMPTY_FILL = '#ffffff';
	var GRID_LINE = '#d8d1dc';
	var GRAVITY_COLOR = '#77618b';
	var CURSOR_COLOR = '#3e3448';
	var GHOST_ALPHA = 0.55;
	var DIRECTION_X = [0, -1, 0, 1];
	var DIRECTION_Y = [1, 0, -1, 0];

	function clamp(value, min, max) {
		return value < min ? min : value > max ? max : value;
	}

	function layoutFor(side, size) {
		var margin = side * MARGIN_RATIO;
		var board = side - 2 * margin;
		var cell = board / size;
		return {
			side: side,
			size: size,
			margin: margin,
			board: board,
			cell: cell,
			gap: clamp(cell * 0.1, 3, 7),
			radius: clamp(cell * 0.16, 5, 11)
		};
	}

	// Returns the cell index under a point in CSS pixels, or -1 outside the board.
	function cellAt(x, y, side, size) {
		var layout = layoutFor(side, size);
		var col = Math.floor((x - layout.margin) / layout.cell);
		var row = Math.floor((y - layout.margin) / layout.cell);
		if (col < 0 || row < 0 || col >= size || row >= size) {
			return -1;
		}
		return row * size + col;
	}

	function traceRoundedRect(ctx, x, y, width, height, radius) {
		var r = Math.min(radius, width / 2, height / 2);
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + width - r, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + r);
		ctx.lineTo(x + width, y + height - r);
		ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
		ctx.lineTo(x + r, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}

	function drawTile(ctx, layout, x, y, fill, line) {
		var inset = layout.gap / 2;
		var side = layout.cell - layout.gap;
		traceRoundedRect(ctx, x + inset, y + inset, side, side, layout.radius);
		ctx.fillStyle = fill;
		ctx.fill();
		ctx.strokeStyle = line;
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	function drawSymbol(ctx, slot, cx, cy, radius) {
		ctx.fillStyle = PALETTE[slot].ink;
		ctx.font = '700 ' + Math.round(radius * 2) + 'px "Trebuchet MS", "Segoe UI Symbol", system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(SYMBOLS[slot], cx, cy + radius * 0.04);
	}

	function drawCellFrame(ctx, layout, index, color, lineWidth) {
		var x = layout.margin + (index % layout.size) * layout.cell;
		var y = layout.margin + Math.floor(index / layout.size) * layout.cell;
		var inset = layout.gap / 2 + lineWidth / 2;
		var side = layout.cell - layout.gap - lineWidth;
		traceRoundedRect(ctx, x + inset, y + inset, side, side, layout.radius);
		ctx.strokeStyle = color;
		ctx.lineWidth = lineWidth;
		ctx.stroke();
	}

	function drawCells(ctx, layout, game) {
		var size = layout.size;
		var cells = game.board.cells;
		var cell = layout.cell;
		for (var row = 0; row < size; row++) {
			for (var col = 0; col < size; col++) {
				var owner = cells[row * size + col];
				var x = layout.margin + col * cell;
				var y = layout.margin + row * cell;
				var fill = owner === 0 ? EMPTY_FILL : PALETTE[owner - 1].fill;
				drawTile(ctx, layout, x, y, fill, GRID_LINE);
				if (owner !== 0) {
					drawSymbol(ctx, owner - 1, x + cell / 2, y + cell / 2, cell * 0.28);
				}
			}
		}
	}

	function drawGhost(ctx, layout, game, target) {
		var cell = layout.cell;
		var x = layout.margin + (target % layout.size) * cell;
		var y = layout.margin + Math.floor(target / layout.size) * cell;
		ctx.globalAlpha = GHOST_ALPHA;
		drawTile(ctx, layout, x, y, PALETTE[game.activeSlot].fill, GRID_LINE);
		drawSymbol(ctx, game.activeSlot, x + cell / 2, y + cell / 2, cell * 0.28);
		ctx.globalAlpha = 1;
	}

	function drawHover(ctx, layout, game, view) {
		var source = view.hoverCell;
		if (source < 0 && view.showCursor) {
			source = view.cursorCell;
		}
		if (source >= 0 && view.canPlace) {
			var target = M.placementTarget(game, source);
			if (target >= 0) {
				drawGhost(ctx, layout, game, target);
			}
		}
		if (view.showCursor && view.cursorCell >= 0) {
			drawCellFrame(ctx, layout, view.cursorCell, CURSOR_COLOR, 2.5);
		}
	}

	// Thick bar on the board edge that pieces fall toward, plus an arrow in the margin.
	function drawGravity(ctx, layout, gravity) {
		var dx = DIRECTION_X[gravity];
		var dy = DIRECTION_Y[gravity];
		var bar = clamp(layout.cell * 0.08, 4, 6);
		var x = layout.margin;
		var y = layout.margin;
		var width = layout.board;
		var height = layout.board;
		if (dx !== 0) {
			width = bar;
			x = dx > 0 ? layout.margin + layout.board : layout.margin - bar;
		}
		if (dy !== 0) {
			height = bar;
			y = dy > 0 ? layout.margin + layout.board : layout.margin - bar;
		}
		ctx.fillStyle = GRAVITY_COLOR;
		ctx.fillRect(x, y, width, height);
		drawGravityArrow(ctx, layout, dx, dy);
	}

	function drawGravityArrow(ctx, layout, dx, dy) {
		var px = -dy;
		var py = dx;
		var reach = layout.margin * 0.34;
		var cx = layout.side / 2 + dx * (layout.board / 2 + layout.margin / 2);
		var cy = layout.side / 2 + dy * (layout.board / 2 + layout.margin / 2);
		ctx.beginPath();
		ctx.moveTo(cx + dx * reach, cy + dy * reach);
		ctx.lineTo(cx - dx * reach * 0.6 + px * reach * 0.8, cy - dy * reach * 0.6 + py * reach * 0.8);
		ctx.lineTo(cx - dx * reach * 0.6 - px * reach * 0.8, cy - dy * reach * 0.6 - py * reach * 0.8);
		ctx.closePath();
		ctx.fillStyle = GRAVITY_COLOR;
		ctx.fill();
	}

	function drawFullOverlay(ctx, layout) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.74)';
		ctx.fillRect(layout.margin, layout.margin, layout.board, layout.board);
		ctx.fillStyle = CURSOR_COLOR;
		ctx.font = '700 ' + Math.round(clamp(layout.cell * 0.68, 18, 36)) + 'px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('Board full', layout.side / 2, layout.side / 2);
	}

	function drawBoard(ctx, side, game, view) {
		var layout = layoutFor(side, game.board.size);
		ctx.fillStyle = BACKGROUND;
		ctx.fillRect(0, 0, side, side);
		drawCells(ctx, layout, game);
		drawGravity(ctx, layout, game.gravity);
		if (game.over) {
			drawFullOverlay(ctx, layout);
		} else {
			drawHover(ctx, layout, game, view);
		}
	}

	// Sizes the backing store to device pixels so lines stay crisp on high-DPI screens.
	function prepareContext(canvas) {
		var dpr = window.devicePixelRatio || 1;
		var side = canvas.clientWidth;
		var pixels = Math.round(side * dpr);
		if (canvas.width !== pixels) {
			canvas.width = pixels;
			canvas.height = pixels;
		}
		var ctx = canvas.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		return { ctx: ctx, side: side };
	}

	function renderBoard(canvas, game, view) {
		var prepared = prepareContext(canvas);
		drawBoard(prepared.ctx, prepared.side, game, view);
	}

	// Draws a player's symbol on its pastel tile, for the scoreboard.
	function renderSwatch(canvas, slot) {
		var prepared = prepareContext(canvas);
		var ctx = prepared.ctx;
		var side = prepared.side;
		ctx.clearRect(0, 0, side, side);
		traceRoundedRect(ctx, 0.5, 0.5, side - 1, side - 1, side * 0.24);
		ctx.fillStyle = PALETTE[slot].fill;
		ctx.fill();
		ctx.strokeStyle = GRID_LINE;
		ctx.stroke();
		drawSymbol(ctx, slot, side / 2, side / 2, side * 0.28);
	}

	var api = {
		PALETTE: PALETTE,
		SYMBOLS: SYMBOLS,
		BACKGROUND: BACKGROUND,
		cellAt: cellAt,
		renderBoard: renderBoard,
		renderSwatch: renderSwatch
	};
	return api;
})(typeof module !== 'undefined' ? require('./model.js') : GravityModel);

if (typeof module !== 'undefined') {
	module.exports = GravityRender;
}
