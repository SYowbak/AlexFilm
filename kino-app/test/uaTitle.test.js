import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveUkrainianTitle } from '../src/lib/uaTitle.js'

test('канонічна uk-UA назва не перезаписується латинською альтернативою', () => {
  assert.equal(
    resolveUkrainianTitle('Бійцівський клуб', undefined, 'Biytsivsʹkyy klub'),
    'Бійцівський клуб'
  )
})

test('кирилична альтернатива замінює англійську назву', () => {
  assert.equal(
    resolveUkrainianTitle('Fight Club', null, 'Бійцівський клуб'),
    'Бійцівський клуб'
  )
})

test('латинська альтернатива не замінює англійську назву', () => {
  assert.equal(
    resolveUkrainianTitle('Fight Club', 'Biytsivsʹkyy klub'),
    'Fight Club'
  )
})

test('прокатна кирилична назва має пріоритет перед альтернативною', () => {
  assert.equal(
    resolveUkrainianTitle('', 'Кінотеатральна назва', 'Інша назва'),
    'Кінотеатральна назва'
  )
})

test('порожні кандидати не псують назву', () => {
  assert.equal(resolveUkrainianTitle('Українська назва', '  ', null), 'Українська назва')
})
