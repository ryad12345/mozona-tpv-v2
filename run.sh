# 1. Descomprimir el archivo generado sobre el workspace
unzip -o mozona-tpv-v2-fixed.zip

# 2. Verificar que compila limpiamente sin errores
npm run build

# 3. Subir a GitHub para activar el despliegue automático en Vercel
git add .
git commit -m "fix(core): Supabase CRUD, 9 tabs settings, darkMode and dvh viewports"
git push origin main
