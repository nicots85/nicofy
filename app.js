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

// Estado del reproductor
let playlist = [];
let originalPlaylist = []; // Para recuperar orden si se quita shuffle
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0; // 0 = no, 1 = todo, 2 = una
let isMuted = false;
let previousVolume = 0.8;
let dominantColor = 'rgba(34, 197, 94, 0.8)'; // Default green

let audioContext = null;
let analyser = null;
let source = null;
let animationId = null;

// Configurar canvas
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

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
        // Sample para mayor velocidad
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
        source = audioContext.createMediaElementSource(audioPlayer);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
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

    // Gradiente dinámico basado en dominante
    let gradDominant = dominantColor.replace('rgb', 'rgba').replace(')', ', 0.8)');
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, gradDominant);
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.4)'); // Mezclado con un tono azul por defecto

    for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height * 0.6;
        const centerY = canvas.height / 2;
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, centerY + 10, barWidth, barHeight);
        
        ctx.fillStyle = gradDominant.replace('0.8)', '0.3)');
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
        playlist = data.songs || [];
        // Map local files from json properly
        playlist = playlist.map(s => ({...s, src: \`music/\${s.file}\`}));
        originalPlaylist = [...playlist];
        renderPlaylist();
    } catch (error) {
        console.error('Error cargando playlist:', error);
        playlistEl.innerHTML = '<p class="text-gray-500 text-center py-4">Agrega tu música en /music o arrastra archivos aquí.</p>';
    }
}

// Renderizar playlist
function renderPlaylist() {
    if (playlist.length === 0) {
        playlistEl.innerHTML = '<p class="text-gray-500 text-center py-4">No hay canciones. Arrastra archivos MP3 o edita config.json.</p>';
        return;
    }

    playlistEl.innerHTML = playlist.map((song, index) => {
        let isActive = song === playlist[currentIndex];
        return \`
        <div class="playlist-item p-3 rounded-lg bg-gray-700/50 flex items-center gap-3 \${isActive ? 'active' : ''}" data-index="\${index}">
            <div class="w-10 h-10 rounded bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                \${song.image ? \`<img src="\${song.image}" class="w-full h-full object-cover">\` : 
                \`<svg class="w-5 h-5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>\`}
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-medium truncate \${isActive ? 'text-green-400' : 'text-gray-100'}">\${song.title || song.file}</p>
                <p class="text-xs text-gray-400 truncate">\${song.artist || 'Artista desconocido'}</p>
            </div>
            \${isActive ? '<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>' : ''}
        </div>
    \`}).join('');

    document.querySelectorAll('.playlist-item').forEach(item => {
        item.addEventListener('click', () => {
            playSong(parseInt(item.dataset.index));
        });
    });
}

// Reproducir canción
function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const song = playlist[index];

    // UI
    songTitle.textContent = song.title || song.file;
    artistName.textContent = song.artist || 'Artista desconocido';
    progressBar.value = 0;
    currentTimeEl.textContent = '0:00';
    durationEl.textContent = '0:00';

    // Imagen y Color dinámico
    if (song.image) {
        albumImg.src = song.image;
        albumImg.classList.remove('hidden');
        defaultAlbumIcon.classList.add('hidden');
        
        // Obtener color dominante una vez que cargue
        albumImg.onload = () => {
            const color = getAverageColor(albumImg);
            dominantColor = color;
            mainBody.style.background = \`linear-gradient(to bottom right, #111827, \${color.replace('rgb', 'rgba').replace(')', ', 0.15)')}, #111827)\`;
        };
    } else {
        albumImg.classList.add('hidden');
        defaultAlbumIcon.classList.remove('hidden');
        dominantColor = 'rgba(34, 197, 94, 0.8)';
        mainBody.style.background = ''; // reset to class default
    }

    // Update Media Session
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title || song.file,
            artist: song.artist || 'Artista desconocido',
            artwork: song.image ? [{ src: song.image }] : []
        });
    }

    audioPlayer.src = song.src;
    audioPlayer.preload = 'auto'; // Faster start
    
    playBtn.addEventListener('click', initAudioContext, { once: true });
    playAudio();
    updatePlaylistUI();
}

// Audio controls
function playAudio() {
    audioPlayer.play().then(() => {
        isPlaying = true;
        updatePlayButton();
        albumArt.classList.add('playing');
        initAudioContext();
        drawVisualizer();
    }).catch(console.error);
}

function pauseAudio() {
    audioPlayer.pause();
    isPlaying = false;
    updatePlayButton();
    albumArt.classList.remove('playing');
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
    renderPlaylist(); // re-render for active state colors
}

// Format Time
const formatTime = seconds => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
};

// Next & Prev Logic
function goNext() {
    if (playlist.length === 0) return;
    if (repeatMode === 2) {
        audioPlayer.currentTime = 0;
        playAudio();
        return;
    }
    let newIndex = currentIndex + 1;
    if (newIndex >= playlist.length) {
        if (repeatMode === 1) newIndex = 0;
        else { pauseAudio(); return; } // End of playlist
    }
    playSong(newIndex);
}

function goPrev() {
    if (playlist.length === 0) return;
    if (audioPlayer.currentTime > 3) { // Si van más de 3 seg de canción, reinicia
        audioPlayer.currentTime = 0;
        return;
    }
    let newIndex = currentIndex - 1;
    if (newIndex < 0) newIndex = playlist.length - 1;
    playSong(newIndex);
}

// Shuffle & Repeat
function toggleShuffle() {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('text-green-500', isShuffle);
    shuffleBtn.classList.toggle('text-gray-400', !isShuffle);
    
    if (isShuffle) {
        const currentSong = playlist[currentIndex];
        // Fisher-Yates shuffle
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
    const svgPath = repeatBtn.querySelector('path');
    if (repeatMode === 0) {
        repeatBtn.classList.remove('text-green-500');
        repeatBtn.classList.add('text-gray-400');
        svgPath.setAttribute('d', 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z');
    } else if (repeatMode === 1) { // Repeat All
        repeatBtn.classList.add('text-green-500');
        repeatBtn.classList.remove('text-gray-400');
        svgPath.setAttribute('d', 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z');
    } else { // Repeat One
        repeatBtn.classList.add('text-green-500');
        svgPath.setAttribute('d', 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z M13 15V9h-1l-2 1v1h1.5v4H13z'); // Add a '1' in the middle roughly
    }
}

// Volume Mute
function toggleMute() {
    isMuted = !isMuted;
    if (isMuted) {
        previousVolume = audioPlayer.volume;
        audioPlayer.volume = 0;
        volumeBar.value = 0;
        volUpIcon.classList.add('hidden');
        volMuteIcon.classList.remove('hidden');
    } else {
        audioPlayer.volume = previousVolume > 0 ? previousVolume : 0.8;
        volumeBar.value = audioPlayer.volume * 100;
        volUpIcon.classList.remove('hidden');
        volMuteIcon.classList.add('hidden');
    }
}

// Event Listeners - Botones
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', goPrev);
nextBtn.addEventListener('click', goNext);
shuffleBtn.addEventListener('click', toggleShuffle);
repeatBtn.addEventListener('click', toggleRepeat);
muteBtn.addEventListener('click', toggleMute);

// Progreso y Audio Events
audioPlayer.addEventListener('timeupdate', () => {
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.value = progress || 0;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
});
audioPlayer.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audioPlayer.duration);
});
audioPlayer.addEventListener('ended', goNext);

progressBar.addEventListener('input', () => {
    const time = (progressBar.value / 100) * audioPlayer.duration;
    if(!isNaN(time)) audioPlayer.currentTime = time;
});
volumeBar.addEventListener('input', () => {
    const vol = volumeBar.value / 100;
    audioPlayer.volume = vol;
    if (vol > 0 && isMuted) {
        isMuted = false;
        volUpIcon.classList.remove('hidden');
        volMuteIcon.classList.add('hidden');
    } else if (vol === 0 && !isMuted) {
        isMuted = true;
        volUpIcon.classList.add('hidden');
        volMuteIcon.classList.remove('hidden');
    }
});

// Drag & Drop Local Files
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    document.body.addEventListener(evt, e => e.preventDefault(), false);
});

document.body.addEventListener('dragenter', () => dropZone.classList.remove('hidden'));
document.body.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) dropZone.classList.add('hidden');
});
document.body.addEventListener('drop', handleDrop);

function handleDrop(e) {
    dropZone.classList.add('hidden');
    const files = [...e.dataTransfer.files].filter(f => f.type.includes('audio'));
    if (files.length === 0) return;

    files.forEach(file => {
        // Fallback for ID3 reading errors
        const fallbackAdd = (title, artist) => {
            const song = {
                file: file.name,
                title: title || file.name.replace('.mp3', ''),
                artist: artist || 'Archivo Local',
                src: URL.createObjectURL(file), // Blob URL for local playing
                image: null
            };
            addToPlaylist(song);
        };

        if (window.jsmediatags) {
            window.jsmediatags.read(file, {
                onSuccess: function(tag) {
                    const tags = tag.tags;
                    let imageBlobUrl = null;
                    if (tags.picture) {
                        let base64String = "";
                        for (let i = 0; i < tags.picture.data.length; i++) {
                            base64String += String.fromCharCode(tags.picture.data[i]);
                        }
                        const imageBase64 = btoa(base64String);
                        imageBlobUrl = \`data:\${tags.picture.format};base64,\${imageBase64}\`;
                    }
                    const song = {
                        file: file.name,
                        title: tags.title || file.name.replace('.mp3', ''),
                        artist: tags.artist || 'Archivo Local',
                        src: URL.createObjectURL(file),
                        image: imageBlobUrl
                    };
                    addToPlaylist(song);
                },
                onError: function(error) {
                    fallbackAdd();
                }
            });
        } else {
            fallbackAdd();
        }
    });
}

function addToPlaylist(song) {
    playlist.push(song);
    originalPlaylist.push(song);
    if(isShuffle) {
        // Re-shuffle to maintain consistency
        toggleShuffle(); 
        toggleShuffle(); // dirty hack to re-shuffle preserving current song
    }
    renderPlaylist();
    // Auto-play si era la primera y el reproductor estaba vacío
    if (playlist.length === 1 || audioPlayer.src === "") {
        playSong(playlist.length - 1);
    }
}

// Teclado
document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        togglePlay();
    }
    if (e.code === 'ArrowRight') {
        audioPlayer.currentTime += 5;
    }
    if (e.code === 'ArrowLeft') {
        audioPlayer.currentTime -= 5;
    }
});

// Media Session API Support
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', playAudio);
    navigator.mediaSession.setActionHandler('pause', pauseAudio);
    navigator.mediaSession.setActionHandler('previoustrack', goPrev);
    navigator.mediaSession.setActionHandler('nexttrack', goNext);
}

// Wake Lock / Visibility
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isPlaying) {
        initAudioContext();
    }
});

// Inicializar
loadPlaylist();
audioPlayer.volume = 0.8;