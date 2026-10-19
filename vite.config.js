import { defineConfig } from 'vite';
export default defineConfig({server:{proxy:{'/api':'http://127.0.0.1:17882','/mcp':'http://127.0.0.1:17882'}},build:{outDir:'dist'}});
