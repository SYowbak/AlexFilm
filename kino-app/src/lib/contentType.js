export const ANIMATION_GENRE_ID = 16

export const CONTENT_TYPE_OPTIONS = [
  { value: 'all', label: 'Фільми та мультфільми' },
  { value: 'movies', label: 'Фільми' },
  { value: 'animation', label: 'Мультфільми' },
]

// TMDB не має окремого типу «мультфільм» — це жанр 16.
export function applyContentType(params, contentType) {
  if (contentType === 'movies') {
    params.set('without_genres', String(ANIMATION_GENRE_ID))
  } else if (contentType === 'animation') {
    const ids = (params.get('with_genres') || '').split(',').filter(Boolean)
    if (!ids.includes(String(ANIMATION_GENRE_ID))) ids.push(String(ANIMATION_GENRE_ID))
    params.set('with_genres', ids.join(','))
  }
  return params
}
