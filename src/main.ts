import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './ui/app.vue'
import './ui/tokens.css'

createApp(App).use(createPinia()).mount('#app')
