<template>
  <div class="toast-stack" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="toast in toastStore.items" :key="toast.id" class="toast-item">
        <span class="toast-message">{{ toast.message }}</span>

        <router-link
          v-if="toast.actionTo"
          :to="toast.actionTo"
          class="toast-action"
          @click="toastStore.dismiss(toast.id)"
        >
          {{ toast.actionLabel }}
        </router-link>

        <button class="toast-close" title="Закрити" @click="toastStore.dismiss(toast.id)">✕</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useToastStore } from '../stores/toast'

const toastStore = useToastStore()
</script>

<style scoped>
.toast-stack {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 22rem;
  padding: 0.7rem 0.9rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid #334155;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 600;
}

.toast-message {
  flex: 1;
  line-height: 1.35;
}

.toast-action {
  flex-shrink: 0;
  padding: 0.3rem 0.7rem;
  border-radius: 0.5rem;
  background: #ffcc00;
  color: #020617;
  font-weight: 800;
  font-size: 0.75rem;
  text-decoration: none;
  transition: background 0.2s;
}
.toast-action:hover {
  background: #ffd633;
}

.toast-close {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 1px solid #475569;
  background: transparent;
  color: #94a3b8;
  font-size: 0.65rem;
  cursor: pointer;
  transition: all 0.2s;
}
.toast-close:hover {
  color: #fff;
  border-color: #94a3b8;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
