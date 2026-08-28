# mozona-tpv-v2#!/bin/bash
# 1. Descomprimir el zip
unzip -o mozona-tpv-local.zip

# 2. Si se creo una subcarpeta mozona-tpv-local, mover todo a la raiz limpia
if [ -d "mozona-tpv-local" ]; then
    cp -r mozona-tpv-local/* .
    cp -r mozona-tpv-local/.[!.]* . 2>/dev/null || true
    rm -rf mozona-tpv-local
fi

# 3. Eliminar el zip original
rm -f mozona-tpv-local.zip

# 4. Guardar y subir a GitHub
git add -A
git commit -m "feat: proyecto completo v0.1.0 limpio"
git push origin main
