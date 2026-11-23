<template>
  <div class="lampa-player-container" ref="containerRef" @mousemove="onActivity" @mouseleave="onMouseLeave" @touchend="onContainerTouchEnd">
    <!-- Відео елемент для нативного HLS відтворення.
         :key — кожна медіа-сесія має свій <video>: старі нативні події
         (error/canplay/playing) приходять уже після перемикання джерела
         і не повинні ламати новий потік. -->
    <video
      :key="mediaGeneration"
      ref="videoRef"
      class="lampa-video"
      :style="{ display: isHlsMode ? 'block' : 'none' }"
      playsinline
      crossorigin="anonymous"
      @play="onVideoPlay"
      @pause="onVideoPause"
      @timeupdate="onTimeUpdate"
      @progress="onProgress"
      @loadeddata="onVideoReady"
      @canplay="onVideoReady"
      @loadedmetadata="onLoadedMetadata"
      @waiting="onVideoWaiting"
      @playing="onVideoReady"
      @ended="onEnded"
      @error="onVideoError"
      @click="onVideoClick"
    ></video>

    <!-- Тло постера якщо відео ще не запущене -->
    <div v-if="!hasStarted && backdrop" class="lampa-backdrop" :style="{ backgroundImage: 'url(' + backdrop + ')' }">
      <div class="lampa-backdrop-overlay"></div>
    </div>

    <!-- Завантажувач / Буферизація -->
    <div v-if="isBuffering" class="lampa-loader">
      <div class="lampa-spinner"></div>
      <span class="lampa-loader-text">{{ loaderText }}</span>
    </div>

    <!-- Автозапуск заблоковано браузером: лише кнопка, без підказок -->
    <div v-if="pendingUserPlay" class="lampa-center-start" @click="togglePlay">
      <div class="lampa-big-play">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>

    <!-- Велика кнопка запуску по центру при старті -->
    <div v-if="!hasStarted" class="lampa-center-start" @click="startPlayback">
      <div class="lampa-big-play">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <span class="lampa-big-title">Дивитися «{{ title }}»</span>
      <span class="lampa-big-sub">{{ startMetaLine }}</span>
      <div v-if="uaChecked && !lastUaData && !uaEmbedUrl" class="ua-fallback" @click.stop>
        <button
          v-if="!uaSearching"
          type="button"
          class="ua-fallback__link ua-fallback__retry"
          @click="tryClientUaDiscovery"
        >Знайти дубляж тут</button>
        <span v-else class="ua-fallback__hint">Шукаємо дубляж…</span>
        <span class="ua-fallback__hint">Або знайдіть дубляж на сайтах:</span>
        <div class="ua-fallback__links">
          <button
            v-for="link in uaSearchLinks"
            :key="link.name"
            type="button"
            class="ua-fallback__link"
            @click="openUaSearchLink(link.url)"
          >{{ link.name }}</button>
        </div>
      </div>
    </div>

    <!-- OSD (On-Screen Display) сповіщення дій -->
    <transition name="lampa-osd">
      <div v-if="osdMessage" class="lampa-osd-badge">
        <span class="lampa-osd-icon">{{ osdIcon }}</span>
        <span class="lampa-osd-text">{{ osdMessage }}</span>
      </div>
    </transition>

    <!-- Сенсорна подвійна перемотка (Double-tap) на мобільних -->
    <div v-if="touchFeedback === 'left'" class="lampa-touch-ripple lampa-touch-ripple--left">
      <div class="lampa-touch-ripple__inner">
        <span class="lampa-touch-ripple__icon">⏪</span>
        <span>-10с</span>
      </div>
    </div>
    <div v-if="touchFeedback === 'right'" class="lampa-touch-ripple lampa-touch-ripple--right">
      <div class="lampa-touch-ripple__inner">
        <span>+10с</span>
        <span class="lampa-touch-ripple__icon">⏩</span>
      </div>
    </div>

    <!-- Банер продовження перегляду (Resume Playback) -->
    <transition name="lampa-fade">
      <div v-if="showResumePrompt && resumeTime > 0" class="lampa-resume-banner" @click.stop>
        <div class="lampa-resume-content">
          <span class="lampa-resume-icon">⏱</span>
          <span class="lampa-resume-text">Продовжити з <strong>{{ formatTime(resumeTime) }}</strong>?</span>
          <div class="lampa-resume-actions">
            <button class="lampa-resume-btn lampa-resume-btn--primary" @click="resumePlayback">
              Продовжити
            </button>
            <button class="lampa-resume-btn" @click="dismissResumePrompt">
              ✕
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══════════════ ВАРІАНТ 1: ПОВНИЙ ІНТЕРФЕЙС LAMPA (для HLS режиму) ══════════════ -->
    <template v-if="hasStarted && isHlsMode">
      <!-- Верхня інфо-панель: лише назва + тонкий ряд метаданих.
           Час, якість і джерело дублюються нижньою панеллю керування,
           тому тут вони не показуються. -->
      <div class="player-info" :class="{ 'info--visible': showControls }">
        <div class="player-info__body">
          <div class="player-info__line">
            <div class="player-info__titles">
              <div class="player-info__title">{{ title }}</div>
              <div class="player-info__name" v-if="subtitle">{{ subtitle }}</div>
            </div>
            <div class="player-info__meta">
              <span v-if="releaseQuality" class="player-info__meta-item">{{ releaseQuality }}</span>
              <span v-if="audioLabel" class="player-info__meta-item" :title="selectedAudio">{{ audioLabel }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Нижня панель керування (Player Panel) у фірмовому стилі LAMPA -->
      <div class="player-panel" :class="{ 'panel--visible': showControls, 'panel--paused': !isPlaying }">
        <div class="player-panel__body">
          <!-- Таймлайн з прогресом і буфером -->
          <div class="player-panel__timeline" @click="onTimelineClick" @mousemove="onTimelineHover" @mouseleave="hoverTime = null">
            <div class="player-panel__peding" :style="{ width: bufferPercent + '%' }"></div>
            <div class="player-panel__position" :style="{ width: progressPercent + '%' }">
              <div class="player-panel__thumb"></div>
            </div>
            <div v-if="hoverTime !== null" class="player-panel__hover-time" :style="{ left: hoverPercent + '%' }">
              {{ formatTime(hoverTime) }}
            </div>
          </div>

          <!-- Час поточний та кінцевий -->
          <div class="player-panel__line player-panel__line-one">
            <div class="player-panel__timenow">{{ currentTimeFormatted }}</div>
            <div class="player-panel__timeend">-{{ remainingFormatted }}</div>
          </div>

          <!-- Рядок кнопок керування -->
          <div class="player-panel__line player-panel__line-two">
            <!-- Ліва частина: перемотка назад / вперед -->
            <div class="player-panel__left">
              <button class="lampa-btn" @click="seekBy(-10)" title="Назад на 10 секунд">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
                </svg>
                <span>10с</span>
              </button>
              <button class="lampa-btn" @click="seekBy(10)" title="Вперед на 10 секунд">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
                </svg>
                <span>10с</span>
              </button>
            </div>

            <!-- Центр: Play / Pause кнопка -->
            <div class="player-panel__center">
              <div class="player-panel__playpause" @click="togglePlay" :title="isPlaying ? 'Пауза' : 'Грати'">
                <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </div>
            </div>

            <!-- Права частина: якість, джерело, звук, повний екран -->
            <div class="player-panel__right">
              <!-- Вибір джерела -->
              <div class="player-panel__box-buttons">
                <div class="lampa-dropdown-wrap">
                  <button class="player-panel__source" @click.stop="toggleMenu('source')" title="Джерело відтворення">
                    <span class="player-panel__source-text">{{ currentSourceLabel }}</span>
                    <svg class="player-panel__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <div v-if="openMenu === 'source'" class="lampa-menu">
                    <button
                      v-for="src in availableSources"
                      :key="src.id"
                      type="button"
                      class="lampa-menu__item"
                      :class="{ active: currentSource === src.id, unavailable: src.unavailable }"
                      :disabled="src.unavailable"
                      @click="changeSource(src.id)"
                    >
                      {{ src.label }}
                    </button>
                    <button
                      v-if="uaChecked && !lastUaData"
                      type="button"
                      class="lampa-menu__item lampa-menu__item--retry"
                      @click="retryUaSearch"
                    >
                      <svg class="lampa-icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                        <polyline points="21 3 21 9 15 9" />
                      </svg>
                      Повторити пошук дубляжу
                    </button>
                  </div>
                </div>
              </div>

              <!-- Вибір якості -->
              <div class="player-panel__box-buttons" v-if="qualities.length > 1">
                <div class="lampa-dropdown-wrap">
                  <button class="player-panel__quality" @click.stop="toggleMenu('quality')" title="Якість відтворення">
                    {{ selectedQuality }}
                  </button>
                  <div v-if="openMenu === 'quality'" class="lampa-menu">
                    <button
                      v-for="q in qualities"
                      :key="q"
                      type="button"
                      class="lampa-menu__item"
                      :class="{ active: selectedQuality === q }"
                      @click="setQuality(q)"
                    >
                      {{ q }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Меню субтитрів: доріжки з master-маніфеста. Якщо
                   джерело доріжок не має — чесний напис у меню. -->
              <div class="player-panel__box-buttons">
                <div class="lampa-dropdown-wrap">
                  <button class="player-panel__quality player-panel__subs" @click.stop="toggleMenu('subs')" title="Субтитри">
                    CC
                  </button>
                  <div v-if="openMenu === 'subs'" class="lampa-menu">
                    <button
                      type="button"
                      class="lampa-menu__item"
                      :class="{ active: selectedSubtitle === -1 }"
                      @click="setSubtitle(-1)"
                    >
                      Вимкнено
                    </button>
                    <button
                      v-for="t in subtitleTracks"
                      :key="t.id"
                      type="button"
                      class="lampa-menu__item"
                      :class="{ active: selectedSubtitle === t.id }"
                      @click="setSubtitle(t.id)"
                    >
                      {{ t.label }}
                    </button>
                    <div v-if="!subtitleTracks.length" class="lampa-menu__empty">
                      Субтитри недоступні для цього джерела
                    </div>
                  </div>
                </div>
              </div>

              <!-- Гучність -->
              <div class="player-panel__box-buttons lampa-volume-wrap">
                <button class="lampa-btn-icon" @click="toggleMute" title="Гучність">
                  <svg v-if="isMuted || volume === 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                  <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  v-model.number="volume"
                  @input="onVolumeChange"
                  class="lampa-volume-slider"
                />
              </div>

              <!-- Картинка в картинці (PiP) -->
              <div class="player-panel__box-buttons" v-if="isPipSupported">
                <button class="lampa-btn-icon" @click="togglePip" title="Картинка в картинці">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <rect x="12" y="10" width="8" height="6" rx="1" fill="currentColor"/>
                  </svg>
                </button>
              </div>

              <!-- Підказка гарячих клавіш та пульту -->
              <div class="player-panel__box-buttons">
                <div class="lampa-dropdown-wrap">
                  <button class="lampa-btn-icon" @click.stop="toggleMenu('hotkeys')" title="Керування клавішами та пультом">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="6" y1="9" x2="6.01" y2="9"/>
                      <line x1="10" y1="9" x2="10.01" y2="9"/>
                      <line x1="14" y1="9" x2="14.01" y2="9"/>
                      <line x1="18" y1="9" x2="18.01" y2="9"/>
                      <line x1="6" y1="13" x2="6.01" y2="13"/>
                      <line x1="18" y1="13" x2="18.01" y2="13"/>
                      <line x1="10" y1="13" x2="14" y2="13"/>
                    </svg>
                  </button>
                  <div v-if="openMenu === 'hotkeys'" class="lampa-menu lampa-menu--hotkeys" @click.stop>
                    <div class="lampa-hotkeys-title">Керування клавіатурою / пультом</div>
                    <div class="lampa-hotkeys-grid">
                      <div class="lampa-hotkey-row"><kbd>Пробіл</kbd> / <kbd>OK</kbd> <span>Пауза / Пуск</span></div>
                      <div class="lampa-hotkey-row"><kbd>◀</kbd> / <kbd>▶</kbd> <span>Перемотка 10с</span></div>
                      <div class="lampa-hotkey-row"><kbd>▲</kbd> / <kbd>▼</kbd> <span>Гучність ±5%</span></div>
                      <div class="lampa-hotkey-row"><kbd>F</kbd> <span>На весь екран</span></div>
                      <div class="lampa-hotkey-row"><kbd>M</kbd> <span>Звук увімк / вимк</span></div>
                      <div class="lampa-hotkey-row"><kbd>0–9</kbd> <span>Швидкий перехід 0–90%</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Повний екран -->
              <div class="player-panel__box-buttons">
                <button class="lampa-btn-icon" @click="toggleFullscreen" title="На весь екран">
                  <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ══════════════ ВАРІАНТ 2: МІНІМАЛЬНИЙ ТОПБАР (для IFRAME режиму) ══════════════ -->
    <div v-if="hasStarted && !isHlsMode" class="iframe-topbar" :class="{ 'topbar--visible': showControls }">
      <div class="iframe-topbar__title">{{ title }}</div>

      <!-- Перемикач джерел -->
      <div class="lampa-dropdown-wrap">
        <button class="iframe-src-btn" @click.stop="toggleMenu('source')" title="Джерело відтворення">
          <span class="player-panel__source-text">{{ currentSourceLabel }}</span>
          <svg class="player-panel__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div v-if="openMenu === 'source'" class="lampa-menu lampa-menu--top">
          <button
            v-for="src in availableSources"
            :key="src.id"
            type="button"
            class="lampa-menu__item"
            :class="{ active: currentSource === src.id, unavailable: src.unavailable }"
            :disabled="src.unavailable"
            @click="changeSource(src.id)"
          >
            {{ src.label }}
          </button>
          <button
            v-if="uaChecked && !lastUaData"
            type="button"
            class="lampa-menu__item lampa-menu__item--retry"
            @click="retryUaSearch"
          >
            <svg class="lampa-icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
            Повторити пошук дубляжу
          </button>
        </div>
      </div>

      <!-- Кнопка повного екрану -->
      <button class="lampa-btn-icon" @click="toggleFullscreen" title="На весь екран">
        <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      </button>
    </div>

    <!-- Вибір джерел ДО запуску (під постером) -->
    <div v-if="!hasStarted" class="pre-source-bar">
      <button
        v-for="src in availableSources"
        :key="src.id"
        type="button"
        class="pre-src-btn"
        :class="{ active: currentSource === src.id, 'pre-src-btn--ua': src.isUa, 'pre-src-btn--off': src.unavailable }"
        :disabled="src.unavailable"
        @click="currentSource = src.id"
      >
        {{ src.label }}
      </button>
      <button
        v-if="uaChecked && !lastUaData"
        type="button"
        class="pre-src-btn pre-src-btn--retry"
        @click="retryUaSearch"
      >
        <svg class="lampa-icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
        Повторити пошук
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  GLOBAL_FALLBACK_ORDER,
  GLOBAL_EMBED_HOSTS,
  nextFallbackSource,
  buildEmbedUrl,
  buildEmbedIframeAttributes,
  isEmbedPlayerAlive,
} from '../lib/embedFallback.js'
import { getApiOrigin } from '../utils/config'

// hls.js — окремий async-чанк: сторінка фільму не завантажує ~500 КБ
// плеєра, поки користувач не натиснув «Дивитися».
let hlsModulePromise = null
const loadHlsModule = () => {
  if (!hlsModulePromise) {
    hlsModulePromise = import('hls.js')
      .then(module => module.default || module)
      .catch(error => {
        // Не кешуємо невдачу: інакше наступна спроба відтворення
        // вічно падала б із тим самим помиленим промісом.
        hlsModulePromise = null
        throw error
      })
  }
  return hlsModulePromise
}

const props = defineProps({
  title:         { type: String,           required: true },
  originalTitle: { type: String,           default: '' },
  year:          { type: [Number, String], default: null },
  subtitle:      { type: String,           default: '' },
  backdrop:      { type: String,           default: '' },
  tmdbId:        { type: [String, Number], default: '' },
  type:          { type: String,           default: 'movie' },
  season:        { type: Number,           default: null },
  episode:       { type: Number,           default: null },
})

const containerRef  = ref(null)
const videoRef      = ref(null)

const hasStarted    = ref(false)
const isBuffering   = ref(false)
const isPlaying     = ref(false)
const isFullscreen  = ref(false)
const showControls  = ref(true)
const openMenu      = ref(null)
const isHlsMode     = ref(false)
const loaderText    = ref('Завантаження...')
// Браузер заблокував автозапуск (NotAllowedError) — показуємо кнопку
// запуску, а не вважаємо потік зламаним.
const pendingUserPlay = ref(false)
// Лічильник медіа-сесій: кожна сесія отримує новий <video>-елемент
// (через :key), тому старі нативні події не можуть зламати новий потік.
const mediaGeneration = ref(0)

const currentTime   = ref(0)
const duration      = ref(0)
const bufferPercent = ref(0)
const hoverTime     = ref(null)
const hoverPercent  = ref(0)

const volume        = ref(0.85)
const isMuted       = ref(false)

const selectedQuality = ref('Auto')
// Рівні ABR з'являються лише після MANIFEST_PARSED. До того (і в
// нативному HLS Safari, де hls.js немає) показувати «1080p/720p» —
// це фальшиві кнопки, які нічого не роблять.
const qualities       = ref(['Auto'])

// Субтитри: доріжки з master-маніфеста (#EXT-X-MEDIA:TYPE=SUBTITLES).
// selectedSubtitle: -1 = вимкнено (стан за замовчуванням).
// Якщо джерело доріжок не має — меню чесно це показує.
const subtitleTracks   = ref([])
const selectedSubtitle = ref(-1)

// OSD (On-Screen Display) індикатори дій
const osdMessage = ref('')
const osdIcon = ref('')
let osdTimer = null

const showOsd = (icon, msg) => {
  osdIcon.value = icon
  osdMessage.value = msg
  clearTimeout(osdTimer)
  osdTimer = setTimeout(() => {
    osdMessage.value = ''
  }, 1100)
}

// PiP (Picture-in-Picture)
const isPipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document

const togglePip = async () => {
  try {
    if (!videoRef.value) return
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
      showOsd('🗖', 'Звичайний екран')
    } else {
      await videoRef.value.requestPictureInPicture()
      showOsd('🗗', 'Картинка в картинці')
    }
  } catch (e) {
    console.warn('PiP error:', e)
  }
}

// Подвійний тап для перемотки на мобільних
let lastTapTime = 0
let lastTapX = 0
const touchFeedback = ref('')
let touchFeedbackTimer = null

const onContainerTouchEnd = (e) => {
  if (e.target.closest('button, input, .player-panel, .player-info, .lampa-menu, .lampa-resume-banner, .lampa-center-start')) return
  const touch = e.changedTouches?.[0]
  if (!touch || !containerRef.value) return

  const now = performance.now()
  const rect = containerRef.value.getBoundingClientRect()
  const x = touch.clientX - rect.left
  const width = rect.width
  const dt = now - lastTapTime
  const dx = Math.abs(x - lastTapX)

  if (dt < 320 && dx < 60) {
    if (x < width * 0.38) {
      seekBy(-10)
      touchFeedback.value = 'left'
    } else if (x > width * 0.62) {
      seekBy(10)
      touchFeedback.value = 'right'
    } else {
      togglePlay()
    }
    clearTimeout(touchFeedbackTimer)
    touchFeedbackTimer = setTimeout(() => {
      touchFeedback.value = ''
    }, 650)
    lastTapTime = 0
  } else {
    lastTapTime = now
    lastTapX = x
    onActivity()
  }
}

// Відновлення перегляду (Resume Playback)
const showResumePrompt = ref(false)
const resumeTime = ref(0)

const checkResume = () => {
  if (!props.tmdbId) return
  try {
    const saved = localStorage.getItem(`alexfilm_resume_${props.tmdbId}`)
    if (saved) {
      const t = Number(saved)
      if (t > 20) {
        resumeTime.value = t
        showResumePrompt.value = true
        setTimeout(() => {
          showResumePrompt.value = false
        }, 12000)
      }
    }
  } catch (_) {}
}

const resumePlayback = () => {
  if (videoRef.value && resumeTime.value > 0) {
    videoRef.value.currentTime = resumeTime.value
    showOsd('⏱', `Продовжено з ${formatTime(resumeTime.value)}`)
    if (videoRef.value.paused) {
      videoRef.value.play().catch(() => {})
    }
  }
  showResumePrompt.value = false
}

const dismissResumePrompt = () => {
  showResumePrompt.value = false
}

// Якщо Samsung перестворив вкладку (повний екран → поворот екрана),
// сторінка перезавантажується без нашої участі. Зберігаємо активну
// сесію у sessionStorage і запускаємо її з того ж місця після старту.
// Звичайний перехід до іншого фільму сесію знищує (onBeforeUnmount),
// а pagehide — зберігає останню позицію.
const LIVE_SESSION_KEY = 'alexfilm_live_session'
let liveSessionSavedAt = 0
let pendingSeekTime = 0

const saveLiveSession = (force = false) => {
  if (!props.tmdbId || !hasStarted.value || !isPlaying.value || !currentTime.value) return
  if (!force && Date.now() - liveSessionSavedAt < 3000) return
  liveSessionSavedAt = Date.now()
  try {
    sessionStorage.setItem(LIVE_SESSION_KEY, JSON.stringify({
      tmdbId: props.tmdbId,
      type: props.type,
      source: currentSource.value,
      time: currentTime.value,
      savedAt: Date.now(),
    }))
  } catch (_) {}
}

const clearLiveSession = () => {
  try { sessionStorage.removeItem(LIVE_SESSION_KEY) } catch (_) {}
}

const restoreLiveSession = () => {
  let raw
  try { raw = sessionStorage.getItem(LIVE_SESSION_KEY) } catch (_) { return false }
  if (!raw) return false
  let session
  try { session = JSON.parse(raw) } catch (_) { return false }
  clearLiveSession()
  if (String(session?.tmdbId) !== String(props.tmdbId) || session.type !== props.type) return false
  if (!session.source || !(session.time > 0)) return false
  if (Date.now() - session.savedAt > 10 * 60 * 1000) return false
  pendingSeekTime = session.time
  loadSource(session.source)
  return true
}

// Підтверджена якість релізу (напр. «1080p BDRip») — її показуємо в інфо-панелі.
// `selectedQuality` — це вибір рівня ABR у самому HLS-потоку («Auto», «720p»…),
// тому вони не повинні змішуватися: інакше бейдж «1080p BDRip» зникає
// і користувач бачить безглузде «Auto».
const releaseQuality = ref('')

// Бейдж якості релізу (з proxy) та мова дубляжу — для верхнього рядка
// метаданих. Рівень ABR показує окремий dropdown у нижній панелі.
const selectedAudio   = ref('Українська (Дубляж)')
const uaChecked       = ref(false)

// Пріоритет #1 — український дубляж (UASerials/Ashdi, Eneyida, UAFLIX) за замовчуванням
const currentSource = ref('ua_stream')
const lastUaData    = ref(null)

let iframeEl    = null
let hideTimer   = null
let hlsInstance = null
let watchdogTimer = null
let hlsRetryCount = 0
// Резервний iframe UA-джерела. Сторонні плеєри (zetvideo/ashdi/hdvbua)
// вбудовують РЕКЛАМУ, тому ми за замовчуванням граємо їхні потоки
// УСІМ СВОЇМ HLS-плеєром. Цей iframe лишається аварією на випадок,
// коли наш плеєр не може відтворити потік (напр. невідомий кодек).
let uaIframeFallback = null
let docClickHandler = null
let fullscreenHandler = null
let pageHideHandler = null
let retryTimer = null
let fallbackTimer = null
let iframeLoadTimer = null
// Сторож «embed не створив плеєр»: сторінка може завантажитися (load
// відбувся), але всередині буде сторінка-помилка без вкладених фреймів.
let embedPlayerTimer = null
let uaController = null
let uaPromise = null
let uaRequestId = 0

// Час останньої ознаки живості потоку: мережева подія HLS.js або рух
// відтворення. Використовується watchdog'ом, щоб відрізняти «мертвий»
// потік від «повільного, але живого».
let lastStreamActivity = 0
// Чи вже пробували впасти на найнижчий рівень HLS (одна спроба на джерело)
let hlsLowestLevelTried = false
// Захист від рекурсивного оброблення video.error: destroyHls() скидає
// <video>, що може знову викликати помилку під час відкату на fallback.
let streamFailureHandling = false

const touchStreamActivity = () => {
  lastStreamActivity = Date.now()
}

// «Покоління» завантаження: будь-яка асинхронна операція, яка завершилась
// після перемикання джерела/фільму, ігнорується. Без цього старий
// UA-запит міг перебити вже обране користувачем джерело.
let loadGeneration = 0
// «Покоління» ідентичності фільму: змінюється лише разом з фільмом.
// Відповідь UA-пошуку прив'язана до нього, а не до вибору джерела.
let identityGeneration = 0

// Жорсткі ліміти — щоб плеєр НІКОЛИ не крутився вічно
const MAX_HLS_RETRIES = 2
// Поріг «потік мертвий» для watchdog'а: скільки часу НЕМАЄ жодної ознаки
// живості (мережа / прогрес). Має бути більше, ніж таймаут HLS.js на
// завантаження фрагмента (20 с за замовчуванням) — інакше ми обриваємо
// повільне, але робоче з'єднання (напр. сегмент 1080p важить 14 с).
const STALL_IDLE_MS = 30000
// Як часто сторож перевіряє, чи потік ще живий
const STALL_CHECK_INTERVAL_MS = 2000
const FALLBACK_DELAY_MS = 600
const IFRAME_LOAD_TIMEOUT_MS = 12000
// Скільки чекаємо, доки embed створить вкладений плеєр. Якщо за цей
// час вкладених фреймів так і не з'явилося — сторінка-помилка, а не плеєр.
const EMBED_PLAYER_TIMEOUT_MS = 15000
// Як часто перевіряємо наявність вкладеного плеєра.
const EMBED_PLAYER_POLL_MS = 1000
const HLS_RETRY_DELAY_MS = 1500
// Пошук українського дубляжу може тривати довше за буферизацію потоку,
// тому для нього окремий таймаут — інакше ми втратили б пріоритет дубляжу.
const UA_REQUEST_TIMEOUT_MS = 60000

// Домени, з яких дозволено вбудовувати плеєр.
// Сервер уже перевіряє це на своєму боці — тут дублюємо (defence in depth),
// щоб випадкова/підроблена відповідь не стала iframe.src.
//
// Окремі списки: UA-аварійний iframe дозволяємо лише з майданчиків,
// з яких proxy реально віддає HLS; глобальні embed'и — окремо.
const ALLOWED_UA_FRAME_HOSTS = ['ashdi.vip', 'zetvideo.net', 'hdvbua.pro']
const ALLOWED_GLOBAL_FRAME_HOSTS = GLOBAL_EMBED_HOSTS
const ALLOWED_FRAME_HOSTS = [...ALLOWED_UA_FRAME_HOSTS, ...ALLOWED_GLOBAL_FRAME_HOSTS]
// HLS-потоки proxy віддає ЛИШЕ з цих доменів (серверний ALLOWED_EMBED_HOSTS).
// Клієнтський список НЕ ширший за серверний.
const ALLOWED_HLS_HOSTS = ['ashdi.vip', 'zetvideo.net', 'hdvbua.pro']
// HLS віддається через локальний relay proxy: upstream-сегменти мають
// CORS, який не дозволяє origin http://localhost:5173. Relay сам
// перевіряє allow-list; клієнт додатково перевіряє і origin, і
// закладений upstream URL.
//
// Важливо: дозволено ТІЛЬКИ relay-URL. Прямий upstream HLS заборонено —
// інакше браузер пішов би напряму на CDN поза переписуванням маніфеста.
const RELAY_ORIGIN = getApiOrigin()
const RELAY_PATH = '/api/hls'
// Підпис HMAC-SHA256 від proxy (64 hex-символи). Без нього relay не
// приймає URL — тож клієнт перевіряє лише формат, а справжню авторизацію
// робить сервер.
const RELAY_SIGNATURE_RE = /^[a-f0-9]{64}$/

/**
 * Перевіряє URL перед тим, як віддати його браузеру.
 * https-only, стандартний порт, без credentials, хост із allow-list.
 */
const isSafeUrl = (url, allowedHosts) => {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (u.port) return false
    // Credentials у URL — небезпечні (Basic-auth) і потрапляють у логи.
    if (u.username || u.password) return false
    return allowedHosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch (e) {
    return false
  }
}

const isAllowedFrameUrl = (url) => isSafeUrl(url, ALLOWED_FRAME_HOSTS)
// Аварійний iframe майданчика — ТІЛЬКИ з UA-доменів (не глобальні embed'и).
const isAllowedUaFrameUrl = (url) => isSafeUrl(url, ALLOWED_UA_FRAME_HOSTS)
// Перевірка HLS-потоку: приймаємо ЛИШЕ локальний relay-URL.
// Сервер вже валідовує hlsUrl і підписує target, але клієнт мусить
// відкинути і прямі upstream-URL, і relay-URL у дивній формі — інакше
// підміна відповіді proxy повела б браузер на CDN поза переписуванням
// маніфеста (або з credentials у зовнішньому URL).
const isAllowedHlsUrl = (url) => {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== RELAY_ORIGIN) return false
    if (parsed.pathname !== RELAY_PATH) return false
    // Credentials у зовнішньому URL — небезпечні (Basic-auth) і потрапляють у логи.
    if (parsed.username || parsed.password) return false
    // Рівно один параметр url (без дублікатів) і обов'язковий серверний підпис.
    const urlParams = parsed.searchParams.getAll('url')
    if (urlParams.length !== 1) return false
    const signature = parsed.searchParams.get('sig')
    if (!signature || !RELAY_SIGNATURE_RE.test(signature)) return false
    // Вкладений upstream URL — з allow-list і без credentials.
    return isSafeUrl(urlParams[0], ALLOWED_HLS_HOSTS)
  } catch (e) {
    return false
  }
}

// Клієнтські логи не повинні містити керуючі символи або сирі URL.
// Обмеження довжини захищає консоль від великих payload'ів помилок.
const sanitizeLog = (value) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 240)

// Список джерел. Без емодзі: підписи мають виглядати як у професійному
// медіаплеєрі, а не як у чаті.
// Один запис на UA-дубляж: «Оригінальний плеєр майданчика» і «UASerials /
// Ashdi» грали ТОЙ САМИЙ потік через власний HLS — окремий пункт був
// дублем у меню джерел.
const SOURCES = [
  { id: 'ua_stream', label: 'UASerials / Ashdi', isUa: true },
  { id: 'vidsrcme',  label: 'VidSrc.me' },
  { id: 'twoembed',  label: '2Embed' },
  { id: 'vidsrcbuzz', label: 'VidSrc.Buzz' },
  { id: 'vidsrc2',   label: '2Embed.skin' },
]

const availableSources = computed(() => {
  return SOURCES.map(s => {
    if (s.isUa && lastUaData.value) {
      // Показуємо реальне джерело, з якого прийшов дубляж.
      return { ...s, label: lastUaData.value.sourceName || 'UA Дубляж' }
    }
    // Чесний статус: якщо перевірка вже завершилась і UA-релізу немає —
    // не обіцяємо дубляж, якого не буде
    if (s.isUa && uaChecked.value && !lastUaData.value) {
      return { ...s, label: 'UA дубляж — не знайдено', unavailable: true }
    }
    return s
  })
})

const currentSourceLabel = computed(() => {
  if (currentSource.value === 'ua_stream' && (isHlsMode.value || uaEmbedUrl.value)) return 'Український дубляж'
  const src = availableSources.value.find(s => s.id === currentSource.value)
  if (!src) return 'UA Дубляж'
  return src.label
})

// Коли серверний автопошук не зміг дістатися до сайтів (часто блокується
// IP хостингу), найнадійніший шлях — відкрити пошук у браузері користувача.
// Тут завжди ті самі сайти, які людина відкриває вручну, з готовим запитом.
const uaSearchLinks = computed(() => {
  const q = encodeURIComponent(props.originalTitle || props.title || '')
  return [
    { name: 'UAFLIX', url: `https://uafix.net/index.php?do=search&subaction=search&story=${q}` },
    { name: 'UAkino', url: `https://uakino.best/ua/?do=search&subaction=search&story=${q}` },
    { name: 'UASerials', url: `https://uaserials.fm/index.php?do=search&subaction=search&story=${q}` },
    { name: 'Eneyida', url: `https://eneyida.tv/index.php?do=search&subaction=search&story=${q}` }
  ]
})

const openUaSearchLink = (url) => {
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Сервер на Render бачить «легку» версію сторінки UAFLIX (лише трейлер),
// а браузер користувача — повну. Через CORS-relay (дозволяє *) ми можемо
// отримати справжнє посилання на плеєр у самому браузері й вбудувати його
// сюди — без переходу на інший сайт.
const UA_RELAYS = [
  'https://apx.lme.isroot.in/destination/',
  'https://api.allorigins.win/raw?url=',
]
const UA_EMBED_HOST_RE = /^https?:\/\/(?:[\w-]+\.)?(zetvideo\.net|ashdi\.vip|hdvb\.ua|hdvbua\.com)\//i
const uaEmbedUrl = ref('')
const uaSearching = ref(false)

const fetchViaRelay = (relay, url) => fetch(relay + encodeURIComponent(url))

const extractEmbedUrl = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const candidates = []
  for (const frame of doc.querySelectorAll('iframe')) {
    candidates.push(frame.getAttribute('src') || frame.getAttribute('data-src') || '')
  }
  // UAFLIX кладе плеєр у <meta property="og:video:iframe"> замість
  // живого <iframe> — звичайний DOMParser тут нічого не знайде.
  const meta = doc.querySelector('meta[property="og:video:iframe"]')?.getAttribute('content') || ''
  const metaSrc = meta.match(/src=["']([^"']+)["']/i)
  if (metaSrc) candidates.push(metaSrc[1])
  for (const src of candidates) {
    if (!src) continue
    const normalized = src.startsWith('//') ? `https:${src}` : src
    if (UA_EMBED_HOST_RE.test(normalized)) return normalized
  }
  return null
}

async function tryClientUaDiscovery() {
  if (uaSearching.value || uaEmbedUrl.value) return
  const query = (props.originalTitle || props.title || '').trim()
  if (!query) return
  uaSearching.value = true
  try {
    for (const relay of UA_RELAYS) {
      try {
        const searchUrl = new URL(`https://uafix.net/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`)
        searchUrl.searchParams.set('cb', String(Date.now()))
        const sRes = await fetchViaRelay(relay, searchUrl.href)
        if (!sRes.ok) continue
        const sDoc = new DOMParser().parseFromString(await sRes.text(), 'text/html')
        let filmHref = null
        sDoc.querySelectorAll('.sres-wrap, article, .short-item').forEach(card => {
          if (filmHref) return
          const href = card.querySelector('h2')?.closest('a')?.getAttribute('href') || ''
          if (href.includes('/films/') || href.includes('/serialy/')) filmHref = href
        })
        if (!filmHref) continue

        const filmPage = new URL(filmHref, 'https://uafix.net')
        for (let attempt = 0; attempt < 3; attempt++) {
          filmPage.searchParams.set('cb', String(Date.now() + attempt))
          const pRes = await fetchViaRelay(relay, filmPage.href)
          if (!pRes.ok) continue
          const found = extractEmbedUrl(await pRes.text())
          if (found) {
            uaEmbedUrl.value = found
            // знайдений у браузері дубляж іде в загальний ланцюжок iframe
            // (там є watchdog і прибирання мертвих сторінок), а не в
            // постійний шар поверх плеєра.
            if (isAllowedUaFrameUrl(found)) uaIframeFallback = found
            return
          }
        }
      } catch (e) {
        console.warn('[Player] UA-релей недоступний:', sanitizeLog(e?.message || e))
      }
    }
  } finally {
    uaSearching.value = false
  }
}

watch([uaChecked, lastUaData], ([checked, data]) => {
  if (checked && !data && !uaEmbedUrl.value && !hasStarted.value) {
    tryClientUaDiscovery()
  }
})

// Короткий ряд метаданих у верхній панелі: мова дубляжу без деталей
// («Українська (Офіційний дубляж)» → «Українська»), повний текст — у title.
const audioLabel = computed(() => {
  const value = String(selectedAudio.value || '').trim()
  if (!value) return ''
  const short = value.split('(')[0].trim()
  return short || value
})

// Рядок під кнопкою «Дивитися»: чесний статус пошуку дубляжу.
const startMetaLine = computed(() => {
  if (!uaChecked.value) return 'Шукаємо український дубляж…'
  if (!lastUaData.value) return 'Дубляж не знайдено автоматично'
  return releaseQuality.value
    ? `Український дубляж · ${releaseQuality.value}`
    : 'Український дубляж'
})

// ── Embed fallback URLs ──────────────────────────────────────────
// Fallback будується ЗА TMDB ID — він не може показати інший фільм.
// Сама логіка (URL, ланцюжок відкату, атрибути iframe) — у lib/embedFallback.js,
// щоб її можна було покрити тестами без браузера.

const progressPercent = computed(() => {
  if (!duration.value) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n) => String(n).padStart(2, '0')
  if (h > 0) return h + ':' + pad(m) + ':' + pad(s)
  return pad(m) + ':' + pad(s)
}

const currentTimeFormatted = computed(() => formatTime(currentTime.value))
const remainingFormatted   = computed(() => formatTime(Math.max(0, duration.value - currentTime.value)))

// ── Cleaners ────────────────────────────────────────────────────
const removeIframe = () => {
  clearEmbedPlayerTimer()
  if (iframeEl) {
    iframeEl.remove()
    iframeEl = null
  }
}

const destroyHls = () => {
  clearStreamWatchdog()
  // Стан субтитрів належить медіа-сесії: новий потік — новий список доріжок.
  subtitleTracks.value = []
  selectedSubtitle.value = -1
  // Вимикаємо HLS-режим ПЕРЕД очищенням <video>: removeAttribute('src') +
  // load() може викликати @error, і без цього прапорця ми сприйняли б
  // власну teardown-подію як поломку потоку та пішли б у відкат.
  isHlsMode.value = false
  pendingUserPlay.value = false
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.removeAttribute('src')
    videoRef.value.load()
  }
}

const clearStreamWatchdog = () => {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer)
    watchdogTimer = null
  }
}

const clearRetryTimer = () => {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

const clearFallbackTimer = () => {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
}

const clearIframeLoadTimer = () => {
  if (iframeLoadTimer) {
    clearTimeout(iframeLoadTimer)
    iframeLoadTimer = null
  }
}

const clearEmbedPlayerTimer = () => {
  if (embedPlayerTimer) {
    clearInterval(embedPlayerTimer)
    embedPlayerTimer = null
  }
}

/**
 * Єдиний watchdog буферизації/залипання потоку.
 *
 * «Застряг» означає відсутність БУДЬ-ЯКОЇ ознаки живості потоку протягом
 * STALL_IDLE_MS: ні мережевої події HLS.js, ні руху відтворення. Повільне,
 * але робоче завантаження (напр. 14-секундний сегмент 1080p) не вважається
 * залипанням і не обривається.
 *
 * Один таймер замість двох — інакше короткий «буферний» таймер міг
 * обривати живий потік, а довший stall-watchdog через спільний слот
 * навіть не запускався.
 */
const startStreamWatchdog = () => {
  if (watchdogTimer) return // сторож уже працює
  const generation = loadGeneration
  const check = () => {
    watchdogTimer = null
    if (generation !== loadGeneration) return
    if (!isBuffering.value) return

    const idleMs = Date.now() - lastStreamActivity
    if (idleMs < STALL_IDLE_MS) {
      // Потік живий (йде завантаження або є прогрес) — продовжуємо чекати
      watchdogTimer = setTimeout(check, STALL_CHECK_INTERVAL_MS)
      return
    }

    console.warn('[Player] Потік залип на буферизації — перемикаюсь на резервне джерело')
    handleStreamFailure()
  }
  watchdogTimer = setTimeout(check, STALL_CHECK_INTERVAL_MS)
}

/**
 * Спроба врятувати потік на найнижчому рівні якості.
 *
 * Найнижчий рівень зазвичай найсумісніший (H.264/AAC) і найлегший для
 * завантаження. Тому перед тим, як показувати рекламний iframe майданчика,
 * ми даємо потоку ще один шанс на нижчій якості — так реклама показується
 * рідше, а користувач все ще отримує український дубляж.
 */
const tryLowestHlsLevel = () => {
  if (!hlsInstance || !Array.isArray(hlsInstance.levels) || !hlsInstance.levels.length) return false
  if (hlsLowestLevelTried) return false

  let idx = 0
  let minHeight = Infinity
  hlsInstance.levels.forEach((l, i) => {
    const h = l.height || 0
    if (h > 0 && h < minHeight) { minHeight = h; idx = i }
  })
  if (!hlsInstance.levels[idx]?.height) return false

  hlsLowestLevelTried = true
  console.warn('[Player] Потік не відтворюється — пробую найнижчий рівень якості')
  try {
    hlsInstance.currentLevel = idx
    hlsInstance.startLoad()
  } catch (e) {
    return false
  }
  isBuffering.value = true
  touchStreamActivity()
  const generation = loadGeneration
  videoRef.value?.play().catch(err => {
    if (handleAutoplayBlocked(err, generation)) return
  })
  startStreamWatchdog()
  return true
}

/**
 * Єдиний шлях відмови від HLS-потоку:
 *   1) спроба найнижчого рівня (ще без реклами);
 *   2) аварійний iframe майданчика (український дубляж, але з рекламою);
 *   3) глобальний embed.
 */
const handleStreamFailure = () => {
  if (streamFailureHandling) return
  streamFailureHandling = true
  try {
    if (tryLowestHlsLevel()) return

    // Перед destroyHls() вимикаємо HLS-режим: очищення <video> може
    // викликати @error і спричинити рекурсивний відкат.
    isHlsMode.value = false
    destroyHls()
    removeIframe()
    isBuffering.value = false
    if (!fallbackToUaFrame()) fallbackToGlobal()
  } finally {
    streamFailureHandling = false
  }
}

/**
 * Guard нативних медіа-подій <video>.
 *
 * Кожна медіа-сесія отримує новий <video> (через :key="mediaGeneration").
 * Старий елемент може прислати запізнілу подію (error/canplay/playing)
 * ПІСЛЯ перемикання джерела — і тоді вона ламала б уже новий потік.
 * Порівнюємо event.target із поточним videoRef: подія від старого
 * елемента не збігається — ігноруємо її.
 */
const isCurrentMediaEvent = (event) => {
  const video = videoRef.value
  if (!video) return false
  if (event && event.target && event.target !== video) return false
  return true
}

// Відео готове до показу (playing/canplay) — знімаємо і спінер, і сторож
const onVideoReady = (event) => {
  if (!isCurrentMediaEvent(event)) return
  isBuffering.value = false
  touchStreamActivity()
  clearStreamWatchdog()
}

// Відео реально грає — прибираємо очікування натискання.
const onVideoPlay = (event) => {
  if (!isCurrentMediaEvent(event)) return
  pendingUserPlay.value = false
  isPlaying.value = true
  isBuffering.value = false
}

// Відео на паузі (зокрема й через нашу teardown-функцію).
const onVideoPause = (event) => {
  if (!isCurrentMediaEvent(event)) return
  isPlaying.value = false
}

// Клік по самому відео — те саме, що кнопка play/pause.
const onVideoClick = (event) => {
  if (!isCurrentMediaEvent(event)) return
  togglePlay()
}

// Потік «залип» — вмикаємо спінер і сторож, щоб не крутитися вічно
const onVideoWaiting = (event) => {
  if (!isCurrentMediaEvent(event)) return
  isBuffering.value = true
  touchStreamActivity()
  startStreamWatchdog()
}

// Нативний HLS (Safari) не має подій Hls.js — помилку <video> обробляємо
// тут і перемикаємось на резервне джерело.
const onVideoError = (event) => {
  if (!isCurrentMediaEvent(event)) return
  if (!hasStarted.value || !isHlsMode.value) return
  console.warn('[Player] Відео повідомило про помилку — перемикаюсь на резервне джерело')
  handleStreamFailure()
}

/**
 * Браузер заблокував автозапуск (NotAllowedError).
 *
 * Це НЕ поломка потоку — лише політика автозапуску. Тому ми НЕ
 * перемикаємося на рекламний fallback, а показуємо кнопку запуску:
 * наступний клік уже буде з користувацьким активаційним станом.
 */
const handleAutoplayBlocked = (err, generation) => {
  if (generation !== loadGeneration) return false
  if (err?.name !== 'NotAllowedError') return false
  pendingUserPlay.value = true
  isBuffering.value = false
  return true
}

// Порядок глобальних fallback-джерел і правила переходу — у lib/embedFallback.js
// (там же тести). Тут лише застосування.

// Єдиний шлях відкату на глобальний embed. Якщо поточне global-джерело
// не створило плеєр, беремо наступне — інакше залишився б чорний
// екран без пояснення.
const fallbackToGlobal = () => {
  const nextSource = nextFallbackSource(GLOBAL_FALLBACK_ORDER, currentSource.value)

  if (!nextSource) {
    isBuffering.value = false
    clearStreamWatchdog()
    clearEmbedPlayerTimer()
    loaderText.value = 'Усі резервні джерела недоступні'
    return
  }

  console.warn('[Player] Українське джерело недоступне → перемикаюсь на', nextSource)
  loadSource(nextSource)
}

// ── Iframe Renderer ─────────────────────────────────────────────
const showIframe = (url, { timeoutMs = EMBED_PLAYER_TIMEOUT_MS } = {}) => {
  if (!containerRef.value || !url) return false

  // Клієнтська перевірка хоста (сервер перевіряє так само)
  if (!isAllowedFrameUrl(url)) {
    console.warn('[Player] iframe з недозволеного домену відхилено:', sanitizeLog(url))
    isBuffering.value = false
    clearStreamWatchdog()
    loaderText.value = 'Джерело відео недоступне'
    return false
  }

  isHlsMode.value = false
  destroyHls()
  removeIframe()
  clearStreamWatchdog()
  clearIframeLoadTimer()

  const iframe = document.createElement('iframe')
  iframe.src = url
  // Атрибути — з lib/embedFallback.js. УВАГА: атрибута `sandbox` тут НЕМАЄ
  // і бути не повинно: vidsrc.sh перевіряє наявність пісочниці і віддає
  // «Embedding not allowed» (HTTP 403) — відео просто не запускається.
  // Безпеку забезпечує allow-list доменів (клієнтський і серверний),
  // https-only, стандартний порт і відсутність credentials у URL.
  const iframeAttrs = buildEmbedIframeAttributes()
  for (const [name, value] of Object.entries(iframeAttrs)) {
    iframe.setAttribute(name, value)
  }
  iframe.style.cssText = [
    'position:absolute', 'inset:0', 'width:100%', 'height:100%',
    'border:none', 'z-index:6', 'background:#000',
  ].join(';')

  containerRef.value.appendChild(iframe)
  iframeEl = iframe

  // Окремий watchdog на ЗАВАНТАЖЕННЯ iframe: якщо сторінка не віддала
  // load-подію за 12 с — перемикаємось на резервне джерело,
  // інакше плеєр «завмер» би на порожньому чорному екрані.
  const generation = loadGeneration
  iframeLoadTimer = setTimeout(() => {
    iframeLoadTimer = null
    if (generation !== loadGeneration) return
    if (iframeEl !== iframe) return
    console.warn('[Player] iframe не завантажився за таймаут — перемикаюсь на резервне джерело')
    removeIframe()
    fallbackToGlobal()
  }, IFRAME_LOAD_TIMEOUT_MS)

  iframe.addEventListener('load', () => {
    clearIframeLoadTimer()
    if (generation !== loadGeneration) return
    if (iframeEl !== iframe) return
    // Спінер знімаємо ТІЛЬКИ після реальної load-події iframe — інакше
    // користувач бачить чорний екран 12 секунд без жодного пояснення.
    isBuffering.value = false
  })

  // Watchdog на «плеєр не створився».
  //
  // Embed може завантажитися (load відбувся), але всередині буде
  // сторінка-помилка: «Embedding not allowed», «джерело недоступне» тощо.
  // Така сторінка не створює вкладеного плеєра — тобто `contentWindow.length`
  // залишається 0. Єдина кросс-доменна ознака, доступна батьківській стороні.
  //
  // Без цього сторожа плеєр «завмер» би на чорному екрані: жоден load-події
  // не було (сторінка-помилка теж завантажується), тож ланцюжок відкату
  // не просувався б далі.
  const embedStartedAt = Date.now()
  clearEmbedPlayerTimer()
  embedPlayerTimer = setInterval(() => {
    if (generation !== loadGeneration || iframeEl !== iframe) {
      clearEmbedPlayerTimer()
      return
    }
    let nestedFrames = 0
    try {
      nestedFrames = iframe.contentWindow ? iframe.contentWindow.length : 0
    } catch (e) {
      nestedFrames = 0
    }
    if (isEmbedPlayerAlive(nestedFrames)) {
      clearEmbedPlayerTimer()
      return
    }
    if (Date.now() - embedStartedAt < timeoutMs) return
    clearEmbedPlayerTimer()
    console.warn('[Player] Джерело не створило плеєр — перемикаюсь на резервне')
    removeIframe()
    fallbackToGlobal()
  }, EMBED_PLAYER_POLL_MS)

  isBuffering.value = true
  loaderText.value = 'Завантаження джерела...'
  isPlaying.value = true
  return true
}

/**
 * Аварійний перехід на плеєр майданчика.
 * Використовується, лише коли наш HLS-плеєр не зміг відтворити потік
 * UA-джерела. Плеєр майданчика показує рекламу, але лишається
 * український дубляж — це краще, ніж одразу переходити на глобальний embed.
 */
const fallbackToUaFrame = () => {
  const frameUrl = uaIframeFallback
  if (!frameUrl || !isAllowedUaFrameUrl(frameUrl)) return false
  uaIframeFallback = null
  console.warn('[Player] HLS-потік не запустився — показую плеєр майданчика')
  return showIframe(frameUrl, { timeoutMs: 7000 })
}

// ── HLS Stream Loader ────────────────────────────────────────────
const playHlsStream = async (m3u8Url) => {
  const generation = loadGeneration
  const video = videoRef.value

  removeIframe()
  isHlsMode.value = false
  destroyHls()
  clearRetryTimer()

  if (!video) return
  isHlsMode.value = true
  isBuffering.value = true
  loaderText.value = 'Завантаження відеопотоку...'
  touchStreamActivity()
  startStreamWatchdog()

  try {
    const Hls = await loadHlsModule()
    if (generation !== loadGeneration || !videoRef.value) return

    // ПОРЯДОК МАЄ ЗНАЧЕННЯ: спершу hls.js, нативний HLS — лише запас.
    //
    // Chrome (і деякі інші Chromium-збірки) повертають
    // canPlayType('application/vnd.apple.mpegurl') === 'maybe', хоча
    // нативно HLS НЕ підтримують. Якщо йти нативним шляхом першим, браузер
    // падає з "Failed to load because no supported source was found" —
    // і фільм не запускається взагалі.
    //
    // hls.js підтримує MSE (Chrome/Firefox/Edge/macOS Safari), а нативний
    // HLS лишається для iOS Safari, де MSE немає.
    if (Hls.isSupported()) {
      const instance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
      })
      hlsInstance = instance

      instance.attachMedia(videoRef.value)
      instance.loadSource(m3u8Url)

      // Будь-яка мережева подія HLS.js — ознака того, що потік живий.
      // Це дозволяє watchdog'у відрізняти повільне завантаження від мертвого
      // потоку (див. startStreamWatchdog).
      const ACTIVITY_EVENTS = [
        Hls.Events.MANIFEST_LOADED,
        Hls.Events.LEVEL_LOADED,
        Hls.Events.FRAG_LOADING,
        Hls.Events.FRAG_LOADED,
        Hls.Events.FRAG_BUFFERED,
      ]
      for (const evt of ACTIVITY_EVENTS) {
        instance.on(evt, () => {
          if (hlsInstance !== instance || generation !== loadGeneration) return
          touchStreamActivity()
        })
      }

      instance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        // Якщо поки що вже інше джерело/фільм — ігноруємо цю подію
        if (hlsInstance !== instance || generation !== loadGeneration) return

        if (data.levels && data.levels.length > 0) {
          // Дедуплікація за висотою: в маніфесті можуть бути варіанти
          // з однаковою висотою, але різним бітрейтом — інакше Vue отримує
          // дублікати :key.
          const heights = [...new Set(data.levels.map(l => l.height).filter(h => h > 0))]
          qualities.value = ['Auto', ...heights.map(h => `${h}p`)].sort((a, b) => {
            if (a === 'Auto') return -1
            if (b === 'Auto') return 1
            return parseInt(b) - parseInt(a)
          })
          // СТАРТ ІЗ НАЙВИЩОЇ ЯКОСТІ (вимога «високоякісний фільм»).
          //
          // HLS.js за замовчуванням стартує з низького рівня: початкова
          // оцінка каналу ≈ 500 kbps, тож перші хвилини йде 240p/360p,
          // поки ABR «розганиться». Це виглядає як поламка.
          //
          // Компроміс: стартуємо з найвищого рівня, але ABR лишається
          // увімкненим — після першого забуференого фрагмента повертаємо
          // auto (-1), і на слабкому каналі hls.js сам опуститься вниз
          // за кілька секунд.
          let topIdx = 0
          data.levels.forEach((l, i) => {
            if ((l.height || 0) > (data.levels[topIdx].height || 0)) topIdx = i
          })
          // Правильна назва — autoLevelCapping (autoLevelCap був no-op).
          // -1 = без обмеження зверху.
          instance.autoLevelCapping = -1
          instance.currentLevel = topIdx
          instance.once(Hls.Events.FRAG_BUFFERED, () => {
            if (hlsInstance !== instance || generation !== loadGeneration) return
            instance.currentLevel = -1 // повертаємо ABR
          })
          selectedQuality.value = 'Auto'

          // Субтитрові доріжки з'являються разом із маніфестом.
          refreshSubtitleTracks(instance)
        }

        videoRef.value.play().catch(err => {
          if (generation !== loadGeneration) return
          // NotAllowedError — це автозапуск, а не поламка потоку: показуємо
          // кнопку «натисніть» і НЕ відкатуємось на рекламний iframe.
          if (handleAutoplayBlocked(err, generation)) return
          console.warn('[Player] Autoplay error:', sanitizeLog(err?.message || err))
          handleStreamFailure()
        })
      })

      // Доріжки можуть підвантажитися пізніше за маніфест — оновлюємо список.
      instance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        if (hlsInstance !== instance || generation !== loadGeneration) return
        refreshSubtitleTracks(instance)
      })

      instance.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) return
        // Подія від старого екземпляра — ігноруємо
        if (hlsInstance !== instance || generation !== loadGeneration) return

        console.warn('[Player] HLS fatal error:', sanitizeLog(data?.details || data?.reason || data?.type || 'unknown'))

        // Ліміт спроб — інакше HLS.js може ретраїти вічно (вічний спінер)
        if (hlsRetryCount >= MAX_HLS_RETRIES) {
          console.warn('[Player] HLS retries exhausted → fallback')
          handleStreamFailure()
          return
        }
        hlsRetryCount++

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Таймер ЗАХОПЛЮЄ конкретний екземпляр — старий ретрай
            // не повинен «качати» вже новий потік
            clearRetryTimer()
            retryTimer = setTimeout(() => {
              retryTimer = null
              if (hlsInstance !== instance) return
              if (generation !== loadGeneration) return
              instance.startLoad()
            }, HLS_RETRY_DELAY_MS)
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            instance.recoverMediaError()
            break
          default:
            handleStreamFailure()
            break
        }
      })
      return
    }

    // hls.js не підтримується — спробуємо нативний HLS (iOS Safari).
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = m3u8Url
      video.play().catch(err => {
        if (generation !== loadGeneration) return
        if (handleAutoplayBlocked(err, generation)) return
        console.warn('[Player] Safari play error:', sanitizeLog(err?.message || err))
        handleStreamFailure()
      })
      return
    }

    // Ні hls.js, ні нативний HLS — джерело не відтворити.
    isBuffering.value = false
    clearStreamWatchdog()
    fallbackToGlobal()
  } catch (err) {
    if (generation !== loadGeneration) return
    console.warn('[Player] Не вдалося завантажити HLS-плеєр:', sanitizeLog(err?.message || err))
    handleStreamFailure()
  }
}

// ── Unified Source Loader ───────────────────────────────────────
const loadSource = async (srcId) => {
  // Нове «покоління» — усі попередні async-операції стають неактуальними
  const generation = ++loadGeneration
  currentSource.value = srcId
  hasStarted.value    = true
  isBuffering.value   = true
  hlsRetryCount       = 0
  hlsLowestLevelTried = false
  touchStreamActivity()
  clearRetryTimer()
  clearFallbackTimer()
  clearIframeLoadTimer()

  // Одразу зупиняємо попередній renderer. Інакше старий HLS/iframe
  // продовжував би відтворення під час очікування нового UA-пошуку.
  isHlsMode.value = false
  destroyHls()
  removeIframe()

  // Нова медіа-сесія → новий <video>-елемент (через :key). Запізнілі
  // нативні події старого елемента (error/canplay/playing) тоді не можуть
  // зламати новий потік. nextTick() потрібен, щоб videoRef вказав на
  // новий елемент до роботи з ним.
  mediaGeneration.value++
  pendingUserPlay.value = false
  qualities.value = ['Auto']
  selectedQuality.value = 'Auto'
  await nextTick()
  if (generation !== loadGeneration) return

  const isUaSource = srcId === 'ua_stream'

  // Під час пошуку українського дубляжу watchdog НЕ вмикаємо: сам пошук
  // може тривати довше за 30 с. Своє таймаут-величину (UA_REQUEST_TIMEOUT_MS)
  // має UA-запит, а для вже відтворюваного HLS — startStreamWatchdog().

  if (isUaSource) {
    loaderText.value = 'Пошук українського дубляжу...'
    try {
      // Якщо пошук уже завершився без результату, НЕ запускаємо ще один
      // дорогий запит автоматично. Повтор доступний лише через явну кнопку.
      if (!lastUaData.value && !uaChecked.value) {
        await checkUaStream()
      }

      // Поки чекали відповідь, користувач/watchdog могли вже змінити
      // джерело або фільм — тоді цей результат більше не актуальний.
      if (generation !== loadGeneration) return

      const data = lastUaData.value
      if (data) {
        selectedAudio.value = data.language || 'Українська (Дубляж)'
        // releaseQuality — підтверджений бейдж релізу; selectedQuality —
        // окремий рівень ABR самого HLS («Auto», «720p»…). Не змішуємо їх.
        releaseQuality.value = data.qualityBadge || data.quality || ''

        // ⚠️ ВАЖЛИВО: сторонні плеєри майданчика (zetvideo/ashdi/hdvbua)
        // вбудовують РЕКЛАМУ перед відео. Тому ми НЕ показуємо їхній
        // iframe, а граємо той самий потік УСІМ СВОЇМ HLS-плеєром —
        // без реклами, з власними контролами та перемиканням якості.
        if (data.hlsUrl && isAllowedHlsUrl(data.hlsUrl)) {
          uaIframeFallback = data.ashdiIframe || data.iframeUrl || data.hdvbIframe || null
          loaderText.value = 'Підключення українського потоку...'
          playHlsStream(data.hlsUrl)
          return
        }
        if (data.hlsUrl) {
          console.warn('[Player] HLS-потік з недозволеного домену відхилено')
        }

        // Потік дістати не вдалося — аварійно показуємо лише плеєр
        // майданчика з UA-allow-list (а не випадковий сторонній iframe).
        const frameUrl = data.ashdiIframe || data.iframeUrl || data.hdvbIframe
        if (frameUrl && isAllowedUaFrameUrl(frameUrl)) {
          showIframe(frameUrl, { timeoutMs: 7000 })
          return
        }
      }

      if (generation !== loadGeneration) return

      // Дубляж, знайдений у браузері через релей, — останній UA-варіант
      // перед глобальними джерелами. Мертві сторінки відсіче watchdog.
      if (uaEmbedUrl.value && isAllowedUaFrameUrl(uaEmbedUrl.value)) {
        console.warn('[Player] UA embed знайдено в браузері — запускаю його')
        showIframe(uaEmbedUrl.value, { timeoutMs: 7000 })
        return
      }

      console.warn('[Player] Український дубляж не знайдено — перемикаюсь на резервне джерело')
      loaderText.value = 'Український дубляж не знайдено, перемикаємо на резервне джерело...'
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null
        if (generation !== loadGeneration) return
        fallbackToGlobal()
      }, FALLBACK_DELAY_MS)
    } catch (err) {
      if (generation !== loadGeneration) return
      console.warn('[Player] Proxy server error:', sanitizeLog(err?.message || err))
      fallbackToGlobal()
    }
    return
  }

  // Звичайні iframe джерела
  uaIframeFallback = null
  releaseQuality.value = ''
  loaderText.value = 'Підключення джерела...'
  const url = buildEmbedUrl(srcId, {
    tmdbId: props.tmdbId,
    type: props.type,
    season: props.season,
    episode: props.episode,
  })
  if (!url || !props.tmdbId) {
    console.warn('[Player] Немає tmdbId або джерело не підтримується:', srcId)
    isBuffering.value = false
    clearStreamWatchdog()
    loaderText.value = 'Не вдалося сформувати посилання на джерело'
    return
  }
  showIframe(url)
}

const changeSource = (srcId) => {
  openMenu.value = null
  // Недоступне UA-джерело не запускає повторний дорогий пошук:
  // результат уже відомий. Повторити можна явною кнопкою «Повторити пошук».
  const src = availableSources.value.find(s => s.id === srcId)
  if (src && src.unavailable) {
    console.warn('[Player] Джерело недоступне:', src.label)
    loaderText.value = 'Український дубляж не знайдено'
    return
  }
  loadSource(srcId)
}

/**
 * Явний повтор пошуку UA-дубляжу (користувач натиснув «Повторити пошук»).
 * Обходить rate-limit сервера? Ні — сервер сам обмежує частоту.
 */
const retryUaSearch = async () => {
  openMenu.value = null
  uaChecked.value = false
  lastUaData.value = null
  loaderText.value = 'Повторний пошук українського дубляжу...'
  await checkUaStream(true)
  // Серверний пошук із IP хостингу часто вертає «не знайдено». Паралельно
  // пробуємо знайти плеєр у браузері й вбудувати його на сайт.
  if (!lastUaData.value && !uaEmbedUrl.value) {
    tryClientUaDiscovery()
  }
}

const startPlayback = () => {
  loadSource(currentSource.value)
  checkResume()
}

// ── Playback Controls ───────────────────────────────────────────
const togglePlay = () => {
  const video = videoRef.value
  if (!video) return
  if (video.paused) {
    showOsd('▶', 'Відтворення')
    // play() викликається СИНХРОННО в обробнику кліку — інакше браузер
    // знову відхилить запуск як autoplay.
    const result = video.play()
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          pendingUserPlay.value = false
        })
        .catch(err => {
          if (handleAutoplayBlocked(err, loadGeneration)) return
          console.warn('Play error:', sanitizeLog(err?.message || err))
        })
    }
  } else {
    showOsd('⏸', 'Пауза')
    video.pause()
  }
}

const seekBy = (seconds) => {
  if (!videoRef.value) return
  videoRef.value.currentTime = Math.max(0, Math.min(duration.value, videoRef.value.currentTime + seconds))
  showOsd(seconds > 0 ? '⏩' : '⏪', `${seconds > 0 ? '+' : ''}${seconds}с`)
  onActivity()
}

const onTimelineClick = (e) => {
  if (!videoRef.value || !duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const ratio = Math.max(0, Math.min(1, clickX / rect.width))
  videoRef.value.currentTime = ratio * duration.value
  onActivity()
}

const onTimelineHover = (e) => {
  if (!duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const hoverX = e.clientX - rect.left
  const ratio = Math.max(0, Math.min(1, hoverX / rect.width))
  hoverPercent.value = ratio * 100
  hoverTime.value = ratio * duration.value
}

let lastSavedSec = 0
const onTimeUpdate = (event) => {
  if (!isCurrentMediaEvent(event)) return
  if (videoRef.value) {
    currentTime.value = videoRef.value.currentTime
    // Збереження прогресу кожні 4-5 секунд для функції «Продовжити перегляд»
    if (props.tmdbId && duration.value > 60) {
      const cur = Math.floor(currentTime.value)
      if (Math.abs(cur - lastSavedSec) >= 4 && cur < duration.value - 30) {
        lastSavedSec = cur
        try {
          localStorage.setItem(`alexfilm_resume_${props.tmdbId}`, String(cur))
        } catch (_) {}
      }
    }
    saveLiveSession()
  }
  // Рух відтворення — теж ознака живості потоку
  touchStreamActivity()
}

const onProgress = (event) => {
  if (!isCurrentMediaEvent(event)) return
  if (!videoRef.value || !videoRef.value.buffered.length || !duration.value) return
  const bufferedEnd = videoRef.value.buffered.end(videoRef.value.buffered.length - 1)
  bufferPercent.value = Math.min(100, (bufferedEnd / duration.value) * 100)
}

const onLoadedMetadata = (event) => {
  if (!isCurrentMediaEvent(event)) return
  if (!videoRef.value) return
  duration.value = videoRef.value.duration || 0
  if (pendingSeekTime > 0) {
    const t = Math.min(pendingSeekTime, Math.max(0, duration.value - 5))
    pendingSeekTime = 0
    if (t > 0) {
      try { videoRef.value.currentTime = t } catch (_) {}
      currentTime.value = t
    }
  }
  // Застосовуємо вибрані налаштування гучності одразу з появою метаданих
  videoRef.value.volume = volume.value
  videoRef.value.muted = isMuted.value
}

const onEnded = (event) => {
  if (!isCurrentMediaEvent(event)) return
  isPlaying.value = false
  showControls.value = true
  if (props.tmdbId) {
    try {
      localStorage.removeItem(`alexfilm_resume_${props.tmdbId}`)
    } catch (_) {}
  }
}

const onVolumeChange = () => {
  if (!videoRef.value) return
  videoRef.value.volume = volume.value
  isMuted.value = volume.value === 0
  showOsd(volume.value === 0 ? '🔇' : '🔊', `Гучність ${Math.round(volume.value * 100)}%`)
}

const toggleMute = () => {
  if (!videoRef.value) return
  if (isMuted.value) {
    videoRef.value.muted = false
    isMuted.value = false
    if (volume.value === 0) volume.value = 0.5
    videoRef.value.volume = volume.value
    showOsd('🔊', `Гучність ${Math.round(volume.value * 100)}%`)
  } else {
    videoRef.value.muted = true
    isMuted.value = true
    showOsd('🔇', 'Звук вимкнено')
  }
  onActivity()
}

// ── Керування клавіатурою та пультом Smart TV ───────────────────
const handlePlayerKeyDown = (e) => {
  if (!hasStarted.value) return
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return

  let handled = false
  const key = e.key

  if (key === ' ' || key === 'k' || key === 'K' || key === 'MediaPlayPause') {
    togglePlay()
    handled = true
  } else if (key === 'ArrowLeft' || key === 'j' || key === 'J' || key === 'MediaRewind') {
    seekBy(-10)
    handled = true
  } else if (key === 'ArrowRight' || key === 'l' || key === 'L' || key === 'MediaFastForward') {
    seekBy(10)
    handled = true
  } else if (key === 'ArrowUp') {
    volume.value = Math.min(1, Math.round((volume.value + 0.05) * 100) / 100)
    if (videoRef.value) {
      videoRef.value.volume = volume.value
      videoRef.value.muted = false
      isMuted.value = false
    }
    showOsd('🔊', `Гучність ${Math.round(volume.value * 100)}%`)
    onActivity()
    handled = true
  } else if (key === 'ArrowDown') {
    volume.value = Math.max(0, Math.round((volume.value - 0.05) * 100) / 100)
    if (videoRef.value) {
      videoRef.value.volume = volume.value
    }
    showOsd(volume.value === 0 ? '🔇' : '🔉', `Гучність ${Math.round(volume.value * 100)}%`)
    onActivity()
    handled = true
  } else if (key === 'f' || key === 'F') {
    toggleFullscreen()
    handled = true
  } else if (key === 'm' || key === 'M') {
    toggleMute()
    handled = true
  } else if (/^[0-9]$/.test(key) && duration.value > 0 && isHlsMode.value) {
    const fraction = Number(key) * 0.1
    if (videoRef.value) {
      videoRef.value.currentTime = fraction * duration.value
      showOsd('⏱', `${Number(key) * 10}%`)
      onActivity()
      handled = true
    }
  }

  if (handled) {
    e.preventDefault()
  }
}

// ── Субтитри ─────────────────────────────────────────────────────
// Доріжки беруться з master-маніфеста (#EXT-X-MEDIA:TYPE=SUBTITLES).
// Вони можуть з'явитися не лише в MANIFEST_PARSED, а й пізніше —
// тому оновлюємо список і за подією SUBTITLE_TRACKS_UPDATED.
const refreshSubtitleTracks = (instance) => {
  if (!instance) return
  const tracks = (instance.subtitleTracks || []).map((t, i) => ({
    id: i,
    label: (t.name || t.lang || `Доріжка ${i + 1}`).trim() || `Доріжка ${i + 1}`,
  }))
  subtitleTracks.value = tracks
  if (selectedSubtitle.value >= tracks.length) selectedSubtitle.value = -1
}

const setSubtitle = (idx) => {
  selectedSubtitle.value = idx
  openMenu.value = null
  const instance = hlsInstance
  if (!instance) return
  // subtitleDisplay керує РЕНДЕРИНГОМ (hls.js малює WebVTT поверх відео):
  // вимкнений трек без display=false лишав би порожній оверлей.
  instance.subtitleDisplay = idx !== -1
  instance.subtitleTrack = idx
}

const setQuality = (q) => {
  selectedQuality.value = q
  openMenu.value = null
  if (!hlsInstance) return

  if (q === 'Auto') {
    hlsInstance.currentLevel = -1
    return
  }

  // Індекс рівня НЕ збігається з індексом у списку — шукаємо за висотою
  const height = parseInt(String(q), 10)
  if (Number.isNaN(height) || !hlsInstance.levels?.length) return
  const idx = hlsInstance.levels.findIndex(l => l.height === height)
  if (idx >= 0) {
    hlsInstance.currentLevel = idx
  } else {
    console.warn('[Player] Quality level not found:', q)
    hlsInstance.currentLevel = -1
    selectedQuality.value = 'Auto'
  }
}

const onActivity = () => {
  showControls.value = true
  clearTimeout(hideTimer)
  if (isPlaying.value) {
    hideTimer = setTimeout(() => {
      if (openMenu.value === null) showControls.value = false
    }, 3500)
  }
}

const onMouseLeave = () => {
  if (isPlaying.value && openMenu.value === null) showControls.value = false
}

const toggleMenu = (name) => {
  openMenu.value = openMenu.value === name ? null : name
}

const toggleFullscreen = () => {
  const target = containerRef.value
  if (!target) return

  // Фулскрин цього гравця — перевіряємо, що в фулскрині саме НАШ контейнер,
  // а не якийсь інший елемент сторінки.
  const active = document.fullscreenElement || document.webkitFullscreenElement
  const isOurs = !!active && (active === target || target.contains(active))

  if (!isOurs) {
    // Стан оновлюємо ТІЛЬКИ через fullscreenchange — інакше іконка
    // показує «вихід», коли браузер відхилив запит
    const request = target.requestFullscreen || target.webkitRequestFullscreen
    if (request) {
      Promise.resolve(request.call(target)).catch(err => {
        console.warn('[Player] Fullscreen request rejected:', sanitizeLog(err?.message || err))
      })
    }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen
    if (exit) {
      Promise.resolve(exit.call(document)).catch(err => {
        console.warn('[Player] Fullscreen exit rejected:', sanitizeLog(err?.message || err))
      })
    }
  }
}

// ── Перевірка наявності українського потоку ─────────────────────
// Один запит на фільм: якщо він уже виконується, новий виклик чекає
// на той самий запит (не починаємо пошук двічі).
// `identityGeneration` відстежує ЗМІНУ ФІЛЬМУ, а `loadGeneration` —
// ЗМІНУ ДЖЕРЕЛА. Тому відповідь UA-пошуку зберігається для поточного
// фільму (навіть якщо користувач перемкнув джерело), але ніколи не
// підміняється результатом для іншого фільму.
const checkUaStream = async (forceRetry = false) => {
  // Явний повтор має право скасувати попередній in-flight запит і створити
  // новий. Старий запит не скине новий результат: requestId відсікає його.
  if (forceRetry) {
    if (uaController) {
      try { uaController.abort() } catch (e) {}
    }
    uaController = null
    uaPromise = null
  }
  if (uaPromise) return uaPromise

  const identity = identityGeneration
  const requestId = ++uaRequestId
  const controller = new AbortController()
  uaController = controller
  const signal = controller.signal
  let timeoutId = null
  const isCurrentRequest = () => identity === identityGeneration && requestId === uaRequestId

  uaPromise = (async () => {
    try {
      const qTitle = encodeURIComponent(props.title || '')
      const qOrig  = encodeURIComponent(props.originalTitle || '')
      const qYear  = encodeURIComponent(props.year || '')
      const qType  = encodeURIComponent(props.type || 'movie')
      const apiUrl = `${RELAY_ORIGIN}/api/stream/ua?title=${qTitle}&orig=${qOrig}&year=${qYear}&type=${qType}`

      const res = await fetch(apiUrl, { signal })
      if (!res.ok) {
        console.warn('[Player] UA proxy недоступний:', res.status)
        if (isCurrentRequest()) lastUaData.value = null
        return
      }
      const data = await res.json()
      // Відповідь для вже зміненого фільму або застарілий retry — ігноруємо
      if (!isCurrentRequest()) return

      if (data.success) {
        lastUaData.value = data
        selectedAudio.value = data.language || 'Українська (Дубляж)'
        // Фоновий пошук не має права змінювати інфо-панель активного
        // глобального embed. Бейдж релізу ставимо лише для активного UA.
        const activeUaSource = currentSource.value === 'ua_stream'
        if (activeUaSource) {
          releaseQuality.value = data.qualityBadge || data.quality || ''
        }
      } else {
        lastUaData.value = null
        const activeUaSource = currentSource.value === 'ua_stream'
        if (activeUaSource) releaseQuality.value = ''
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Таймаут або скасування — не вважаємо це «знайдено»
        if (isCurrentRequest()) lastUaData.value = null
        return
      }
      console.warn('[Player] Не вдалося завантажити UA-джерела:', sanitizeLog(err?.message || err))
      if (isCurrentRequest()) lastUaData.value = null
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (isCurrentRequest()) uaChecked.value = true
      // Очищаємо слот лише якщо це все ще ЦЕЙ запит — інакше ми б
      // зняли новий in-flight запит, який стартував після скасування.
      if (requestId === uaRequestId) {
        uaPromise = null
        uaController = null
      }
    }
  })()

  // Жорсткий таймаут самого пошуку: proxy не має лишати плеєр у спінері
  // назавжди, якщо upstream-джерела не відповідають.
  timeoutId = setTimeout(() => {
    try { controller.abort() } catch (e) {}
  }, UA_REQUEST_TIMEOUT_MS)

  return uaPromise
}

// ── Lifecycle ───────────────────────────────────────────────────
// Реагуємо на ЗАВЕРШЕННУ зміну ідентичності фільму (tmdbId, назва, рік, тип).
// Раніше watch слідкував лише за tmdbId — зміна назви/року залишала
// старий UA-реліз для попереднього фільму.
watch(
  () => [props.tmdbId, props.title, props.originalTitle, props.year, props.type],
  async () => {
    // Нове покоління — попередні async-операції більше не актуальні
    loadGeneration++
    // Нова ідентичності фільму: відповідь попереднього UA-пошуку більше
    // не дійсна, а сам запит скасовуємо.
    identityGeneration++
    if (uaController) {
      try { uaController.abort() } catch (e) {}
      uaController = null
    }
    uaPromise = null
    hasStarted.value  = false
    isPlaying.value   = false
    isBuffering.value = false
    isHlsMode.value   = false
    pendingUserPlay.value = false
    currentTime.value = 0
    duration.value    = 0
    lastUaData.value  = null
    releaseQuality.value = ''
    uaChecked.value   = false
    hlsRetryCount     = 0
    qualities.value    = ['Auto']
    selectedQuality.value = 'Auto'
    clearStreamWatchdog()
    clearRetryTimer()
    clearFallbackTimer()
    clearIframeLoadTimer()
    destroyHls()
    removeIframe()
    // Новий <video> для нового фільму — старі нативні події не чіпають
    // новий потік.
    mediaGeneration.value++
    await nextTick()
    checkUaStream()
  },
  { immediate: true }
)

onMounted(() => {
  // Закриття меню при кліку поза ним
  docClickHandler = (e) => {
    if (!e.target.closest('.lampa-dropdown-wrap')) openMenu.value = null
  }
  document.addEventListener('click', docClickHandler)

  // Стан фулскрину — тільки з події браузера (без оптимістичного оновлення)
  // і ТІЛЬКИ для нашого контейнера: чужий фулскрин не має міняти нашу іконку.
  fullscreenHandler = () => {
    const active = document.fullscreenElement || document.webkitFullscreenElement
    const container = containerRef.value
    isFullscreen.value = !!active && !!container && (active === container || container.contains(active))
  }
  document.addEventListener('fullscreenchange', fullscreenHandler)
  document.addEventListener('webkitfullscreenchange', fullscreenHandler)

  // Гарячі клавіші та пульт телевізора
  window.addEventListener('keydown', handlePlayerKeyDown)

  // Перед перезавантаженням вкладки зберігаємо останню позицію
  pageHideHandler = () => saveLiveSession(true)
  window.addEventListener('pagehide', pageHideHandler)

  if (!restoreLiveSession()) checkResume()
})

onBeforeUnmount(() => {
  loadGeneration++
  identityGeneration++
  if (uaController) {
    try { uaController.abort() } catch (e) {}
    uaController = null
  }
  uaPromise = null
  clearTimeout(hideTimer)
  clearTimeout(osdTimer)
  clearTimeout(touchFeedbackTimer)
  clearStreamWatchdog()
  clearRetryTimer()
  clearFallbackTimer()
  clearIframeLoadTimer()
  if (docClickHandler) document.removeEventListener('click', docClickHandler)
  if (fullscreenHandler) {
    document.removeEventListener('fullscreenchange', fullscreenHandler)
    document.removeEventListener('webkitfullscreenchange', fullscreenHandler)
  }
  window.removeEventListener('keydown', handlePlayerKeyDown)
  if (pageHideHandler) window.removeEventListener('pagehide', pageHideHandler)
  clearLiveSession()
  destroyHls()
  removeIframe()
})
</script>

<style scoped>
/* 
  Фірмовий візуальний стиль плеєра LAMPA:
  - Чорний монохромний інтерфейс з м'яким розмиттям (backdrop-filter)
  - Верхня панель (player-info) з назвою, якістю, доріжками та годинником
  - Нижня панель (player-panel) з тонким білим таймлайном та округлими pill-кнопками
*/

.lampa-player-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #000;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.lampa-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.lampa-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 2;
}
.lampa-backdrop-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.85) 100%);
}

.lampa-loader {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  z-index: 8;
  pointer-events: none;
}
.lampa-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #ffcc00;
  border-radius: 50%;
  animation: lampa-spin 0.8s linear infinite;
}
.lampa-loader-text {
  color: #e2e8f0;
  font-size: 0.9rem;
  font-weight: 500;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8);
}
@keyframes lampa-spin {
  to { transform: rotate(360deg); }
}

.lampa-center-start {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  z-index: 4;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.35);
  transition: background 0.3s ease;
  min-width: 0;
  overflow: hidden;
}

.lampa-center-start:hover {
  background: rgba(0, 0, 0, 0.5);
}
.lampa-big-play {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #ffcc00;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 5px;
  box-shadow: 0 0 35px rgba(255, 204, 0, 0.6);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.lampa-center-start:hover .lampa-big-play {
  transform: scale(1.1);
}
.lampa-big-play svg {
  width: 40px;
  height: 40px;
}
.lampa-big-title {
  color: #fff;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
  max-width: 100%;
  padding: 0 1rem;
  text-align: center;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lampa-big-sub {
  color: #cbd5e1;
  font-size: 0.88rem;
  font-weight: 500;
  max-width: 100%;
  padding: 0 1rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ua-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  max-width: 100%;
  margin-top: 0.35rem;
}
.ua-fallback__hint {
  color: #94a3b8;
  font-size: 0.76rem;
}
.ua-fallback__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
}
.ua-fallback__link {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 204, 0, 0.45);
  color: #ffcc00;
  border-radius: 9999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.ua-fallback__link:hover,
.ua-fallback__link:focus-visible {
  background: rgba(255, 204, 0, 0.2);
}
.ua-fallback__retry {
  background: rgba(255, 204, 0, 0.18);
  border-color: #ffcc00;
}

/* ================= LAMPA PLAYER INFO (TOP) ================= */
.player-info {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 1.5rem 2rem;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%);
  transform: translateY(-110%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  opacity: 0;
  z-index: 10;
  pointer-events: none;
}
.player-info.info--visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.player-info__body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.player-info__line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
}
.player-info__titles {
  min-width: 0;
}
.player-info__title {
  font-size: 1.6rem;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
  line-height: 1.2;
  text-wrap: balance;
}
.player-info__name {
  font-size: 0.95rem;
  color: #94a3b8;
  margin-top: 0.2rem;
}
/* Тонкий ряд метаданих: якість релізу та мова дубляжу.
   Без «таблеток» — інакше це виглядає як клікабельні контроли,
   яких тут немає. */
.player-info__meta {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-top: 0.4rem;
}
.player-info__meta-item {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(226, 232, 240, 0.82);
  white-space: nowrap;
}
.player-info__meta-item + .player-info__meta-item::before {
  content: '·';
  margin: 0 0.55rem;
  color: rgba(226, 232, 240, 0.45);
}

/* ================= LAMPA PLAYER PANEL (BOTTOM) ================= */
.player-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2rem 2rem 1.5rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.5) 60%, transparent 100%);
  transform: translateY(110%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  opacity: 0;
  z-index: 10;
  pointer-events: none;
}
.player-panel.panel--visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.player-panel__body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

/* Timeline */
.player-panel__timeline {
  position: relative;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  cursor: pointer;
  transition: height 0.15s ease;
}
.player-panel__timeline:hover {
  height: 9px;
}
.player-panel__peding {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.35);
  border-radius: 9999px;
  pointer-events: none;
}
.player-panel__position {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: #ffffff;
  border-radius: 9999px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  pointer-events: none;
}
.player-panel__thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffcc00;
  box-shadow: 0 0 10px rgba(255, 204, 0, 0.8);
  transform: translateX(50%);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.player-panel__timeline:hover .player-panel__thumb {
  opacity: 1;
}
.player-panel__hover-time {
  position: absolute;
  bottom: 14px;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* Time text line */
.player-panel__line-one {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: #cbd5e1;
  font-variant-numeric: tabular-nums;
  margin-top: -0.2rem;
}

/* Buttons line */
.player-panel__line-two {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.player-panel__left,
.player-panel__right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
}
.player-panel__right {
  justify-content: flex-end;
}
.player-panel__center {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Play/Pause Button по центру */
.player-panel__playpause {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}
.player-panel__playpause:hover {
  background: #ffcc00;
  color: #0f172a;
  transform: scale(1.08);
  box-shadow: 0 0 20px rgba(255, 204, 0, 0.6);
}
.player-panel__playpause svg {
  width: 26px;
  height: 26px;
}

/* Box-Buttons pills */
.player-panel__box-buttons {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 0.15rem 0.35rem;
}

.player-panel__quality {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  border-radius: 9999px;
  letter-spacing: 0.05em;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.player-panel__quality:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Кнопка субтитрів (CC): компактний бейдж у стилі якості. */
.player-panel__subs {
  font-size: 0.72rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

/* Стан «доріжок немає» в меню субтитрів — інформаційний, не кнопка. */
.lampa-menu__empty {
  padding: 0.55rem 0.8rem;
  font-size: 0.75rem;
  color: #64748b;
  white-space: normal;
  line-height: 1.35;
  cursor: default;
}

/* Перемикач джерела — окремий клас (раніше він помилково мав
   клас player-panel__quality, тобто джерело й якість виглядали
   однаково). */
.player-panel__source {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 220px;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  border-radius: 9999px;
  letter-spacing: 0.05em;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.player-panel__source:hover {
  background: rgba(255, 255, 255, 0.15);
}
.player-panel__source-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player-panel__chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.7;
}
.lampa-icon-inline {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.lampa-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f1f5f9;
  padding: 0.4rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.lampa-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffcc00;
}
.lampa-btn svg {
  width: 14px;
  height: 14px;
}

.lampa-btn-icon {
  background: transparent;
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Hit-area не менше 40×40 px (WCAG 2.2 target size). */
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.lampa-btn-icon:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffcc00;
}
.lampa-btn-icon svg {
  width: 18px;
  height: 18px;
}

/* Volume Slider */
.lampa-volume-wrap {
  position: relative;
  display: flex;
  align-items: center;
  padding-right: 0.6rem;
}
.lampa-volume-slider {
  width: 60px;
  height: 4px;
  accent-color: #ffcc00;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 9999px;
}

/* Dropdown Menu у стилі LAMPA */
.lampa-dropdown-wrap {
  position: relative;
}
.lampa-menu {
  position: absolute;
  bottom: calc(100% + 0.6rem);
  right: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.75rem;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 180px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.8);
  z-index: 25;
}
.lampa-menu__item {
  padding: 0.5rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: #cbd5e1;
  border-radius: 0.4rem;
  cursor: pointer;
  white-space: nowrap;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.lampa-menu__item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.lampa-menu__item.active {
  background: #ffcc00;
  color: #0f172a;
  font-weight: 700;
}
/* Повтор пошуку дубляжу — окремим пунктом меню з іконкою. */
.lampa-menu__item--retry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: #fbbf24;
  border-radius: 0 0 0.4rem 0.4rem;
}
.lampa-menu__item--retry:hover {
  color: #fde68a;
  background: rgba(251, 191, 36, 0.08);
}
/* Джерело, для якого не знайдено реліз — приглушене, але клікабельне (дає fallback) */
.lampa-menu__item.unavailable {
  color: #64748b;
  font-style: italic;
}
.lampa-menu__item.unavailable:hover {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
}

/* ══════════════════════════════════════════════
   IFRAME TOPBAR — мінімальна панель поверх iframe
   ══════════════════════════════════════════════ */
.iframe-topbar {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%);
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
}
.iframe-topbar.topbar--visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.iframe-topbar__title {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
}
.iframe-src-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 260px;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.2);
  color: #ffcc00;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.35rem 0.8rem;
  border-radius: 9999px;
  cursor: pointer;
  letter-spacing: 0.03em;
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.iframe-src-btn:hover { background: rgba(255,204,0,0.25); }
.lampa-menu--top { bottom: auto; top: calc(100% + 0.5rem); right: 0; }

/* ══════════════════════════════════════════════
   PRE-SOURCE BAR — вибір джерела до запуску
   ══════════════════════════════════════════════ */
.pre-source-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  z-index: 8;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%);
}
.pre-src-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.15);
  color: #cbd5e1;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.35rem 0.8rem;
  border-radius: 9999px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  white-space: nowrap;
}
.pre-src-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
.pre-src-btn.active { background: #ffcc00; color: #0f172a; border-color: #ffcc00; font-weight: 700; }
.pre-src-btn--ua { border-color: rgba(255, 204, 0, 0.4); }
.pre-src-btn--off { opacity: 0.5; border-style: dashed; }
.pre-src-btn--off:hover { opacity: 0.8; }
.pre-src-btn--retry {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
}
.pre-src-btn--retry:hover { background: rgba(251, 191, 36, 0.12); color: #fde68a; }

/* Видимий фокус для всіх інтерактивних елементів плеєра. */
.player-panel__quality:focus-visible,
.player-panel__source:focus-visible,
.player-panel__playpause:focus-visible,
.lampa-btn:focus-visible,
.lampa-btn-icon:focus-visible,
.lampa-menu__item:focus-visible,
.pre-src-btn:focus-visible,
.iframe-src-btn:focus-visible {
  outline: 2px solid #ffcc00;
  outline-offset: 2px;
}

@media (max-width: 768px) {
  .player-info { padding: 1rem; }
  .player-info__title { font-size: 1.1rem; }
  .player-panel { padding: 1rem 1rem 0.8rem; }
  .lampa-volume-slider { display: none; }
  .lampa-btn span { display: none; }
  .player-panel__playpause { width: 44px; height: 44px; }
  .player-panel__playpause svg { width: 20px; height: 20px; }
}

/* ── OSD Badge (HUD) ─────────────────────────────────────────── */
.lampa-osd-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 204, 0, 0.5);
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(255, 204, 0, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 0.9rem 1.6rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 60;
  pointer-events: none;
  color: #fff;
}
.lampa-osd-icon {
  font-size: 1.4rem;
}
.lampa-osd-text {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.lampa-osd-enter-active,
.lampa-osd-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.lampa-osd-enter-from,
.lampa-osd-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.85);
}

/* ── Mobile Double-Tap Ripple ────────────────────────────────── */
.lampa-touch-ripple {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 38%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 55;
  pointer-events: none;
}
.lampa-touch-ripple--left {
  left: 0;
  background: radial-gradient(circle at 30% 50%, rgba(255, 204, 0, 0.2) 0%, transparent 70%);
}
.lampa-touch-ripple--right {
  right: 0;
  background: radial-gradient(circle at 70% 50%, rgba(255, 204, 0, 0.2) 0%, transparent 70%);
}
.lampa-touch-ripple__inner {
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 204, 0, 0.4);
  padding: 0.6rem 1.1rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ffcc00;
  font-weight: 800;
  font-size: 0.9rem;
  animation: pulseRipple 0.5s ease-out;
}
@keyframes pulseRipple {
  0% { transform: scale(0.7); opacity: 0; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 0.9; }
}

/* ── Resume Playback Banner ──────────────────────────────────── */
.lampa-resume-banner {
  position: absolute;
  bottom: 4.5rem;
  left: 1.5rem;
  right: 1.5rem;
  display: flex;
  justify-content: center;
  z-index: 50;
  pointer-events: auto;
}
.lampa-resume-content {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid #ffcc00;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(255, 204, 0, 0.3);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 0.65rem 1.1rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  color: #f1f5f9;
  font-size: 0.85rem;
}
.lampa-resume-content strong {
  color: #ffcc00;
}
.lampa-resume-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.lampa-resume-btn {
  border: none;
  border-radius: 9999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  transition: all 0.15s ease;
}
.lampa-resume-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.lampa-resume-btn--primary {
  background: #ffcc00;
  color: #0f172a;
}
.lampa-resume-btn--primary:hover {
  background: #ffd633;
}

/* ── Hotkeys Help Menu ───────────────────────────────────────── */
.lampa-menu--hotkeys {
  width: 280px;
  padding: 0.85rem;
  background: rgba(15, 23, 42, 0.96);
  border-color: rgba(255, 204, 0, 0.3);
}
.lampa-hotkeys-title {
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #ffcc00;
  margin-bottom: 0.65rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.lampa-hotkeys-grid {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.lampa-hotkey-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #cbd5e1;
}
.lampa-hotkey-row kbd {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  font-family: inherit;
  font-weight: 700;
  color: #ffcc00;
  font-size: 0.7rem;
}

/* ── Fade Transition ─────────────────────────────────────────── */
.lampa-fade-enter-active,
.lampa-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.lampa-fade-enter-from,
.lampa-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* ── Small screens: keep the player and its overlays inside the frame ── */
@media (max-width: 640px) {
  .lampa-player-container {
    aspect-ratio: auto;
    height: clamp(260px, 72vw, 360px);
    max-width: 100%;
    border-radius: 0.75rem;
  }
  .lampa-center-start {
    gap: 0.45rem;
    padding: 0 0.75rem 74px;
  }
  .lampa-big-play {
    width: 58px;
    height: 58px;
  }
  .lampa-big-play svg {
    width: 28px;
    height: 28px;
  }
  .lampa-big-title {
    font-size: 0.95rem;
    line-height: 1.25;
    padding: 0;
  }
  .lampa-big-sub {
    font-size: 0.72rem;
    padding: 0;
  }
  .pre-source-bar {
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding: 0.5rem 0.75rem 0.75rem;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.72) 100%);
  }
  .pre-source-bar::-webkit-scrollbar {
    display: none;
  }
  .pre-src-btn {
    flex: 0 0 auto;
    font-size: 0.7rem;
    padding: 0.3rem 0.6rem;
    max-width: 55vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
