# 🎵 Nicofy

Tu reproductor musical personal tipo Spotify, hecho con tecnologías web simples.

## ✨ Características

- **Reproductor web responsive** - Funciona perfecto en celular y desktop
- **Visualizador de audio en tiempo real** - Barras de frecuencia que reaccionan a tu música
- **Streaming optimizado** - Las canciones comienzan a reproducirse inmediatamente
- **Lista de reproducción** - Navega fácilmente entre tus canciones
- **Controles completos** - Play/pause, skip, volumen, seek
- **Modo oscuro** - Diseño moderno inspirado en Spotify

## 🚀 Cómo Usar

### 1. Agregar tu música

1. Crea una carpeta llamada `music` (si no existe)
2. Agrega tus archivos MP3 en esa carpeta
3. Edita `config.json` para agregar tus canciones:

```json
{
  "songs": [
    {
      "file": "mi-cancion.mp3",
      "title": "Título de mi canción",
      "artist": "Tu nombre"
    }
  ]
}
```

### 2. Probar localmente

Simplemente abre `index.html` en tu navegador.

### 3. Publicar en GitHub Pages

1. Crea un repositorio en GitHub (ej: `nicofy`)
2. Sube todos los archivos del proyecto
3. Ve a Settings → Pages
4. Selecciona la rama `main` o `master` y guarda
5. Tu reproductor estará disponible en: `https://tu-usuario.github.io/nicofy`

## 📁 Estructura del Proyecto

```
nicofy/
├── index.html          # Página principal
├── styles.css          # Estilos personalizados
├── app.js              # Lógica del reproductor
├── config.json         # Lista de canciones
├── music/              # Tus archivos MP3
│   ├── cancion1.mp3
│   └── cancion2.mp3
└── README.md           # Este archivo
```

## 🛠️ Tecnologías Usadas

- **HTML5** - Estructura
- **JavaScript Vanilla** - Lógica (sin frameworks)
- **Tailwind CSS** - Estilos
- **HTML5 Audio API** - Reproducción de audio
- **Web Audio API** - Visualizador de audio
- **GitHub Pages** - Hosting gratuito

## 📱 Uso en Celular

El reproductor está optimizado para móviles:
- Interfaz touch-friendly
- Controles grandes y fáciles de usar
- Diseño responsive que se adapta a cualquier pantalla
- Funciona como PWA (puedes agregarlo a tu pantalla de inicio)

## 🎨 Personalización

### Cambiar colores

Edita `styles.css` y busca los gradientes con colores como `#22c55e` (verde) para cambiarlos.

### Cambiar el título

Edita el `<title>` en `index.html`.

## 📝 Notas

- Los archivos MP3 deben estar en la carpeta `music/`
- Para mejor rendimiento, usa MP3 a 128kbps
- El visualizador se activa al primer play (requerimiento del navegador)

## 🤝 Contribuir

¡Siéntete libre de mejorar este proyecto!

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/awesome-feature`)
3. Commit tus cambios (`git commit -m 'Add awesome feature'`)
4. Push a la rama (`git push origin feature/awesome-feature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es open source y disponible para uso personal.

---

Hecho con 💚 por NicoLast updated: Sat Mar 21 18:09:38 UTC 2026
