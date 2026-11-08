# Dbr Launcher — Dragon Block Resurrection

Launcher optimizado y portable para el servidor de Minecraft **Dragon Block Resurrection** (Minecraft Forge 1.7.10).

## 🚀 Características
- **100% Portable**: Ejecutable autónomo sin instaladores pesados ni permisos de administrador.
- **Auto-conexión**: Conexión directa y automática al servidor `dragonblock.online:25625`.
- **Sincronización de Mods Inteligente**: Detecta automáticamente cualquier mod agregado o modificado en la carpeta `MODS/`.
- **Pack de Texturas Integrado**: Carga automática de `DbrTexture v6.zip` con interfaz personalizada de Dragon Ball.
- **Música temática de fondo**: BSO temática con control de pausa y control deslizante de volumen.
- **Login Microsoft & No-Premium**: Soporte de login offline y autenticación con Microsoft mediante código de dispositivo (botón de copiado en un clic).

## 📁 Estructura del Proyecto
- `decompiled_app/`: Código fuente de la aplicación Electron (React + Zustand + Tailwind/CSS).
  - `out/main/`: Proceso principal de Electron (gestor de Java, sincronizador de mods, launcher de Minecraft).
  - `out/renderer/`: Interfaz gráfica con tema Dragon Ball x Minecraft.
- `MODS/`: Mods del servidor (DragonBlockC, JRMCore, CustomNPCs, texturas, etc.).
- `cancion.mp3`: Pista de audio para el fondo del launcher.

## 🛠️ Empaquetado de la versión Portable
Para empaquetar los cambios del código en el archivo `app.asar`:
```bash
npx asar pack decompiled_app "Dbr-Launcher-Portable/resources/app.asar"
```
