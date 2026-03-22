// Nicofy - Reproductor Musical con Visualizador
// ============================================

const audioAdvanced = document.getElementById('audioPlayer');
const audioDirect = new Audio();
let _activePlayer = audioAdvanced;

// Simulamos a audioPlayer para que desvíe el tráfico al motor correcto
const audioPlayer = new Proxy({}, {
    get(target, prop) {
        if (prop === 'addEventListener') {
            return (type, listener, options) => {
                audioAdvanced.addEventListener(type, listener, options);
                audioDirect.addEventListener(type, listener, options);
            };
        }
        if (prop === 'removeEventListener') {
            return (type, listener, options) => {
                audioAdvanced.removeEventListener(type, listener, options);
                audioDirect.removeEventListener(type, listener, options);
            };
        }
        if (prop === 'switchEngine') {
            return (isRemote) => {
                audioAdvanced.pause();
                audioDirect.pause();
                _activePlayer = isRemote ? audioDirect : audioAdvanced;
            };
        }
        if (prop === 'isActiveRemote') {
            return () => _activePlayer === audioDirect;
        }
        const val = _activePlayer[prop];
        if (typeof val === 'function') {
            return val.bind(_activePlayer);
        }
        return val;
    },
    set(target, prop, value) {
        if (prop === 'volume' || prop === 'muted') {
            // Sincronizar parámetros globales en ambos
            audioAdvanced[prop] = value;
            audioDirect[prop] = value;
            return true;
        }
        _activePlayer[prop] = value;
        return true;
    }
});
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const progressBar = document.getElementById('progressBar');
const volumeBar = document.getElementById('volumeBar');
const muteBtn = document.getElementById('muteBtn');
const volUpIcon = document.getElementById('volUpIcon');
const volMuteIcon = document.getElementById('volMuteIcon');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const songTitle = document.getElementById('songTitle');
const artistName = document.getElementById('artistName');
const playlistEl = document.getElementById('playlist');
const albumArt = document.getElementById('albumArt');
const albumImg = document.getElementById('albumImg');
const defaultAlbumIcon = document.getElementById('defaultAlbumIcon');
const mainBody = document.getElementById('mainBody');
const dropZone = document.getElementById('dropZone');
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

// Modal Edit
const editModal = document.getElementById('editModal');
const editTitle = document.getElementById('editTitle');
const editArtist = document.getElementById('editArtist');
const editImage = document.getElementById('editImage');
const saveEdit = document.getElementById('saveEdit');
const cancelEdit = document.getElementById('cancelEdit');

// Estado del reproductor
let playlist = [];
let originalPlaylist = []; 
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0; 
let isMuted = false;
let previousVolume = 0.8;
let dominantColor = 'rgb(34, 197, 94)'; 
let editingIndex = null;

// Descubrimiento de archive.org
let archiveDiscoveryInterval = null;
const ARCHIVE_COLLECTION = 'nicofy'; // Cambia esto por tu colección real
const DISCOVERY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
let isDiscovering = false;

// Google Cast
let castContext = null;
let isCasting = false;

// Audio context y visualizador (existing)
let audioContext = null;
let analyser = null;
let source = null;
let bassNode = null;
let trebleNode = null;
let gainNode = null;
let animationId = null;

const kittens = [
    'images/dj_kitten_beach.png',
    'images/dj_kitten_cyberpunk.png',
    'images/dj_kitten_festival.png',
    'images/dj_kitten_lofi.png',
    'images/dj_kitten_space.png',
    'images/dj_kitten_tokyo.png'
];

function getKittenFor(filename) {
    let hash = 0;
    for (let i = 0; i < filename.length; i++) {
        hash = filename.charCodeAt(i) + ((hash << 5) - hash);
    }
    return kittens[Math.abs(hash) % kittens.length];
}

// Configurar canvas

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Cargar Overrides de LocalStorage
function getOverrides() {
    const data = localStorage.getItem('nicofy_overrides');
    return data ? JSON.parse(data) : {};
}

function saveOverride(file, metadata) {
    const overrides = getOverrides();
    overrides[file] = metadata;
    localStorage.setItem('nicofy_overrides', JSON.stringify(overrides));
}

// Extraer color dominante de imagen
function getAverageColor(imgEl) {
    try {
        const c = document.createElement('canvas');
        const cx = c.getContext('2d');
        c.width = imgEl.naturalWidth || 50;
        c.height = imgEl.naturalHeight || 50;
        cx.drawImage(imgEl, 0, 0, c.width, c.height);
        const data = cx.getImageData(0, 0, c.width, c.height).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 40) {
            r += data[i]; g += data[i+1]; b += data[i+2];
            count++;
        }
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        return `rgb(${r},${g},${b})`;
    } catch (e) {
        return 'rgb(34,197,94)';
    }
}

// Inicializar Audio Context para el visualizador
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        bassNode = audioContext.createBiquadFilter();
        bassNode.type = "lowshelf";
        bassNode.frequency.value = 200;
        bassNode.gain.value = document.getElementById('bassEq').value;

        trebleNode = audioContext.createBiquadFilter();
        trebleNode.type = "highshelf";
        trebleNode.frequency.value = 3000;
        trebleNode.gain.value = document.getElementById('trebleEq').value;

        gainNode = audioContext.createGain();
        gainNode.gain.value = isMuted ? 0 : document.getElementById('volumeBar').value / 100;

        // FIX: Solo enchufar el motor local avanzado nativo. Si se enchufaba el dinámico por error o el proxy, el navegador reventaba.
        source = audioContext.createMediaElementSource(audioAdvanced);
        
        source.connect(bassNode);
        bassNode.connect(trebleNode);
        trebleNode.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// Visualizador de audio
function drawVisualizer() {
    if (!analyser) {
        animationId = requestAnimationFrame(drawVisualizer);
        return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    if (audioPlayer.isActiveRemote()) {
        if (isPlaying) {
            for (let i = 0; i < bufferLength; i++) {
                const noise = Math.random() * 60;
                const wave = Math.sin(Date.now() / 200 + i * 0.1) * 40;
                dataArray[i] = Math.max(0, (noise + wave + 50) * audioPlayer.volume);
            }
        } else {
            dataArray.fill(0);
        }
    } else {
        analyser.getByteFrequencyData(dataArray);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight, x = 0;

    let gradDominant = dominantColor.replace('rgb', 'rgba').replace(')', ', 0.6)');
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, gradDominant);
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.2)');

    for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height * 0.4;
        const centerY = canvas.height / 2;
        ctx.fillStyle = gradient;
        ctx.fillRect(x, centerY + 10, barWidth, barHeight);
        ctx.fillStyle = gradDominant.replace('0.6)', '0.15)');
        ctx.fillRect(x, centerY - 10 - barHeight, barWidth, barHeight * 0.5);
        x += barWidth + 1;
    }
    animationId = requestAnimationFrame(drawVisualizer);
}

// Cargar configuración de canciones -Solo MP3 de archive.org
async function loadPlaylist() {
    try {
        console.log('🔄 Iniciando carga de playlist...');
        
        const ARCHIVE_COLLECTION = 'nicofy';
        let items = [];
        
        // Obtener todos los items del item (no es una colección)
        try {
            console.log('📡 Consultando archive.org metadata...');
            const archiveResponse = await fetch(
                `https://archive.org/metadata/${ARCHIVE_COLLECTION}`,
                { method: 'GET', mode: 'cors', cache: 'no-cache' }
            );
            
            if (archiveResponse.ok) {
                const archiveData = await archiveResponse.json();
                const allFiles = archiveData.files || [];
                console.log(`📁 Total de archivos en el ítem: ${allFiles.length}`);
                
                // Filtrar solo los que son archivos MP3
                items = allFiles.filter(item => 
                    item.name && item.name.toLowerCase().endsWith('.mp3')
                );
                console.log(`🎵 Items MP3 encontrados: ${items.length}`);
                
                // Mostrar los archivos encontrados
                if (items.length > 0) {
                    console.log('📋 Archivos MP3:', items.map(i => i.name).join(', '));
                }
            } else {
                console.log('❌ Error en respuesta:', archiveResponse.status);
            }
        } catch (e) {
            console.log('❌ Error fetching:', e.message);
        }
        
        // Generar URLs de MP3
        const rawSongs = items.map(item => {
            const filename = item.name;
            // URL directa al archivo MP3 en archive.org
            const mp3Url = `https://archive.org/download/${ARCHIVE_COLLECTION}/${encodeURIComponent(filename)}`;
            
            return {
                file: mp3Url,
                title: item.title || filename.replace('.mp3', '').replace(/_/g, ' '),
                artist: item.creator || 'DJ Nico',
                image: getKittenFor(filename)
            };
        });
        
console.log(`✅ Playlist generada: ${rawSongs.length} canciones`);
        
        const overrides = getOverrides();
        
        playlist = rawSongs.map(s => {
            const override = overrides[s.file];
            return {
                ...s,
                title: override?.title || s.title || s.file,
                artist: override?.artist || s.artist || 'Artista desconocido',
                image: override?.image || s.image || null,
                src: s.file
            };
        });
        
        originalPlaylist = [...playlist];
        
        if (playlist.length === 0) {
            playlistEl.innerHTML = '<p class="text-gray-500 text-center py-4">No hay canciones.<br>Sube archivos a tu colección en archive.org</p>';
        }
        
        renderPlaylist();
        hideSplashScreen();
    } catch (error) {
        console.error('Error cargando playlist:', error);
        hideSplashScreen();
        playlistEl.innerHTML = '<p class="text-gray-500 text-center py-4">Error al cargar. Intenta recargar la página.</p>';
    }
}

// Renderizar playlist
function renderPlaylist() {
    if (playlist.length === 0) {
        playlistEl.innerHTML = '<p class="text-gray-500 text-center py-4">No hay canciones. Arrastra archivos MP3 o edita config.json.</p>';
        return;
    }

    playlistEl.innerHTML = playlist.map((song, index) => {
        let isActive = index === currentIndex;
        return `
        <div class="playlist-item p-3 rounded-2xl bg-gray-700/30 flex items-center gap-3 group ${isActive ? 'active ring-1 ring-green-500/50 bg-green-500/10' : ''}" data-index="${index}">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0 overflow-hidden relative shadow-inner cursor-pointer play-trigger">
                ${song.image ? `<img src="${song.image}" class="w-full h-full object-cover">` : 
                `<svg class="w-6 h-6 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>`}
                ${isActive ? '<div class="absolute inset-0 bg-green-500/20 flex items-center justify-center"><div class="w-2 h-2 bg-green-500 rounded-full animate-ping"></div></div>' : ''}
            </div>
            <div class="flex-1 min-w-0 cursor-pointer play-trigger">
                <p class="font-bold truncate text-sm ${isActive ? 'text-green-400' : 'text-gray-100'}">${song.title}</p>
                <p class="text-[10px] uppercase tracking-wider text-gray-500 font-bold truncate">${song.artist}</p>
            </div>
            <button class="edit-btn p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-600 transition-all text-gray-400 hover:text-white" data-index="${index}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
        </div>
    `;}).join('');

    // Event Listeners
    document.querySelectorAll('.play-trigger').forEach(el => {
        el.addEventListener('click', (e) => {
            const parent = e.target.closest('.playlist-item');
            playSong(parseInt(parent.dataset.index));
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(parseInt(btn.dataset.index));
        });
    });
}

// Modal Logic
function openEditModal(index) {
    editingIndex = index;
    const song = playlist[index];
    editTitle.value = song.title;
    editArtist.value = song.artist;
    editImage.value = song.image || '';
    editModal.classList.remove('hidden');
}

saveEdit.addEventListener('click', () => {
    if (editingIndex === null) return;
    const song = playlist[editingIndex];
    const newMetadata = {
        title: editTitle.value,
        artist: editArtist.value,
        image: editImage.value
    };
    
    saveOverride(song.file, newMetadata);
    
    // Update local state
    playlist[editingIndex] = { ...playlist[editingIndex], ...newMetadata };
    
    // If it's the current song, update player UI
    if (editingIndex === currentIndex) {
        songTitle.textContent = newMetadata.title;
        artistName.textContent = newMetadata.artist;
        if (newMetadata.image) {
            albumImg.src = newMetadata.image;
            albumImg.classList.remove('hidden');
            defaultAlbumIcon.classList.add('hidden');
        }
    }
    
    renderPlaylist();
    editModal.classList.add('hidden');
});

cancelEdit.addEventListener('click', () => editModal.classList.add('hidden'));

// Reproducir canción
function playSong(index, startTime = 0, autoPlay = true) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const song = playlist[index];

    songTitle.textContent = song.title;
    artistName.textContent = song.artist;
    progressBar.value = 0;
    currentTimeEl.textContent = '0:00';
    durationEl.textContent = '0:00';

    if (song.image) {
        albumImg.src = song.image;
        albumImg.classList.remove('hidden');
        defaultAlbumIcon.classList.add('hidden');
        albumImg.onload = () => {
            const color = getAverageColor(albumImg);
            dominantColor = color;
            mainBody.style.background = `linear-gradient(to bottom right, #111827, ${color.replace('rgb', 'rgba').replace(')', ', 0.15)')}, #111827)`;
            albumArt.style.boxShadow = `0 0 50px ${color.replace('rgb', 'rgba').replace(')', ', 0.4)')}`;
        };
    } else {
        albumImg.classList.add('hidden');
        defaultAlbumIcon.classList.remove('hidden');
        dominantColor = 'rgb(34, 197, 94)';
        mainBody.style.background = ''; 
        albumArt.style.boxShadow = `0 0 50px rgba(34, 197, 94, 0.4)`;
    }

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            artwork: song.image ? [{ src: song.image }] : []
        });
    }

    const isRemote = song.src.startsWith('http');
    audioPlayer.switchEngine(isRemote);
    
    // Reactivar panel ecualizador a los usuarios sin oscurecerlo
    const eqPanel = document.getElementById('eqPanel');
    if (eqPanel) {
        if (isRemote) {
            eqPanel.classList.add('opacity-30', 'pointer-events-none');
            eqPanel.setAttribute('title', 'Tus metadatos están en la nube. El módulo EQ está deshabilitado.');
        } else {
            eqPanel.classList.remove('opacity-30', 'pointer-events-none');
            eqPanel.removeAttribute('title');
        }
    }
    
    // Mostrar visual de cargando mientras hacemos el buffering
    const songLoader = document.getElementById('songLoader');
    if (songLoader) songLoader.classList.remove('hidden');
    albumArt.classList.remove('playing');

    // Audio Setup
    audioPlayer.src = '';
    if (!isRemote) {
        audioPlayer.crossOrigin = "anonymous"; 
    }
    audioPlayer.src = song.src;
    audioPlayer.preload = 'auto'; // Re-habilitar carga automática para que se llene el bufer cuanto antes
    audioPlayer.load();
    
    // Asignar el tiempo de inicio guardado (set timeout para asegurar que el buffer esté listo en Safari)
    if (startTime > 0) {
        audioPlayer.addEventListener('loadedmetadata', function setTime() {
            audioPlayer.currentTime = startTime;
            audioPlayer.removeEventListener('loadedmetadata', setTime);
        });
    }

    // Resume context on play
    if (autoPlay && audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (autoPlay) playAudio();
    updatePlaylistUI();
}

function playAudio() {
    initAudioContext();
    audioPlayer.play().then(() => {
        isPlaying = true;
        updatePlayButton();
        albumArt.classList.add('playing');
        if (animationId) cancelAnimationFrame(animationId);
        drawVisualizer();
    }).catch(err => {
        // Ignoramos AbortError porque ocurre naturalmente al cambiar rápido de canción
        if (err.name !== 'AbortError') console.error('Play Error:', err);
    });
}

function pauseAudio() {
    audioPlayer.pause();
    isPlaying = false;
    updatePlayButton();
    albumArt.classList.remove('playing');
    if (animationId) cancelAnimationFrame(animationId);
}

function togglePlay() {
    if (audioPlayer.src === '') playlist.length > 0 && playSong(0);
    else isPlaying ? pauseAudio() : playAudio();
}

function updatePlayButton() {
    if (isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
    } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
}

function updatePlaylistUI() {
    renderPlaylist();
}

const formatTime = seconds => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Descubrimiento de archivos en archive.org
async function discoverArchiveFiles() {
    if (isDiscovering) return;
    
    isDiscovering = true;
    const refreshBtn = document.getElementById('refreshArchiveBtn');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m0 0l3.889 3.889L12 8.5l3.889-3.889M16 11.5V6a2 2 0 00-2-2h-5.5a2 2 0 00-3.898.562l-.002.003M16 11.5a4 4 0 11-7.898 3.44l-.002.002M4 16l4.898-7.898M4 16v2.5a2 2 0 002 2H9.5l.002-.002"></path></svg>';
        refreshBtn.title = 'Buscando archivos...';
        refreshBtn.disabled = true;
    }

    try {
        // Usar la API metadata de archive.org para buscar archivos en el ítem
        const response = await fetch(`https://archive.org/metadata/${ARCHIVE_COLLECTION}`);
        
        if (!response.ok) {
            throw new Error(`Error de archive.org: ${response.status}`);
        }
        
        const data = await response.json();
        const allFiles = data.files || [];
        
        // Filtrar solo los que tienen nombre terminando en .mp3 (evitar vacíos)
        const validItems = allFiles.filter(f => f.name && f.name.toLowerCase().endsWith('.mp3'));
        
        // Obtener overrides actuales para preservar metadatos editados
        const overrides = getOverrides();
        
        // Convertir a formato de canción
        const discoveredSongs = validItems.map(file => {
            const filename = file.name;
            const mp3Url = `https://archive.org/download/${ARCHIVE_COLLECTION}/${encodeURIComponent(filename)}`;
            
            return {
                file: mp3Url,
                title: file.title || filename.replace('.mp3', ''),
                artist: file.creator || 'Desconocido',
                image: getKittenFor(filename),
                src: mp3Url
            };
        });
        
        // Sincronización completa: eliminar archivos que ya no están en archive.org y añadir nuevos
        // Primero, separar archivos locales (drag & drop) de los de archive.org
        const localFiles = playlist.filter(song => !song.file.includes('archive.org/download/'));
        
        // Crear un mapa de los ítems actuales de archive.org por filename
        const archiveOrgMap = new Map();
        for (const file of validItems) {
            const filename = file.name;
            archiveOrgMap.set(filename, {
                title: file.title || filename.replace('.mp3', ''),
                artist: file.creator || 'Desconocido'
            });
        }
        
        // Crear un mapa de nuestras canciones existentes de archive.org por filename
        const existingArchiveMap = new Map();
        for (const song of playlist) {
            if (song.file.includes('archive.org/download/')) {
                try {
                    const urlObj = new URL(song.file);
                    const parts = urlObj.pathname.split('/').filter(Boolean); 
                    if (parts.length >= 3) {
                        const filename = decodeURIComponent(parts[parts.length - 1]); 
                        existingArchiveMap.set(filename, song);
                    }
                } catch (e) {
                    // Ignorar
                }
            }
        }
        
        // Construir la nueva lista de canciones de archive.org
        const newArchiveSongs = [];
        const currentOverrides = getOverrides();
        for (const [filename, archiveMeta] of archiveOrgMap) {
            // Construir la URL estándar para este archivo
            const fileURL = `https://archive.org/download/${ARCHIVE_COLLECTION}/${encodeURIComponent(filename)}`;
            
            // Verificar si tenemos metadatos sobrescritos por el usuario
            const overrideMeta = currentOverrides[fileURL];
            
            let finalMeta;
            if (overrideMeta) {
                // Usar metadatos sobrescritos por el usuario
                finalMeta = {
                    title: overrideMeta.title,
                    artist: overrideMeta.artist,
                    image: overrideMeta.image || null
                };
            } else if (existingArchiveMap.has(filename)) {
                // La canción existía previamente
                const existingSong = existingArchiveMap.get(filename);
                finalMeta = {
                    title: existingSong.title,
                    artist: existingSong.artist,
                    image: existingSong.image || null
                };
            } else {
                // Nueva canción
                finalMeta = {
                    title: archiveMeta.title,
                    artist: archiveMeta.artist,
                    image: getKittenFor(filename)
                };
            }
            
            // Añadir a la nueva lista
            newArchiveSongs.push({
                ...finalMeta,
                file: fileURL,
                src: fileURL
            });
        }
        
        // La nueva playlist
        playlist = [...localFiles, ...newArchiveSongs];
        originalPlaylist = [...playlist]; 
        
        // Actualizar UI
        renderPlaylist();
        
        // Calcular cambios para notificación
        const existingArchiveIdentifiers = new Set();
        for (const song of playlist) {
            if (song.file.includes('archive.org/download/')) {
                try {
                    const urlObj = new URL(song.file);
                    const parts = urlObj.pathname.split('/').filter(Boolean);
                    if (parts.length >= 3) {
                        const filename = decodeURIComponent(parts[parts.length - 1]);
                        existingArchiveIdentifiers.add(filename);
                    }
                } catch (e) {}
            }
        }
        
        const archiveOrgIdentifiers = new Set(validItems.map(item => item.name));
        const added = [...archiveOrgIdentifiers].filter(id => !existingArchiveIdentifiers.has(id));
        const removed = [...existingArchiveIdentifiers].filter(id => !archiveOrgIdentifiers.has(id));
        
        // Notificar al usuario
        if (added.length > 0 || removed.length > 0) {
            let message = '';
            if (added.length > 0) message += `Se añadieron ${added.length} nueva(s) canción(es). `;
            if (removed.length > 0) message += `Se eliminaron ${removed.length} canción(es) que ya no están en archive.org.`;
            showNotification(message.trim());
        } else {
            showNotification('La playlist está sincronizada con archive.org');
        }
        
    } catch (error) {
        console.error('Error descubriendo archivos en archive.org:', error);
        showNotification('Error al buscar en archive.org: ' + error.message);
    } finally {
        isDiscovering = false;
        const refreshBtn = document.getElementById('refreshArchiveBtn');
        if (refreshBtn) {
            refreshBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m0 0l3.889 3.889L12 8.5l3.889-3.889M16 11.5V6a2 2 0 00-2-2h-5.5a2 2 0 00-3.898.562l-.002.003M16 11.5a4 4 0 11-7.898 3.44l-.002.002M4 16l4.898-7.898M4 16v2.5a2 2 0 002 2H9.5l.002-.002"></path></svg>';
            refreshBtn.title = 'Actualizar desde archive.org';
            refreshBtn.disabled = false;
        }
    }
}

// Función para mostrar notificaciones temporales
function showNotification(message) {
    // Eliminar notificaciones existentes
    const existing = document.getElementById('archive-notification');
    if (existing) existing.remove();
    
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.id = 'archive-notification';
    notification.className = 'fixed bottom-4 right-4 bg-green-600/90 text-white px-4 py-2 rounded-xl shadow-lg z-50 transition-opacity duration-300';
    notification.textContent = message;
    
    // Añadir al body
    document.body.appendChild(notification);
    
    // Eliminar después de 3 segundos
    setTimeout(() => {
        notification.classList.add('opacity-0');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Iniciar descubrimiento automático (opcional)
function startAutoDiscovery() {
    // Limpiar intervalo existente si hay uno
    if (archiveDiscoveryInterval) {
        clearInterval(archiveDiscoveryInterval);
    }
    
    // Establecer nuevo intervalo
    archiveDiscoveryInterval = setInterval(() => {
        if (!isDiscovering) {
            discoverArchiveFiles();
        }
    }, DISCOVERY_INTERVAL_MS);
    
    // Ejecutar inmediatamente al iniciar (opcional)
    // discoverArchiveFiles();
}

// Detener descubrimiento automático
function stopAutoDiscovery() {
    if (archiveDiscoveryInterval) {
        clearInterval(archiveDiscoveryInterval);
        archiveDiscoveryInterval = null;
    }
}

function goNext() {
    if (playlist.length === 0) return;
    if (repeatMode === 2) { audioPlayer.currentTime = 0; playAudio(); return; }
    let newIndex = currentIndex + 1;
    if (newIndex >= playlist.length) {
        if (repeatMode === 1) newIndex = 0;
        else { pauseAudio(); return; }
    }
    playSong(newIndex);
}

function goPrev() {
    if (playlist.length === 0) return;
    if (audioPlayer.currentTime > 3) { audioPlayer.currentTime = 0; return; }
    let newIndex = currentIndex - 1;
    if (newIndex < 0) newIndex = playlist.length - 1;
    playSong(newIndex);
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('text-green-500', isShuffle);
    if (isShuffle) {
        const currentSong = playlist[currentIndex];
        let shuffled = [...playlist];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        playlist = shuffled;
        currentIndex = playlist.indexOf(currentSong);
    } else {
        const currentSong = playlist[currentIndex];
        playlist = [...originalPlaylist];
        currentIndex = playlist.indexOf(currentSong);
    }
    updatePlaylistUI();
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    repeatBtn.classList.toggle('text-green-500', repeatMode > 0);
}

function toggleMute() {
    isMuted = !isMuted;
    if (isMuted) {
        previousVolume = volumeBar.value / 100;
        audioPlayer.volume = 0;
        if (gainNode) gainNode.gain.value = 0;
        volumeBar.value = 0;
        volUpIcon.classList.add('hidden');
        volMuteIcon.classList.remove('hidden');
    } else {
        const vol = previousVolume || 0.8;
        audioPlayer.volume = vol;
        if (gainNode) gainNode.gain.value = vol;
        volumeBar.value = vol * 100;
        volUpIcon.classList.remove('hidden');
        volMuteIcon.classList.add('hidden');
    }
}

// Event Listeners - Botones Principales
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', goPrev);
nextBtn.addEventListener('click', goNext);
shuffleBtn.addEventListener('click', toggleShuffle);
repeatBtn.addEventListener('click', toggleRepeat);
muteBtn.addEventListener('click', toggleMute);

// Refresh button event listener (using existing declaration)
if (document.getElementById('refreshArchiveBtn')) {
    document.getElementById('refreshArchiveBtn').addEventListener('click', discoverArchiveFiles);
}

// Ecualizador
const bassEq = document.getElementById('bassEq');
const trebleEq = document.getElementById('trebleEq');
bassEq.addEventListener('input', () => {
    if (bassNode) bassNode.gain.value = bassEq.value;
});
trebleEq.addEventListener('input', () => {
    if (trebleNode) trebleNode.gain.value = trebleEq.value;
});

// Eventos de Progreso, Tiempo y Memoria
audioPlayer.addEventListener('timeupdate', () => {
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.value = progress || 0;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    
    // Guardar progreso cada ~5 segundos aprox
    if (Math.floor(audioPlayer.currentTime) > 0 && Math.floor(audioPlayer.currentTime) % 5 === 0) {
        localStorage.setItem('nicofy_progress', JSON.stringify({
            index: currentIndex,
            time: audioPlayer.currentTime
        }));
    }
});

audioPlayer.addEventListener('loadedmetadata', () => durationEl.textContent = formatTime(audioPlayer.duration));
audioPlayer.addEventListener('ended', goNext);

// Pantallas de Carga y Buffer Inteligente
const songLoader = document.getElementById('songLoader');

audioPlayer.addEventListener('waiting', () => {
    // Faltan datos, mostrar Cargando...
    if (songLoader) songLoader.classList.remove('hidden');
    albumArt.classList.remove('playing');
});

audioPlayer.addEventListener('playing', () => {
    // Listo para reproducir, esconder cargadores
    hideSplashScreen();
    if (songLoader) songLoader.classList.add('hidden');
    albumArt.classList.add('playing');
});

progressBar.addEventListener('input', () => {
    const time = (progressBar.value / 100) * audioPlayer.duration;
    if(!isNaN(time)) audioPlayer.currentTime = time;
});
volumeBar.addEventListener('input', () => {
    const vol = volumeBar.value / 100;
    audioPlayer.volume = vol;
    if (gainNode) gainNode.gain.value = vol;
    volUpIcon.classList.toggle('hidden', vol === 0);
    volMuteIcon.classList.toggle('hidden', vol > 0);
});

// Drag & Drop
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('dragenter', () => dropZone.classList.remove('hidden'));
document.body.addEventListener('dragleave', e => { if (!e.relatedTarget) dropZone.classList.add('hidden'); });
document.body.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.add('hidden');
    const files = [...e.dataTransfer.files].filter(f => f.type.includes('audio'));
    files.forEach(file => {
        const song = {
            file: file.name,
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: 'Archivo Local',
            src: URL.createObjectURL(file),
            image: null
        };
        playlist.push(song);
        originalPlaylist.push(song);
        renderPlaylist();
    });
});

// Teclado
document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') audioPlayer.currentTime += 5;
    if (e.code === 'ArrowLeft') audioPlayer.currentTime -= 5;
});

// Refresh button event listener is already handled by existing declaration

// Iniciar
loadPlaylist();
// Nota: El botón de refresh ejecuta discoverArchiveFiles() manualmente
audioPlayer.volume = 0.8;

// Initialize Google Cast
window['__onGCastApiAvailable'] = function(isAvailable) {
    if (isAvailable) {
        initializeCastApi();
    }
};

function initializeCastApi() {
    const castOptions = {
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID
    };
    
    const apiConfig = new chrome.cast.ApiConfig(castOptions,
        sessionListener,
        receiverListener
    );
    
    chrome.cast.initialize(apiConfig, onInitSuccess, onError);
}

function sessionListener(e) {
    console.log('New cast session ID:' + e.sessionId);
    window.session = e;
    
    // Add listener for session events
    e.addUpdateListener(sessionUpdateListener);
    e.addMessageListener('urn:x-cast:com.google.cast.media', 
        function(namespace, message) {
            // Handle media messages if needed
        });
}

function sessionUpdateListener(e) {
    if (!e) {
        session = null;
        isCasting = false;
        updateCastButton();
    }
}

function receiverListener(e) {
    if (e === chrome.cast.ReceiverAvailability.AVAILABLE) {
        console.log('Receiver found');
    } else {
        console.log('Receiver list empty');
    }
}

function onInitSuccess() {
    console.log('Cast initialization successful');
}

function onError(e) {
    console.log('Cast initialization error: ' + e.code);
}

function updateCastButton() {
    const castBtn = document.getElementById('castBtn');
    if (!castBtn) return;
    
    if (isCasting) {
        castBtn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
        castBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        castBtn.title = 'Detener transmisión';
        castBtn.setAttribute('aria-label', 'Detener transmisión');
    } else {
        castBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        castBtn.classList.add('bg-gray-700', 'hover:bg-gray-600');
        castBtn.title = 'Transmitir a dispositivo';
        castBtn.setAttribute('aria-label', 'Transmitir a dispositivo');
    }
}

// Add event listener for cast button
document.addEventListener('DOMContentLoaded', function() {
    const castBtn = document.getElementById('castBtn');
    if (castBtn) {
        castBtn.addEventListener('click', function() {
            if (!window.chrome || !chrome.cast) {
                showNotification('Google Cast no está disponible en este navegador');
                return;
            }
            
            if (isCasting) {
                stopCasting();
            } else {
                startCasting();
            }
        });
    }
});

function startCasting() {
    if (!window.session) {
        showNotification('No hay sesión de transmisión disponible');
        return;
    }
    
    // Create media info
    const mediaInfo = new chrome.cast.media.MediaInfo(audioPlayer.currentSrc);
    mediaInfo.contentType = 'audio/mpeg'; // Assuming MP3, adjust if needed
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = songTitle.textContent;
    mediaInfo.metadata.subtitle = artistName.textContent;
    if (albumImg.src) {
        mediaInfo.metadata.images = [{ 'url': albumImg.src }];
    }
    
    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    window.session.loadMedia(request, 
        function() {
            isCasting = true;
            updateCastButton();
            showNotification('Transmitiendo a dispositivo...');
        },
        function(error) {
            showNotification('Error al transmitir: ' + error.description);
            console.error('Error casting:', error);
        }
    );
}

function stopCasting() {
    if (!window.session) {
        isCasting = false;
        updateCastButton();
        return;
    }
    
    window.session.stop(
        function() {
            isCasting = false;
            updateCastButton();
            showNotification('Transmisión detenida');
        },
        function(error) {
            showNotification('Error al detener transmisión: ' + error.description);
            console.error('Error stopping cast:', error);
        }
    );
}

// Dino follow cursor
let dinoMoveListener = null;
function initDinoFollower() {
    const dino = document.getElementById('dino');
    const splashScreen = document.getElementById('splashScreen');
    if (!dino || !splashScreen) return;
    
    function moveDino(e) {
        const splash = document.getElementById('splashScreen');
        if (!splash || splash.classList.contains('hidden') || 
            splash.classList.contains('opacity-0')) {
            // Remove listener when splash screen is hidden
            if (dinoMoveListener) {
                document.removeEventListener('mousemove', dinoMoveListener);
                dinoMoveListener = null;
            }
            return;
        }
        const x = e.clientX;
        const y = e.clientY;
        // Set position with some offset to avoid cursor covering
        dino.style.left = (x - 20) + 'px';
        dino.style.top = (y - 20) + 'px';
    }
    dinoMoveListener = moveDino;
    document.addEventListener('mousemove', dinoMoveListener);
}

// Stop dino follower and hide splash screen
function hideSplashScreen() {
    // Remove dino move listener
    if (dinoMoveListener) {
        document.removeEventListener('mousemove', dinoMoveListener);
        dinoMoveListener = null;
    }
    
    // Hide splash screen - use getElementById to ensure we get the current element
    const splashElement = document.getElementById('splashScreen');
    if (splashElement) {
        splashElement.classList.add('opacity-0');
        setTimeout(() => {
            splashElement.classList.add('hidden');
        }, 300); // Match the transition duration in CSS
    }
}

// Register service worker for caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    console.log('ServiceWorker registration successful with scope: ', reg.scope);
  }).catch(err => {
    console.log('ServiceWorker registration failed: ', err);
  });
}

// Initialize dino follower after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDinoFollower);
} else {
  initDinoFollower();
}

// Auto-hide splash screen after 8 seconds as a safety net
setTimeout(() => {
    hideSplashScreen();
}, 8000);
