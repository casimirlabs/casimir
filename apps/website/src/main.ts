import { createApp } from 'vue'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import App from '@/App.vue'
import '@/index.css'
import { createRouter, createWebHistory } from 'vue-router'
import routes from '~pages'

const app = createApp(App)
const router = createRouter({
  history: createWebHistory(),
  routes
})
app.use(router)
app.mount('#app')