import { defineConfig } from 'vite'

// 纯静态站：原版就是"点一下 → 等计时 → 换页"，没有实时性要求，也不需要任何运行时依赖。
// 端口固定 + strictPort：localStorage 按 origin 隔离（含端口），换端口会让存档"消失"。
export default defineConfig({
  server: { port: 5273, strictPort: true },
  preview: { port: 5273, strictPort: true },
  build: { target: 'es2023' },
})
