# 1. Descomprimir el archivo sobre el proyecto
unzip -o mozona-tpv-v2-fixed.zip

# 2. Verificar que compila limpiamente
npm run build

# 3. Subir a GitHub para que Vercel redespliegue automáticamente
git add .
git commit -m "fix(websocket): useWebSocket con stub inerte a prueba de fallos"
git push origin main
