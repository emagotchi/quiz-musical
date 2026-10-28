import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward the multiplayer socket to the game server (npm run dev starts both).
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
