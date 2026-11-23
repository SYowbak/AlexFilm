import test from 'node:test'
import assert from 'node:assert/strict'

import { columnsForWidth, computeMoodSpans } from '../src/lib/moodMosaic.js'

test('колонки рахуються з ширини контейнера', () => {
  assert.equal(columnsForWidth(1230, 8.8), 7)
  assert.equal(columnsForWidth(480, 8.8), 3)
})

test('на мобільному завжди дві колонки', () => {
  assert.equal(columnsForWidth(360, 6.4, true), 2)
})

test('19 настроїв у 7 колонок: останній рядок 2+2+1+1+1', () => {
  const spans = computeMoodSpans(19, 7)
  assert.deepEqual(spans.slice(-5), [2, 2, 1, 1, 1])
  assert.equal(spans.slice(-5).reduce((a, b) => a + b, 0), 7)
})

test('один елемент в останньому рядку займає всю ширину', () => {
  const spans = computeMoodSpans(19, 6)
  assert.equal(spans.at(-1), 6)
})

test('повний рядок не змінюється', () => {
  assert.deepEqual(computeMoodSpans(14, 7), new Array(14).fill(1))
})
