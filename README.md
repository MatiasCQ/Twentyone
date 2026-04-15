# Twenty One Static Edition

Sitio estatico inspirado en `Twenty One` de Roblox, listo para publicarse en GitHub Pages. Incluye:

- `Contra bot`
- `2 jugadores local`
- `Online` con PeerJS y salas estilo lobby
- `25` comodines/trumps

## Archivos

- `index.html`: entrada principal
- `styles.css`: estilos
- `app.js`: motor del juego, UI y online
- `server/peer-server.js`: servidor PeerJS con discovery habilitado

## Como publicar la web

1. Sube estos archivos a un repositorio de GitHub.
2. Activa GitHub Pages apuntando a la rama principal o a la carpeta que prefieras.
3. Abre la URL publicada.

Los modos `bot` y `local` funcionan solo con el frontend. El modo `online` necesita desplegar el PeerServer.

## Como desplegar el PeerServer

1. Entra a la carpeta `server`.
2. Instala dependencias con `npm install`.
3. Configura estas variables:
   - `PORT`
   - `PEER_PATH`
   - `ALLOWED_ORIGINS`
4. Inicia el servidor con `npm start`.

Ejemplo:

```bash
cd server
npm install
set PORT=9000
set PEER_PATH=/twentyone
set ALLOWED_ORIGINS=https://tu-usuario.github.io
npm start
```

## Configurar el cliente online

La interfaz online permite guardar:

- `host`
- `port`
- `path`
- `secure`

Tambien puedes editar el bloque `window.TWENTY_ONE_CONFIG` en `index.html`.

## Notas

- El lobby de salas publicas depende del endpoint `GET /peers` con `allow_discovery`.
- El online es P2P y usa snapshots para recuperarse de desync.
- La UI oculta cartas privadas, pero al ser P2P un usuario avanzado podria inspeccionar estado localmente.
