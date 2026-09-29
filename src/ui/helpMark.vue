<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
  }>(),
  { label: '玩法说明' },
)
</script>

<template>
  <button type="button" class="help-mark" :aria-label="label">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        d="M9.1 9.2a2.9 2.9 0 1 1 4.5 2.4c-.9.6-1.6 1.1-1.6 2.2V15"
      />
      <circle cx="12" cy="18.2" r="1.15" fill="currentColor" />
    </svg>
  </button>
</template>

<style scoped>
.help-mark {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  margin-left: auto;
  padding: 0;
  border-radius: 50%;
  line-height: 1;
}

.help-mark svg {
  display: block;
  width: 16px;
  height: 16px;
  margin: 0 auto;
}
</style>
