import test from 'node:test'
import assert from 'node:assert/strict'

import { columnsForEvenRows } from '../src/lib/moodMosaic.js'

test('18 настроїв у широкому контейнері — 6 колонок по 3 у рядку', () => {
  assert.equal(columnsForEvenRows(18, 1232, 8.8), 6)
})

test('вузький контейнер не робить плитки занадто тісними', () => {
  assert.equal(columnsForEvenRows(18, 800, 8.8), 3)
})

test('на мобільному дві колонки', () => {
  assert.equal(columnsForEvenRows(18, 360, 6.4, true), 2)
})

test('кількість колонок завжди ділить кількість настроїв', () => {
  for (const width of [400, 600, 800, 1000, 1232, 1600]) {
    const columns = columnsForEvenRows(18, width, 8.8)
    assert.equal(18 % columns, 0, `width=${width}, columns=${columns}`)
  }
})
