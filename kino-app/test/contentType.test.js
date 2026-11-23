import test from 'node:test'
import assert from 'node:assert/strict'

import { applyContentType } from '../src/lib/contentType.js'

test('all не додає обмежень', () => {
  const p = applyContentType(new URLSearchParams(), 'all')
  assert.equal(p.has('with_genres'), false)
  assert.equal(p.has('without_genres'), false)
})

test('movies виключає анімацію, але лишає обраний жанр', () => {
  const p = new URLSearchParams({ with_genres: '35' })
  applyContentType(p, 'movies')
  assert.equal(p.get('without_genres'), '16')
  assert.equal(p.get('with_genres'), '35')
})

test('animation додає жанр 16 до вже обраного', () => {
  const p = new URLSearchParams({ with_genres: '35' })
  applyContentType(p, 'animation')
  assert.equal(p.get('with_genres'), '35,16')
})

test('animation без жанру дає лише 16', () => {
  const p = applyContentType(new URLSearchParams(), 'animation')
  assert.equal(p.get('with_genres'), '16')
})

test('animation не дублює 16', () => {
  const p = new URLSearchParams({ with_genres: '16' })
  applyContentType(p, 'animation')
  assert.equal(p.get('with_genres'), '16')
})

test('movies додає without_genres незалежно від попереднього вибору', () => {
  const p = new URLSearchParams({ with_genres: '16' })
  applyContentType(p, 'animation')
  applyContentType(p, 'movies')
  assert.equal(p.get('without_genres'), '16')
})
