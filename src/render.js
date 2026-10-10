// Canvas drawing for the board and the player swatches. Drawing runs on state changes only.
var GravityRender = (function (M) {
	'use strict';

	var MARGIN_RATIO = 0.1;
	var PALETTE = [
		{ fill: '#ffc8d4', ink: '#8c2f4b' },
		{ fill: '#ffe2b8', ink: '#8a5216' },
		{ fill: '#fff3a3', ink: '#6d5d08' },
		{ fill: '#bff0cf', ink: '#1f6b43' },
		{ fill: '#bfe3ff', ink: '#1f5a8a' },
		{ fill: '#dcc8ff', ink: '#5b3a92' }
	];
	var SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross'];
	var BACKGROUND = '#f4f6fb';
	var EMPTY_FILL = '#ffffff';
	var GRID_LINE = '#cfd6e4';
	var GRAVITY_COLOR = '#f2a900';
	var CURSOR_COLOR = '#2b3a55';
	var GHOST_ALPHA = 0.35;
	var DIRECTION_X = [0, -1, 0, 1];
	var DIRECTION_Y = [1, 0, -1, 0];
	var STAR_POINTS = 5;

	function layoutFor(side, size) {
		var margin = side * MARGIN_RATIO;
		var board = side - 2 * margin;
		return { side: side, size: size, margin: margin, board: board, cell: board / size };
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

	function tracePath(ctx, shape, cx, cy, r) {
		ctx.beginPath();
		if (shape === 'circle') {
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
		} else if (shape === 'square') {
			ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
		} else if (shape === 'triangle') {
			ctx.moveTo(cx, cy - r);
			ctx.lineTo(cx + r * 0.9, cy + r * 0.7);
			ctx.lineTo(cx - r * 0.9, cy + r * 0.7);
		} else if (shape === 'diamond') {
			ctx.moveTo(cx, cy - r);
			ctx.lineTo(cx + r, cy);
			ctx.lineTo(cx, cy + r);
			ctx.lineTo(cx - r, cy);
		} else if (shape === 'star') {
			traceStar(ctx, cx, cy, r);
		} else {
			tracePlus(ctx, cx, cy, r);
		}
		ctx.closePath();
	}

	function traceStar(ctx, cx, cy, r) {
		var steps = STAR_POINTS * 2;
		for (var i = 0; i < steps; i++) {
			var radius = i % 2 === 0 ? r : r * 0.45;
			var angle = -Math.PI / 2 + (i * Math.PI) / STAR_POINTS;
			var x = cx + Math.cos(angle) * radius;
			var y = cy + Math.sin(angle) * radius;
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
	}

	function tracePlus(ctx, cx, cy, r) {
		var arm = r * 0.36;
		ctx.moveTo(cx - arm, cy - r);
		ctx.lineTo(cx + arm, cy - r);
		ctx.lineTo(cx + arm, cy - arm);
		ctx.lineTo(cx + r, cy - arm);
		ctx.lineTo(cx + r, cy + arm);
		ctx.lineTo(cx + arm, cy + arm);
		ctx.lineTo(cx + arm, cy + r);
		ctx.lineTo(cx - arm, cy + r);
		ctx.lineTo(cx - arm, cy + arm);
		ctx.lineTo(cx - r, cy + arm);
		ctx.lineTo(cx - r, cy - arm);
		ctx.lineTo(cx - arm, cy - arm);
	}

	function drawSymbol(ctx, slot, cx, cy, r) {
		tracePath(ctx, SHAPES[slot], cx, cy, r);
		ctx.fillStyle = PALETTE[slot].ink;
		ctx.fill();
	}

	function drawCellFrame(ctx, x, y, cell, color, lineWidth) {
		ctx.strokeStyle = color;
		ctx.lineWidth = lineWidth;
		ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
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
				ctx.fillStyle = owner === 0 ? EMPTY_FILL : PALETTE[owner - 1].fill;
				ctx.fillRect(x, y, cell, cell);
				ctx.strokeStyle = GRID_LINE;
				ctx.lineWidth = 1;
				ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
				if (owner !== 0) {
					drawSymbol(ctx, owner - 1, x + cell / 2, y + cell / 2, cell * 0.32);
				}
			}
		}
	}

	function cellCenter(layout, index, axis) {
		var along = index % layout.size;
		var across = Math.floor(index / layout.size);
		return layout.margin + (axis === 0 ? along : across) * layout.cell + layout.cell / 2;
	}

	function drawHover(ctx, layout, game, view) {
		var hover = view.hoverCell;
		if (hover >= 0 && M.isCellEmpty(game, hover) && view.canPlace) {
			ctx.globalAlpha = GHOST_ALPHA;
			drawSymbol(ctx, game.activeSlot, cellCenter(layout, hover, 0), cellCenter(layout, hover, 1), layout.cell * 0.32);
			ctx.globalAlpha = 1;
		}
		if (view.showCursor && view.cursorCell >= 0) {
			var x = layout.margin + (view.cursorCell % layout.size) * layout.cell;
			var y = layout.margin + Math.floor(view.cursorCell / layout.size) * layout.cell;
			drawCellFrame(ctx, x, y, layout.cell, CURSOR_COLOR, 2.5);
		}
	}

	// Thick bar on the board edge that pieces fall toward, plus an arrow in the margin.
	function drawGravity(ctx, layout, gravity) {
		var dx = DIRECTION_X[gravity];
		var dy = DIRECTION_Y[gravity];
		var bar = 4;
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
		var reach = layout.margin * 0.36;
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
		ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		ctx.fillRect(layout.margin, layout.margin, layout.board, layout.board);
		ctx.fillStyle = CURSOR_COLOR;
		ctx.font = '600 ' + Math.round(layout.cell * 0.7) + 'px system-ui, sans-serif';
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
		ctx.fillStyle = PALETTE[slot].fill;
		ctx.fillRect(0, 0, side, side);
		drawSymbol(ctx, slot, side / 2, side / 2, side * 0.32);
	}

	var api = {
		PALETTE: PALETTE,
		SHAPES: SHAPES,
		cellAt: cellAt,
		renderBoard: renderBoard,
		renderSwatch: renderSwatch
	};
	return api;
})(typeof module !== 'undefined' ? require('./model.js') : GravityModel);

if (typeof module !== 'undefined') {
	module.exports = GravityRender;
}
