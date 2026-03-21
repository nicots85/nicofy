// Nicofy - Reproductor Musical con Visualizador
// ============================================

// Elementos del DOM
const audioPlayer = document.getElementById('audioPlayer');
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

let audioContext = null;
let analyser = null;
let source = null;
let bassNode = null;
let trebleNode = null;
let gainNode = null;
let animationId = null;

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

        source = audioContext.createMediaElementSource(audioPlayer);
        
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
    analyser.getByteFrequencyData(dataArray);
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

// Cargar configuración de canciones
async function loadPlaylist() {
    try {
        const response = await fetch('config.json');
        const data = await response.json();
        const rawSongs = data.songs || [];
        const overrides = getOverrides();

        playlist = rawSongs.map(s => {
            const override = overrides[s.file];
            return {
                ...s,
                title: override?.title || s.title || s.file,
                artist: override?.artist || s.artist || 'Artista desconocido',
                image: override?.image || s.image || null,
                src: (s.file && s.file.startsWith('http')) ? s.file : `music/${s.file}`
            };
        });
        originalPlaylist = [...playlist];
        
        // Restore progress or just render
        const saved = localStorage.getItem('nicofy_progress');
        if (saved && playlist.length > 0) {
            const { index, time } = JSON.parse(saved);
            if (index >= 0 && index < playlist.length) {
                renderPlaylist();
                // Play song without autoplaying immediately to respect browser policies
                playSong(index, time, false);
                return;
            }
        }
        renderPlaylist();
    } catch (error) {
        console.error('Error cargando playlist:', error);
        playlistEl.innerHTML = '<p class="text-gray-500 text-center py-4">Agregamos tu música en /music o arrastramos archivos aquí.</p>';
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

    // Audio Setup
    audioPlayer.src = ''; // Limpiar buffer para Safari
    // FIX SAFARI BUG: Siempre anonymous para no romper el MediaElementSourceNode de WebKit al cambiar de src
    audioPlayer.crossOrigin = "anonymous"; 
    audioPlayer.src = song.src;
    audioPlayer.preload = 'metadata'; // Optimización de red: no descargar todo de golpe
    audioPlayer.load(); // Obligar a recargar reglas CORS 
    
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

// Ecualizador
const bassEq = document.getElementById('bassEq');
const trebleEq = document.getElementById('trebleEq');
bassEq.addEventListener('input', () => {
    if (bassNode) bassNode.gain.value = bassEq.value;
});
trebleEq.addEventListener('input', () => {
    if (trebleNode) trebleNode.gain.value = trebleEq.value;
});

// Control de Velocidad
const speedBtns = document.querySelectorAll('.speed-btn');
speedBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const speed = parseFloat(e.target.dataset.speed);
        audioPlayer.playbackRate = speed;
        speedBtns.forEach(b => {
            b.className = 'speed-btn px-3 py-1 rounded-full text-xs font-bold bg-gray-700 text-gray-400 hover:text-white transition-colors border border-transparent';
        });
        e.target.className = 'speed-btn active px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/50';
    });
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

// Iniciar
loadPlaylist();
audioPlayer.volume = 0.8;