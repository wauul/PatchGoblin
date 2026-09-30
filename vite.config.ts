import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],root:'web',build:{outDir:'../dist/client',emptyOutDir:true},server:{proxy:{'/api':process.env.PATCHGOBLIN_API_URL||'http://127.0.0.1:8787'}}});
