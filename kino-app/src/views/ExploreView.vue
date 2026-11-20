<template>
  <section class="explore-page">
    <!-- Header Toolbar -->
    <div class="explore-toolbar">
      <div>
        <p class="eyebrow">ІНТЕРАКТИВНЕ ДОСЛІДЖЕННЯ</p>
        <h1>Нічого дивитися?</h1>
        <p class="muted">
          Величезна галактика кіно. Водіть курсором — лінза фокусується на фільмі під мишею. Клікніть, щоб переглянути деталі та трейлер.
        </p>
      </div>
      <div class="toolbar-actions">
        <!-- Genre Dropdown Select -->
        <div class="genre-select-wrapper">
          <label class="sr-only" for="genre-select">Жанр фільму</label>
          <select
            id="genre-select"
            class="genre-dropdown"
            :value="selectedGenreId === null ? '' : selectedGenreId"
            @change="onGenreSelectChange"
          >
            <option value="">🎬 Усі жанри</option>
            <option v-for="g in genresList" :key="g.id" :value="g.id">
              {{ g.name }}
            </option>
          </select>
          <span class="dropdown-chevron">▼</span>
        </div>

        <button
          class="btn-outline-neon explore-action-btn"
          @click="refreshMovies"
          :disabled="loading"
          title="Завантажити іншу добірку фільмів"
        >
          <span :class="{ 'animate-spin': loading }">🔄</span>
          <span>Оновити<span class="hidden sm:inline"> фільми</span></span>
        </button>
        <button class="btn-neon explore-action-btn" @click="pickRandomMovie">
          🎲 <span>Випадковий<span class="hidden sm:inline"> фільм</span></span>
        </button>
      </div>
    </div>

    <!-- Main Interactive Stage -->
    <div
      class="explore-stage"
      ref="stageEl"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
      @mouseenter="onMouseEnter"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @wheel.prevent="onWheel"
    >
      <canvas ref="canvasEl"></canvas>

      <!-- Loading State -->
      <div v-if="loading" class="stage-loader">
        <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-neon mb-3"></div>
        <span>Завантажуємо фільми…</span>
      </div>

      <div v-else-if="error" class="stage-state error">
        {{ error }}
      </div>

      <!-- Left Film Details Panel (aligned to top, with embedded trailer) -->
      <Transition name="panel-slide">
        <div
          v-if="selectedMovie"
          class="film-details-panel"
          @click.stop
          @mousedown.stop
          @mouseup.stop
          @touchstart.stop
          @touchend.stop
        >
          <!-- Backdrop background glow -->
          <div
            v-if="selectedMovie.backdrop_path"
            class="panel-backdrop"
            :style="{
              backgroundImage: `url(${tmdbApi.getImageUrl(selectedMovie.backdrop_path, 'w780')})`
            }"
          ></div>
          <div class="panel-backdrop-overlay"></div>

          <button class="panel-close-btn" @click="closeDetails" title="Закрити">
            ✕
          </button>

          <div class="panel-inner">
            <!-- Trailer or Backdrop Media at top -->
            <div class="panel-media-top">
              <div v-if="trailerKey" class="trailer-wrapper">
                <iframe
                  :src="`https://www.youtube-nocookie.com/embed/${trailerKey}?rel=0`"
                  title="Трейлер"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                ></iframe>
              </div>
              <div
                v-else-if="selectedMovie.backdrop_path"
                class="media-hero-img"
              >
                <img :src="tmdbApi.getImageUrl(selectedMovie.backdrop_path, 'w780')" :alt="selectedMovie.title">
              </div>
            </div>

            <!-- Content below media -->
            <div class="panel-content-body">
              <p v-if="selectedMovieDetails?.tagline" class="panel-tagline">
                "{{ selectedMovieDetails.tagline }}"
              </p>

              <h2 class="panel-title">
                {{ selectedMovie.title }}
                <span class="panel-year">({{ movieYear(selectedMovie) }})</span>
              </h2>

              <!-- Genre badges -->
              <div class="panel-genres">
                <template v-if="selectedMovieDetails?.genres?.length">
                  <span
                    v-for="g in selectedMovieDetails.genres"
                    :key="g.id"
                    class="genre-pill"
                  >
                    {{ g.name }}
                  </span>
                </template>
                <template v-else-if="selectedMovie.genre_ids?.length">
                  <span
                    v-for="gid in selectedMovie.genre_ids.slice(0, 4)"
                    :key="gid"
                    class="genre-pill"
                  >
                    {{ genreMap[gid] || gid }}
                  </span>
                </template>
              </div>

              <!-- Score Row -->
              <div class="panel-score-row">
                <div class="score-circle" :class="scoreClass(selectedMovie.vote_average)">
                  <svg viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" class="circle-bg" />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      class="circle-fg"
                      :stroke-dasharray="`${scorePercent(selectedMovie.vote_average)} 100`"
                    />
                  </svg>
                  <span class="circle-text">{{ scorePercent(selectedMovie.vote_average) }}%</span>
                </div>
                <div class="score-info">
                  <span class="score-title">TMDB SCORE</span>
                  <span class="score-sub">{{ selectedMovie.vote_count }} голосів</span>
                </div>
                <div v-if="selectedMovieDetails?.runtime" class="score-runtime">
                  🕐 {{ formatRuntime(selectedMovieDetails.runtime) }}
                </div>
              </div>

              <!-- Overview -->
              <p class="panel-overview">
                {{ selectedMovieDetails?.overview || selectedMovie.overview || 'Опис українською мовою поки що відсутній.' }}
              </p>

              <!-- Action buttons -->
              <div class="panel-actions">
                <button
                  class="act-btn act-primary"
                  @click="goToMovie(selectedMovie.id)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Сторінка фільму
                </button>

                <a
                  class="act-btn"
                  :href="`https://www.themoviedb.org/movie/${selectedMovie.id}`"
                  target="_blank"
                  rel="noopener"
                >
                  TMDB
                </a>

                <a
                  v-if="selectedMovieDetails?.external_ids?.imdb_id"
                  class="act-btn"
                  :href="`https://www.imdb.com/title/${selectedMovieDetails.external_ids.imdb_id}`"
                  target="_blank"
                  rel="noopener"
                >
                  IMDb
                </a>

                <button
                  class="act-btn act-icon"
                  @click="toggleFavorite(selectedMovieDetails || selectedMovie)"
                  :title="favoriteTitle(isFavorite)"
                >
                  {{ isFavorite ? '❤️' : '🤍' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Bottom Hint -->
      <div class="stage-hint-bar">
        <span>🔍 Водіть мишею по мозаїці · Клікніть постер для перегляду</span>
        <button
          class="stage-stat-btn"
          @click="refreshMovies"
          @mousedown.stop
          @mouseup.stop
          @touchstart.stop
          @touchend.stop
          title="Клікніть, щоб оновити фільми"
        >
          🔄 {{ movies.length }} унікальних фільмів (оновити)
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { tmdbApi } from '../api/tmdb'
import { getApiOrigin } from '../utils/config'
import { useFavoritesStore } from '../stores/favorites'
import { useFavorite } from '../composables/useFavorite'

const router = useRouter()
const favoritesStore = useFavoritesStore()
const { toggleFavorite, favoriteTitle } = useFavorite()

const stageEl = ref(null)
const canvasEl = ref(null)

const movies = ref([])
const loading = ref(true)
const error = ref('')

const selectedCell = ref(null)
const selectedMovie = ref(null)
const selectedMovieDetails = ref(null)
const hoveredCell = ref(null)
const genreMap = ref({})
const genresList = ref([])
const selectedGenreId = ref(null)

// Image Cache: map movieId -> HTMLImageElement
const imageMap = new Map()

// Grid Settings: dense mosaic with massive hovered center card
const STEP_X = 40
const STEP_Y = 58
const MAX_MAGNIFICATION = 5.0 // Smooth scaling
const GRID_COLS = 26
const GRID_ROWS = 18

// Виявлення Smart TV (Hisense VIDAA, WebOS, Tizen тощо)
const isTvDevice = typeof navigator !== 'undefined' && (
  /tv|smarttv|vidaa|tizen|webos|netcast|viera|bravia|hisense|roku|aftb|appletv|crkey|hbbtv|box/i.test(navigator.userAgent) ||
  (typeof document !== 'undefined' && document.documentElement.classList.contains('is-tv')) ||
  (typeof window !== 'undefined' && window.screen && (window.screen.width >= 1920 || window.screen.height >= 1080) && (window.devicePixelRatio >= 2.5 || /hisense|vidaa/i.test(navigator.userAgent)))
)

// Camera in world pixels
let camX = 0
let camY = 0
let targetCamX = 0
let targetCamY = 0

// Bulge center position (follows mouse)
let bulgeX = 0
let bulgeY = 0
let targetBulgeX = 0
let targetBulgeY = 0
let isMouseInside = false

// Dragging State
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let dragStartCamX = 0
let dragStartCamY = 0
let hasMoved = false

let momentumX = 0
let momentumY = 0
let lastX = 0
let lastY = 0
let lastTime = 0

let mouseX = -9999
let mouseY = -9999

// Overlay elements (details panel, hint bar) live INSIDE the stage, so their
// mouse events bubble up to the stage handlers. Without this guard a click on
// "Сторінка фільму" would be treated as a click on the canvas underneath and
// would select (and navigate to) a completely different movie.
let isPointerOverOverlay = false
const OVERLAY_SELECTOR = '.film-details-panel, .stage-hint-bar'
const isOverlayTarget = (e) => {
  const t = e?.target
  return !!(t && typeof t.closest === 'function' && t.closest(OVERLAY_SELECTOR))
}

let animId = 0
let resizeObserver = null
let renderedCards = []

// Helpers
const movieYear = m => (m?.release_date ? m.release_date.slice(0, 4) : '—')
const scorePercent = vote => Math.round((vote || 0) * 10)
const scoreClass = vote => {
  const v = vote || 0
  if (v >= 7) return 'sc-green'
  if (v >= 5) return 'sc-yellow'
  return 'sc-red'
}
const formatRuntime = min => {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} год ${m} хв` : `${m} хв`
}

// Trailer Key computed
const trailerKey = computed(() => {
  const vids = selectedMovieDetails.value?.videos?.results
  if (!vids || !vids.length) return null
  const trailer = vids.find(v => v.type === 'Trailer' && v.site === 'YouTube')
  const teaser = vids.find(v => v.type === 'Teaser' && v.site === 'YouTube')
  return trailer ? trailer.key : (teaser ? teaser.key : vids[0]?.key)
})

const isFavorite = computed(() => {
  return selectedMovie.value ? favoritesStore.isFavorite(selectedMovie.value.id) : false
})

const goToMovie = id => {
  router.push(`/movie/${id}`)
}

const closeDetails = () => {
  selectedMovie.value = null
  selectedMovieDetails.value = null
  selectedCell.value = null
}

// Preload image without CORS restrictions
function preloadImage(movie) {
  if (!movie || !movie.poster_path) return
  if (imageMap.has(movie.id)) return

  const img = new Image()
  img.src = tmdbApi.getImageUrl(movie.poster_path, 'w185')
  img.onload = () => {
    imageMap.set(movie.id, img)
  }
}

// Deterministic movie for grid cell (c, r) mapped outward in expanding spiral/rings from center (0, 0)
// This guarantees that movies loaded first appear in the center under the user's view,
// and as more pages load, they fill outwards towards the edges.
const cellMovieIndexMap = new Map()

function getCellSpiralIndex(c, r) {
  // Normalize cell coords to positive/negative offset from center
  const key = `${c},${r}`
  if (cellMovieIndexMap.has(key)) return cellMovieIndexMap.get(key)

  // Distance from center cell (0, 0)
  const dist = Math.hypot(c * 1.0, r * 1.35)
  // Stable pseudo-angle to order cells within concentric rings
  const angle = Math.atan2(r, c) + Math.PI
  const sortKey = dist * 1000 + angle
  cellMovieIndexMap.set(key, sortKey)
  return sortKey
}

// Precomputed sorted grid indices from center outwards
let sortedSpiralCells = []
function initSpiralOrder() {
  const cells = []
  const halfCols = Math.floor(GRID_COLS / 2)
  const halfRows = Math.floor(GRID_ROWS / 2)
  for (let r = -halfRows; r <= halfRows; r++) {
    for (let c = -halfCols; c <= halfCols; c++) {
      const dist = Math.hypot(c * 1.0, r * 1.35)
      const angle = Math.atan2(r, c)
      cells.push({ c, r, dist, angle })
    }
  }
  // Sort from center outwards
  cells.sort((a, b) => a.dist - b.dist)
  
  // Assign sequential index
  const map = new Map()
  cells.forEach((item, idx) => {
    // Map negative/positive into modulo grid
    const colMod = ((item.c % GRID_COLS) + GRID_COLS) % GRID_COLS
    const rowMod = ((item.r % GRID_ROWS) + GRID_ROWS) % GRID_ROWS
    map.set(`${colMod},${rowMod}`, idx)
  })
  sortedSpiralCells = map
}
initSpiralOrder()

function getMovieForCell(c, r) {
  const count = movies.value.length
  if (!count) return null
  const colMod = ((c % GRID_COLS) + GRID_COLS) % GRID_COLS
  const rowMod = ((r % GRID_ROWS) + GRID_ROWS) % GRID_ROWS
  const spiralIdx = sortedSpiralCells.get(`${colMod},${rowMod}`) ?? 0
  const idx = spiralIdx % count
  return movies.value[idx]
}

// Rounded rect
function drawRoundedRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Smooth spherical lens distortion: continuous cosine falloff so edges transition seamlessly
function warpScreenPoint(x, y, lx, ly, R, M) {
  const dx = x - lx
  const dy = y - ly
  const rho = Math.hypot(dx, dy)

  if (rho < 0.001) {
    return { x: lx, y: ly, rho: 0, domeH: 1, factor: 1 }
  }

  if (rho < R) {
    const t = rho / R
    // Smooth cosine squared: 1 at center, gently approaches 0 with 0 derivative at boundary R
    const factor = 0.5 * (1 + Math.cos(Math.PI * t))
    const warpedRho = rho * (1 + (M - 1) * factor * 0.45)
    const domeH = factor
    return {
      x: lx + (dx / rho) * warpedRho,
      y: ly + (dy / rho) * warpedRho,
      rho,
      domeH,
      factor
    }
  }

  return { x, y, rho, domeH: 0, factor: 0 }
}

let lastRenderTime = 0

// Render Loop
function render(timestamp = 0) {
  if (!canvasEl.value || !stageEl.value) {
    animId = requestAnimationFrame(render)
    return
  }

  // На телевізорах обмежуємо до ~30 FPS, щоб слабкий ТВ-процесор не навантажувався
  // на 100% і не викликав зависання системи. На ноутбуці працює повна швидкість 60 FPS.
  if (isTvDevice && timestamp && timestamp - lastRenderTime < 33) {
    animId = requestAnimationFrame(render)
    return
  }
  lastRenderTime = timestamp

  const canvas = canvasEl.value
  const ctx = canvas.getContext('2d')
  const width = stageEl.value.clientWidth
  const height = stageEl.value.clientHeight

  if (width === 0 || height === 0) {
    animId = requestAnimationFrame(render)
    return
  }

  // Smooth camera pan
  if (!isDragging) {
    // Edge auto-scrolling: when the cursor is near the edges of the stage, auto-pan the board
    if (isMouseInside && mouseX > -100 && mouseY > -100 && !selectedCell.value && !isPointerOverOverlay) {
      const edgeMarginX = Math.min(100, width * 0.12)
      const edgeMarginY = Math.min(80, height * 0.12)
      const maxScrollSpeed = 7.5

      if (mouseX < edgeMarginX) {
        const ratio = (edgeMarginX - mouseX) / edgeMarginX
        targetCamX -= ratio * maxScrollSpeed
      } else if (mouseX > width - edgeMarginX) {
        const ratio = (mouseX - (width - edgeMarginX)) / edgeMarginX
        targetCamX += ratio * maxScrollSpeed
      }

      if (mouseY < edgeMarginY) {
        const ratio = (edgeMarginY - mouseY) / edgeMarginY
        targetCamY -= ratio * maxScrollSpeed
      } else if (mouseY > height - edgeMarginY) {
        const ratio = (mouseY - (height - edgeMarginY)) / edgeMarginY
        targetCamY += ratio * maxScrollSpeed
      }
    }

    targetCamX += momentumX
    targetCamY += momentumY
    momentumX *= 0.88
    momentumY *= 0.88
    if (Math.abs(momentumX) < 0.01) momentumX = 0
    if (Math.abs(momentumY) < 0.01) momentumY = 0
  }

  camX += (targetCamX - camX) * 0.16
  camY += (targetCamY - camY) * 0.16

  // BULGE FOLLOWS THE MOUSE smoothly
  if (isMouseInside && mouseX > -100 && mouseY > -100) {
    targetBulgeX = mouseX
    targetBulgeY = mouseY
  } else if (selectedCell.value && width > 768) {
    targetBulgeX = width * 0.65
    targetBulgeY = height * 0.5
  } else {
    targetBulgeX = width * 0.5
    targetBulgeY = height * 0.5
  }

  bulgeX += (targetBulgeX - bulgeX) * 0.22
  bulgeY += (targetBulgeY - bulgeY) * 0.22

  ctx.clearRect(0, 0, width, height)

  if (!movies.value.length) {
    animId = requestAnimationFrame(render)
    return
  }

  // Focused, organic spherical lens radius
  const R = Math.min(225, Math.min(width, height) * 0.38)
  const M = MAX_MAGNIFICATION

  // Compute visible range of grid cells
  const minC = Math.floor((camX - width / 2 - R) / STEP_X) - 2
  const maxC = Math.ceil((camX + width / 2 + R) / STEP_X) + 2
  const minR = Math.floor((camY - height / 2 - R) / STEP_Y) - 2
  const maxR = Math.ceil((camY + height / 2 + R) / STEP_Y) + 2

  renderedCards = []
  let bestHover = null

  for (let r = minR; r <= maxR; r++) {
    const stagger = (Math.abs(r) % 2) * (STEP_X * 0.5)

    for (let c = minC; c <= maxC; c++) {
      const movie = getMovieForCell(c, r)
      if (!movie) continue

      // Unwarped screen position
      const x0 = c * STEP_X + stagger - camX + width / 2
      const y0 = r * STEP_Y - camY + height / 2

      // Warp cell center through the lens at (bulgeX, bulgeY)
      const center = warpScreenPoint(x0, y0, bulgeX, bulgeY, R, M)

      const pLeft = warpScreenPoint(x0 - STEP_X * 0.5, y0, bulgeX, bulgeY, R, M)
      const pRight = warpScreenPoint(x0 + STEP_X * 0.5, y0, bulgeX, bulgeY, R, M)
      const pTop = warpScreenPoint(x0, y0 - STEP_Y * 0.5, bulgeX, bulgeY, R, M)
      const pBottom = warpScreenPoint(x0, y0 + STEP_Y * 0.5, bulgeX, bulgeY, R, M)

      const dX = Math.hypot(pRight.x - pLeft.x, pRight.y - pLeft.y)
      const dY = Math.hypot(pBottom.x - pTop.x, pBottom.y - pTop.y)

      const cardW = dX * 0.94
      const cardH = dY * 0.94

      // Offscreen culling
      if (
        center.x + cardW / 2 < -20 ||
        center.x - cardW / 2 > width + 20 ||
        center.y + cardH / 2 < -20 ||
        center.y - cardH / 2 > height + 20
      ) {
        continue
      }

      // Brightness & depth: lighter in the background so edges feel clean and easy
      let brightness = 0.4
      let zOrder = 10
      if (center.rho < R) {
        brightness = 0.45 + 0.55 * center.factor
        zOrder = 100 + center.factor * 500
      } else {
        const falloff = (center.rho - R) / 500
        brightness = Math.max(0.24, 0.42 - falloff)
        zOrder = Math.max(1, 80 - (center.rho - R) / 10)
      }

      // ONLY HIGHLIGHT THE EXACT CLICKED CELL
      const isSelected =
        selectedCell.value &&
        selectedCell.value.c === c &&
        selectedCell.value.r === r

      // Hit testing with mouse
      const isUnderMouse =
        mouseX >= center.x - cardW / 2 &&
        mouseX <= center.x + cardW / 2 &&
        mouseY >= center.y - cardH / 2 &&
        mouseY <= center.y + cardH / 2

      if (isUnderMouse) {
        if (!bestHover || zOrder > bestHover.zOrder) {
          bestHover = { movie, c, r, x0, y0, zOrder }
        }
      }

      renderedCards.push({
        movie,
        c,
        r,
        x0,
        y0,
        x: center.x,
        y: center.y,
        w: cardW,
        h: cardH,
        factor: center.factor,
        brightness,
        zOrder: isSelected ? 9999 : isUnderMouse ? 8888 : zOrder,
        isSelected
      })
    }
  }

  hoveredCell.value = isPointerOverOverlay ? null : bestHover
  stageEl.value.style.cursor = isDragging ? 'grabbing' : (isPointerOverOverlay ? 'default' : bestHover ? 'pointer' : 'grab')

  // Sort by zOrder
  renderedCards.sort((a, b) => a.zOrder - b.zOrder)

  // Draw cards
  for (let i = 0; i < renderedCards.length; i++) {
    const card = renderedCards[i]
    const isHovered =
      hoveredCell.value?.c === card.c &&
      hoveredCell.value?.r === card.r

    // If this is the hovered poster, give it an extra prominent pop and size!
    let drawW = card.w
    let drawH = card.h
    let drawX = card.x
    let drawY = card.y

    if (isHovered) {
      const hoverBoost = 1.32 // Natural prominent enlargement without extreme step
      drawW *= hoverBoost
      drawH *= hoverBoost
    }

    const cornerRadius = Math.max(2.5, Math.min(10, drawW * 0.08))

    ctx.save()

    // Shadow (на телевізорах вимикаємо складне блюрення тіней, зберігаючи 30/60 FPS без лагів процесора)
    if (!isTvDevice && (card.isSelected || isHovered || card.factor > 0.35)) {
      ctx.shadowColor = card.isSelected
        ? 'rgba(255, 204, 0, 0.95)'
        : isHovered
        ? 'rgba(0, 0, 0, 0.95)'
        : 'rgba(0, 0, 0, 0.85)'
      ctx.shadowBlur = card.isSelected ? 28 : isHovered ? 32 : 10
      ctx.shadowOffsetY = isHovered ? 6 : card.factor > 0.35 ? 3 : 1
    }

    // Clip to rounded rect
    drawRoundedRect(
      ctx,
      drawX - drawW / 2,
      drawY - drawH / 2,
      drawW,
      drawH,
      cornerRadius
    )

    const img = imageMap.get(card.movie.id)

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save()
      ctx.clip()
      ctx.globalAlpha = card.isSelected || isHovered ? 1.0 : card.brightness
      ctx.drawImage(
        img,
        drawX - drawW / 2,
        drawY - drawH / 2,
        drawW,
        drawH
      )

      // Soft 3D curvature shading (на телевізорах вимикаємо для високої швидкодії)
      if (!isTvDevice && card.brightness < 0.95 && !card.isSelected && !isHovered) {
        ctx.fillStyle = `rgba(0, 0, 0, ${0.28 * (1.0 - card.brightness)})`
        ctx.fillRect(
          drawX - drawW / 2,
          drawY - drawH / 2,
          drawW,
          drawH
        )
      }
      ctx.restore()
    } else {
      ctx.fillStyle = '#0f172a'
      ctx.fill()
    }

    // Border highlights: ONLY selected cell or hovered cell
    if (card.isSelected) {
      ctx.strokeStyle = '#ffcc00'
      ctx.lineWidth = 3.5
      ctx.stroke()
    } else if (isHovered) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    ctx.restore()
  }

  animId = requestAnimationFrame(render)
}

// Mouse Handlers
function onMouseEnter() {
  isMouseInside = true
}

function onMouseDown(e) {
  if (e.button !== 0) return
  if (isOverlayTarget(e)) return
  isDragging = true
  hasMoved = false
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartCamX = targetCamX
  dragStartCamY = targetCamY
  lastX = e.clientX
  lastY = e.clientY
  lastTime = performance.now()
  momentumX = 0
  momentumY = 0
}

function onMouseMove(e) {
  const rect = stageEl.value?.getBoundingClientRect()
  if (rect) {
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
    isMouseInside = true
  }

  // Pointer is over an overlay (panel / hint bar) -> no hover, no auto-scroll
  isPointerOverOverlay = isOverlayTarget(e)

  if (!isDragging) return

  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    hasMoved = true
  }

  targetCamX = dragStartCamX - dx
  targetCamY = dragStartCamY - dy

  const now = performance.now()
  const dt = now - lastTime
  if (dt > 10) {
    momentumX = -(e.clientX - lastX) * 0.5
    momentumY = -(e.clientY - lastY) * 0.5
    lastX = e.clientX
    lastY = e.clientY
    lastTime = now
  }
}

function onMouseUp(e) {
  if (!isDragging) return
  isDragging = false

  // Click on movie without dragging.
  // The release must happen on the canvas itself — otherwise a click on an
  // overlay (details panel) would select the poster hidden behind it.
  if (!hasMoved && hoveredCell.value && !isOverlayTarget(e)) {
    selectMovieCell(hoveredCell.value)
  }
}

function onMouseLeave() {
  isDragging = false
  isMouseInside = false
  isPointerOverOverlay = false
  mouseX = -9999
  mouseY = -9999
}

// Touch Handlers
function onTouchStart(e) {
  if (e.touches.length !== 1) return
  if (isOverlayTarget(e)) return
  const t = e.touches[0]
  const rect = stageEl.value?.getBoundingClientRect()
  if (rect) {
    mouseX = t.clientX - rect.left
    mouseY = t.clientY - rect.top
    isMouseInside = true
  }

  isDragging = true
  hasMoved = false
  dragStartX = t.clientX
  dragStartY = t.clientY
  dragStartCamX = targetCamX
  dragStartCamY = targetCamY
  lastX = t.clientX
  lastY = t.clientY
  lastTime = performance.now()
  momentumX = 0
  momentumY = 0
}

function onTouchMove(e) {
  if (!isDragging || e.touches.length !== 1) return
  const t = e.touches[0]
  const rect = stageEl.value?.getBoundingClientRect()
  if (rect) {
    mouseX = t.clientX - rect.left
    mouseY = t.clientY - rect.top
  }

  const dx = t.clientX - dragStartX
  const dy = t.clientY - dragStartY

  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
    hasMoved = true
  }

  targetCamX = dragStartCamX - dx
  targetCamY = dragStartCamY - dy

  const now = performance.now()
  const dt = now - lastTime
  if (dt > 10) {
    momentumX = -(t.clientX - lastX) * 0.5
    momentumY = -(t.clientY - lastY) * 0.5
    lastX = t.clientX
    lastY = t.clientY
    lastTime = now
  }
}

function onTouchEnd(e) {
  if (!isDragging) return
  isDragging = false

  if (!hasMoved && hoveredCell.value && !isOverlayTarget(e)) {
    selectMovieCell(hoveredCell.value)
  }
  isMouseInside = false
  isPointerOverOverlay = false
  mouseX = -9999
  mouseY = -9999
}

// Wheel pan
function onWheel(e) {
  targetCamY += e.deltaY * 0.6
  targetCamX += (e.deltaX || 0) * 0.6
}

// Select a movie from cell click
async function selectMovieCell(cell) {
  selectedCell.value = { c: cell.c, r: cell.r, movie: cell.movie }
  selectedMovie.value = cell.movie
  selectedMovieDetails.value = null

  // Glide camera so the selected cell centers under the lens
  const width = stageEl.value?.clientWidth || 1000
  const stagger = (Math.abs(cell.r) % 2) * (STEP_X * 0.5)
  const cellBaseX = cell.c * STEP_X + stagger
  const cellBaseY = cell.r * STEP_Y

  // If on desktop, position it at 65% width to leave room for left panel
  const targetScreenX = width > 768 ? width * 0.65 : width * 0.5
  targetCamX = cellBaseX - (targetScreenX - width / 2)
  targetCamY = cellBaseY

  momentumX = 0
  momentumY = 0

  try {
    const details = await tmdbApi.getMovieDetails(cell.movie.id)
    if (selectedMovie.value?.id === cell.movie.id) {
      selectedMovieDetails.value = details
    }
  } catch (err) {
    console.warn('Failed to load movie details', err)
  }
}

// Random Movie
function pickRandomMovie() {
  if (!renderedCards.length && !movies.value.length) return
  const pool = renderedCards.length ? renderedCards : movies.value.map(m => ({ movie: m, c: 0, r: 0 }))
  const randomChoice = pool[Math.floor(Math.random() * pool.length)]
  selectMovieCell(randomChoice)
}

// Resize Canvas
function handleResize() {
  if (!stageEl.value || !canvasEl.value) return
  const rect = stageEl.value.getBoundingClientRect()
  // На ноутбуках зберігаємо повну чіткість (до 2.0).
  // На 4K Smart TV обмежуємо DPR до 1.0, щоб графічний буфер не переповнював пам'ять телевізора.
  const dpr = isTvDevice ? 1.0 : Math.min(window.devicePixelRatio || 1, 2)

  canvasEl.value.width = rect.width * dpr
  canvasEl.value.height = rect.height * dpr
  canvasEl.value.style.width = `${rect.width}px`
  canvasEl.value.style.height = `${rect.height}px`

  const ctx = canvasEl.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

// Progressive streaming fetch from center outwards
let currentOffsetPage = 1

async function fetchMoviesPage(p, genreId) {
  // TMDB-ключ НЕ в клієнті: запит іде через локальний proxy, який додає
  // api_key на сервері. Інакше ключ потрапляє в бандл і його можна
  // скопіювати та витратити квоту.
  const params = new URLSearchParams({
    language: 'uk-UA',
    sort_by: 'popularity.desc',
    page: String(p),
  })
  if (genreId) params.set('with_genres', String(genreId))
  const url = `${getApiOrigin()}/api/tmdb/discover/movie?${params.toString()}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).filter(m => m && m.poster_path)
  } catch {
    return []
  }
}

async function loadMovies(offset = 1, genreId = selectedGenreId.value) {
  loading.value = true
  error.value = ''
  try {
    // 1. First wave: fetch the first 3 pages immediately to populate the central sphere!
    const initialPages = [offset, offset + 1, offset + 2]
    const initialResults = await Promise.all(initialPages.map(p => fetchMoviesPage(p, genreId)))
    const initialFlat = initialResults.flat()

    const seen = new Set()
    const unique = []
    for (const m of initialFlat) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        unique.push(m)
        preloadImage(m)
      }
    }

    movies.value = [...unique]
    // Turn off full loading spinner immediately so the user can interact right away
    loading.value = false

    // 2. Second wave: на телевізорах зупиняємося на перших 60 фільмах, щоб
    // не забивати обмежену пам'ять (RAM) телевізора завантаженням 400 картинок.
    // На ноутбуку/ПК продовжуємо завантажувати всі 20 сторінок для повної галактики.
    if (!isTvDevice) {
      const remainingPages = []
      for (let i = 3; i < 20; i++) {
        remainingPages.push(offset + i)
      }

      // Load in chunks of 4 pages with small delay
      const chunkSize = 4
      for (let i = 0; i < remainingPages.length; i += chunkSize) {
        const chunk = remainingPages.slice(i, i + chunkSize)
        const chunkResults = await Promise.all(chunk.map(p => fetchMoviesPage(p, genreId)))
        const chunkFlat = chunkResults.flat()

        for (const m of chunkFlat) {
          if (!seen.has(m.id)) {
            seen.add(m.id)
            unique.push(m)
            preloadImage(m)
          }
        }
        movies.value = [...unique]
        await new Promise(r => setTimeout(r, 60))
      }
    }
  } catch (e) {
    error.value = 'Не вдалося завантажити фільми з TMDB.'
    loading.value = false
  }
}

function selectGenre(id) {
  if (selectedGenreId.value === id) return
  selectedGenreId.value = id
  closeDetails()
  currentOffsetPage = 1
  loadMovies(1, id)
}

function onGenreSelectChange(e) {
  const val = e.target.value
  selectGenre(val === '' ? null : Number(val))
}

function refreshMovies() {
  currentOffsetPage = (currentOffsetPage % 30) + 15
  loadMovies(currentOffsetPage, selectedGenreId.value)
}

async function loadGenres() {
  try {
    const list = await tmdbApi.getGenres()
    genresList.value = list || []
    const map = {}
    ;(list || []).forEach(g => {
      map[g.id] = g.name
    })
    genreMap.value = map
  } catch (e) {}
}

onMounted(() => {
  loadMovies()
  loadGenres()

  nextTick(() => {
    handleResize()
    resizeObserver = new ResizeObserver(handleResize)
    if (stageEl.value) {
      resizeObserver.observe(stageEl.value)
    }
    animId = requestAnimationFrame(render)
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<style scoped>
.explore-page {
  max-width: 1560px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

.explore-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

/* Genre Dropdown Select */
.genre-select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.genre-dropdown {
  appearance: none;
  -webkit-appearance: none;
  background: rgba(15, 23, 42, 0.85);
  color: #f1f5f9;
  border: 1px solid #334155;
  border-radius: 999px;
  padding: 0.55rem 2.2rem 0.55rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);
}

.genre-dropdown:hover {
  border-color: #ffcc00;
  background: rgba(30, 41, 59, 0.95);
  box-shadow: 0 0 12px rgba(255, 204, 0, 0.25);
}

.genre-dropdown:focus {
  border-color: #ffcc00;
  box-shadow: 0 0 0 2px rgba(255, 204, 0, 0.35);
}

.genre-dropdown option {
  background: #0f172a;
  color: #f1f5f9;
  padding: 0.5rem;
}

.dropdown-chevron {
  position: absolute;
  right: 0.85rem;
  pointer-events: none;
  font-size: 0.65rem;
  color: #94a3b8;
  transition: transform 0.2s;
}

.eyebrow {
  color: #ffcc00;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  font-weight: 800;
  margin: 0 0 0.4rem;
}

h1 {
  font-size: clamp(2.2rem, 5vw, 4.4rem);
  line-height: 0.95;
  margin: 0 0 0.6rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.02em;
}

.muted {
  color: #94a3b8;
  margin: 0;
  max-width: 600px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.explore-action-btn {
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  white-space: nowrap;
  transition: all 0.2s ease;
}

/* ===== Explore Canvas Stage ===== */
.explore-stage {
  position: relative;
  height: min(80vh, 840px);
  min-height: 540px;
  overflow: hidden;
  border-radius: 1.25rem;
  background: radial-gradient(ellipse at 50% 50%, #0d1527 0%, #030611 90%);
  border: 1px solid #1e293b;
  box-shadow: 0 25px 70px rgba(0, 0, 0, 0.85);
  user-select: none;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.stage-loader {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #ffcc00;
  font-weight: 700;
  background: rgba(2, 4, 9, 0.9);
  backdrop-filter: blur(8px);
  z-index: 50;
}

.stage-state.error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fca5a5;
  font-weight: 700;
  z-index: 50;
}

.stage-hint-bar {
  position: absolute;
  left: 1.25rem;
  right: 1.25rem;
  bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #64748b;
  font-size: 0.75rem;
  pointer-events: none;
  z-index: 30;
}

.stage-stat {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid #334155;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  color: #94a3b8;
}

.stage-stat-btn {
  pointer-events: auto;
  cursor: pointer;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid #334155;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 600;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.stage-stat-btn:hover {
  background: #ffcc00;
  color: #020617;
  border-color: #ffcc00;
}

/* ===== Film Details Panel (Left Overlay - Aligned to Top with Trailer) ===== */
.film-details-panel {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 480px;
  max-width: 48%;
  z-index: 40;
  display: flex;
  flex-direction: column;
  justify-content: flex-start; /* Aligned from the top! */
  padding: 1.25rem 1.4rem 2rem;
  pointer-events: auto;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.film-details-panel::-webkit-scrollbar {
  display: none;
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.2;
  filter: blur(6px);
  transform: scale(1.06);
  pointer-events: none;
}

.panel-backdrop-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(2, 4, 9, 0.98) 0%,
    rgba(2, 4, 9, 0.92) 65%,
    rgba(2, 4, 9, 0.5) 100%
  );
  pointer-events: none;
}

.panel-close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid #475569;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s;
  backdrop-filter: blur(8px);
}
.panel-close-btn:hover {
  background: #ffcc00;
  color: #020617;
  border-color: #ffcc00;
}

.panel-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
}

/* Media at top: Trailer or Backdrop */
.panel-media-top {
  width: 100%;
  margin-bottom: 1.1rem;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.trailer-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  background: #000;
}
.trailer-wrapper iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.media-hero-img {
  width: 100%;
  height: 200px;
  overflow: hidden;
  background: #000;
}
.media-hero-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.panel-content-body {
  display: flex;
  flex-direction: column;
}

.panel-tagline {
  color: #94a3b8;
  font-style: italic;
  font-size: 0.8rem;
  margin: 0 0 0.35rem;
}

.panel-title {
  color: #fff;
  font-size: 1.65rem;
  font-weight: 900;
  line-height: 1.15;
  margin: 0 0 0.65rem;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
}

.panel-year {
  color: #94a3b8;
  font-weight: 400;
  font-size: 1.05rem;
}

.panel-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.genre-pill {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 0.7rem;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
}

/* Score row */
.panel-score-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.8rem;
}

.score-circle {
  position: relative;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}
.score-circle svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.circle-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 3.2;
}
.circle-fg {
  fill: none;
  stroke-width: 3.2;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease;
}

.sc-green .circle-fg { stroke: #22c55e; }
.sc-yellow .circle-fg { stroke: #eab308; }
.sc-red .circle-fg { stroke: #ef4444; }

.circle-text {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 0.68rem;
  font-weight: 800;
  color: #fff;
}

.score-info {
  display: flex;
  flex-direction: column;
}
.score-title {
  font-size: 0.62rem;
  font-weight: 800;
  color: #94a3b8;
  letter-spacing: 0.05em;
}
.score-sub {
  font-size: 0.68rem;
  color: #64748b;
}

.score-runtime {
  margin-left: auto;
  font-size: 0.75rem;
  color: #94a3b8;
}

.panel-overview {
  color: #cbd5e1;
  font-size: 0.84rem;
  line-height: 1.6;
  margin: 0 0 1.1rem;
  max-height: 140px;
  overflow-y: auto;
  padding-right: 0.4rem;
}
.panel-overview::-webkit-scrollbar {
  width: 4px;
}
.panel-overview::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}

/* Action buttons */
.panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.act-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.48rem 0.9rem;
  border-radius: 0.5rem;
  font-size: 0.76rem;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}
.act-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.4);
}

.act-btn.act-primary {
  background: #ffcc00;
  color: #020617;
  border-color: #ffcc00;
  font-weight: 800;
}
.act-btn.act-primary:hover {
  background: #ffd633;
  box-shadow: 0 0 20px rgba(255, 204, 0, 0.5);
}

.act-btn.act-icon {
  padding: 0.48rem 0.7rem;
  font-size: 0.85rem;
}

.act-btn.act-close {
  margin-left: auto;
  color: #94a3b8;
  border-color: transparent;
  background: transparent;
}
.act-btn.act-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

/* Panel slide transition */
.panel-slide-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-slide-enter-from {
  opacity: 0;
  transform: translateX(-40px);
}
.panel-slide-leave-to {
  opacity: 0;
  transform: translateX(-40px);
}

@media (max-width: 768px) {
  .explore-toolbar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  .toolbar-actions {
    margin-top: 0.25rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }
  .genre-select-wrapper {
    width: 100%;
  }
  .genre-dropdown {
    width: 100%;
  }
  .explore-action-btn {
    flex: 1 1 calc(50% - 0.25rem);
    padding: 0.5rem 0.5rem;
    font-size: 0.8rem;
    min-width: 110px;
  }
  .explore-stage {
    min-height: 440px;
  }
  .film-details-panel {
    width: 100%;
    max-width: 100%;
    padding: 1.25rem;
  }
}
</style>
