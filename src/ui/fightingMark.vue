<script setup lang="ts">
const swordTilt = [-33, 33]
</script>

<template>
  <i class="fighting-mark" role="img" aria-label="交战中">
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <g v-for="deg in swordTilt" :key="deg" :transform="`rotate(${deg} 16 13)`">
        <path
          fill="#e6e1d4"
          stroke="#c6a24d"
          stroke-width="0.7"
          stroke-linejoin="round"
          d="M16 1.8 L18.35 16.15 L16 16.95 L13.65 16.15 Z"
        />
        <path fill="#b7b1a2" d="M16 1.8 L18.35 16.15 L16 16.95 Z" />
        <path d="M16 4.1 V14.6" stroke="#fffaf0" stroke-width="0.75" stroke-linecap="round" />
        <path
          fill="#e8c35a"
          stroke="#a67c12"
          stroke-width="0.45"
          stroke-linejoin="round"
          d="M8.3 16.15 L12.2 15.55 L16 16.35 L19.8 15.55 L23.7 16.15 L22.35 18.35 L16 17.7 L9.65 18.35 Z"
        />
        <path
          fill="#e8c35a"
          stroke="#a67c12"
          stroke-width="0.4"
          stroke-linejoin="round"
          d="M8.3 16.15 L6.45 14.15 L9.7 16.75 Z"
        />
        <path
          fill="#e8c35a"
          stroke="#a67c12"
          stroke-width="0.4"
          stroke-linejoin="round"
          d="M23.7 16.15 L25.55 14.15 L22.3 16.75 Z"
        />
        <path fill="#6a4218" d="M14.55 18.15 H17.45 L17.15 24.15 H14.85 Z" />
        <path
          d="M14.65 19.9 H17.35 M14.6 21.5 H17.4 M14.65 23.05 H17.3"
          stroke="#3e2814"
          stroke-width="0.55"
          stroke-linecap="round"
        />
        <circle cx="16" cy="25.55" r="1.85" fill="#e8c35a" stroke="#a67c12" stroke-width="0.5" />
        <circle cx="16" cy="25.55" r="0.55" fill="#fff6d0" />
      </g>
      <g class="spark">
        <path fill="#fff6c8" d="M16 7.6 L17.2 11.35 L21.1 12.15 L17.2 12.95 L16 16.7 L14.8 12.95 L10.9 12.15 L14.8 11.35 Z" />
        <path fill="#f0c14a" d="M16 9.15 L16.75 11.55 L19.15 12.15 L16.75 12.75 L16 15.15 L15.25 12.75 L12.85 12.15 L15.25 11.55 Z" />
        <path fill="#f6d56a" d="M20.7 9.35 L21.9 9.7 L21.05 10.45 Z" />
        <path fill="#fff4c2" d="M11.15 9.7 L10.95 10.5 L11.85 10.1 Z" />
        <path fill="#f6d56a" d="M10.7 14.55 L11.65 15.4 L10.55 15.55 Z" />
        <path fill="#fff4c2" d="M21.7 13.55 L22.45 13.7 L21.95 14.3 Z" />
      </g>
    </svg>
  </i>
</template>

<style scoped>
.fighting-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  pointer-events: none;
  user-select: none;
  font-style: normal;
  line-height: 0;
}

.fighting-mark svg {
  display: block;
  width: 22px;
  height: 22px;
  overflow: visible;
  transform-origin: 50% 40.6%;
  animation: fighting-tremble 0.95s ease-in-out infinite;
}

.spark {
  transform-box: fill-box;
  transform-origin: center;
  animation: fighting-spark 0.7s ease-in-out infinite;
}

@keyframes fighting-tremble {
  0%,
  100% {
    transform: rotate(-1.6deg) scale(1);
  }
  40% {
    transform: rotate(1.8deg) scale(1.06);
  }
  70% {
    transform: rotate(-1deg) scale(0.98);
  }
}

@keyframes fighting-spark {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fighting-mark svg,
  .spark {
    animation: none;
  }

  .spark {
    opacity: 1;
  }
}
</style>
