/**
 * Тести логіки резервних embed-джерел.
 * Запуск: npm test (kino-app)
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GLOBAL_FALLBACK_ORDER,
  GLOBAL_EMBED_HOSTS,
  nextFallbackSource,
  buildEmbedUrl,
  buildEmbedIframeAttributes,
  isEmbedPlayerAlive,
} from '../src/lib/embedFallback.js'

// ─── nextFallbackSource ───────────────────────────────────────────

test('nextFallbackSource йде по ланцюжку і повертає наступне джерело', () => {
  assert.equal(nextFallbackSource(GLOBAL_FALLBACK_ORDER, 'vidsrcme'), 'twoembed')
  assert.equal(nextFallbackSource(GLOBAL_FALLBACK_ORDER, 'twoembed'), 'vidsrcbuzz')
  assert.equal(nextFallbackSource(GLOBAL_FALLBACK_ORDER, 'vidsrcbuzz'), 'vidsrc2')
})

test('nextFallbackSource повертає null наприкінці ланцюжка (джерел не лишилось)', () => {
  assert.equal(nextFallbackSource(GLOBAL_FALLBACK_ORDER, 'vidsrc2'), null)
})

test('nextFallbackSource для невідомого джерела починає з першого', () => {
  assert.equal(nextFallbackSource(GLOBAL_FALLBACK_ORDER, 'ua_stream'), 'vidsrcme')
  assert.equal(nextFallbackSource(GLOBAL_FALLBACK_ORDER, null), 'vidsrcme')
  assert.equal(nextFallbackSource(GLOBAL_FALLBACK_ORDER, undefined), 'vidsrcme')
})

test('nextFallbackSource не зациклюється на порожньому списку', () => {
  assert.equal(nextFallbackSource([], 'vidsrcme'), null)
  assert.equal(nextFallbackSource(null, 'vidsrcme'), null)
})

test('ланцюжок відкату не містить мертвих доменів (vidsrc.net припаркований)', () => {
  assert.ok(!GLOBAL_FALLBACK_ORDER.includes('vidsrcnet'))
  assert.ok(!GLOBAL_EMBED_HOSTS.includes('vidsrc.net'))
})

// ─── buildEmbedUrl ───────────────────────────────────────────────

test('buildEmbedUrl будує URL фільму за TMDB ID', () => {
  assert.equal(
    buildEmbedUrl('vidsrcme', { tmdbId: '1219063', type: 'movie' }),
    'https://vidsrc.me/embed/movie?tmdb=1219063'
  )
  assert.equal(
    buildEmbedUrl('twoembed', { tmdbId: '1219063', type: 'movie' }),
    'https://www.2embed.cc/embed/1219063'
  )
  assert.equal(
    buildEmbedUrl('vidsrcbuzz', { tmdbId: '1219063', type: 'movie' }),
    'https://vidsrc.buzz/embed/movie/1219063'
  )
  assert.equal(
    buildEmbedUrl('vidsrc2', { tmdbId: '1219063', type: 'movie' }),
    'https://www.2embed.skin/embed/1219063'
  )
})

test('buildEmbedUrl будує URL серіалу з сезоном і серією', () => {
  assert.equal(
    buildEmbedUrl('vidsrcme', { tmdbId: '1399', type: 'series', season: 2, episode: 5 }),
    'https://vidsrc.me/embed/tv?tmdb=1399&season=2&episode=5'
  )
  assert.equal(
    buildEmbedUrl('twoembed', { tmdbId: '1399', type: 'series', season: 2, episode: 5 }),
    'https://www.2embed.cc/embedtv/1399&s=2&e=5'
  )
  assert.equal(
    buildEmbedUrl('vidsrcbuzz', { tmdbId: '1399', type: 'series', season: 2, episode: 5 }),
    'https://vidsrc.buzz/embed/tv/1399/2/5'
  )
})

test('buildEmbedUrl відкидає порожній, нечисловий і невідомий TMDB ID', () => {
  assert.equal(buildEmbedUrl('vidsrcme', { tmdbId: '', type: 'movie' }), null)
  assert.equal(buildEmbedUrl('vidsrcme', { tmdbId: null, type: 'movie' }), null)
  assert.equal(buildEmbedUrl('vidsrcme', { type: 'movie' }), null)
  assert.equal(buildEmbedUrl('vidsrcme', { tmdbId: '12abc', type: 'movie' }), null)
  assert.equal(buildEmbedUrl('vidsrcme', { tmdbId: '12/../../evil', type: 'movie' }), null)
  assert.equal(buildEmbedUrl('unknown_source', { tmdbId: '1219063', type: 'movie' }), null)
})

test('buildEmbedUrl за замовчуванням бере 1 сезон і 1 серію', () => {
  assert.equal(
    buildEmbedUrl('vidsrcme', { tmdbId: '1399', type: 'series' }),
    'https://vidsrc.me/embed/tv?tmdb=1399&season=1&episode=1'
  )
})

// ─── buildEmbedIframeAttributes ──────────────────────────────────

test('embed-iframe НЕ має атрибута sandbox (vidsrc.sh інакше віддає 403)', () => {
  const attrs = buildEmbedIframeAttributes()
  assert.equal(Object.prototype.hasOwnProperty.call(attrs, 'sandbox'), false)
  assert.ok(!Object.values(attrs).some(v => String(v).includes('sandbox')))
})

test('embed-iframe має allow, referrerpolicy і безпечні рамкові атрибути', () => {
  const attrs = buildEmbedIframeAttributes()
  assert.match(attrs.allow, /autoplay/)
  assert.match(attrs.allow, /fullscreen/)
  assert.equal(attrs.referrerpolicy, 'no-referrer')
  assert.equal(attrs.scrolling, 'no')
  assert.equal(attrs.frameborder, '0')
})

// ─── isEmbedPlayerAlive ──────────────────────────────────────────

test('isEmbedPlayerAlive: сторінка без вкладених фреймів — плеєр не створився', () => {
  assert.equal(isEmbedPlayerAlive(0), false)
  assert.equal(isEmbedPlayerAlive(undefined), false)
  assert.equal(isEmbedPlayerAlive(null), false)
  assert.equal(isEmbedPlayerAlive(NaN), false)
})

test('isEmbedPlayerAlive: вкладені фрейми є — embed живий', () => {
  assert.equal(isEmbedPlayerAlive(1), true)
  assert.equal(isEmbedPlayerAlive(2), true)
  assert.equal(isEmbedPlayerAlive(3), true)
})
