'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/render.js');

test('renderer keeps the prototype symbol set and page background', () => {
	assert.deepEqual(R.SYMBOLS.slice(0, 4), ['X', 'O', '△', '□']);
	assert.equal(R.BACKGROUND, '#f7f4f8');
	assert.deepEqual(R.PALETTE.slice(0, 4).map(color => color.fill), [
		'#f8dce5',
		'#dcecf8',
		'#dff1e5',
		'#eee2f7'
	]);
});

test('cell hit testing ignores the gravity margin', () => {
	assert.equal(R.cellAt(10, 10, 500, 5), -1);
	assert.equal(R.cellAt(250, 250, 500, 5), 12);
	assert.equal(R.cellAt(490, 490, 500, 5), -1);
});
