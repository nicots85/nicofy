// Script de diagnóstico para Nicofy
// Abre la consola del navegador (F12) y pega este código para diagnosticar problemas

(function() {
    console.log("%c🔍 Nicofy - Diagnóstico", "font-size: 16px; font-weight: bold; color: #22c55e;");
    
    // 1. Verificar colección en archive.org
    console.log("%c1. Verificando colección en archive.org...", "color: #6b7280;");
    
    fetch('https://archive.org/advancedsearch.php?q=collection:nicofy&fl[]=identifier&fl[]=title&fl[]=creator&rows=10&output=json')
        .then(r => r.json())
        .then(data => {
            const items = data.response.docs || [];
            console.log(`%c✅ Encontrados: ${items.length} elementos`, "color: #22c55e;");
            
            if (items.length === 0) {
                console.log("%c⚠️ No hay archivos en tu colección.", "color: #ef4444;");
                console.log("%c   Sube archivos a: https://archive.org/details/nicofy", "color: #6b7280;");
            } else {
                console.log("%c📁 Archivos detectados:", "color: #22c55e;");
                items.forEach((item, i) => {
                    console.log(`   ${i+1}. ${item.identifier} - ${item.title || 'Sin título'}`);
                });
            }
        })
        .catch(err => {
            console.log("%c❌ Error conectando a archive.org:", "color: #ef4444;", err.message);
        });
    
    // 2. Verificar config.json local
    console.log("%c2. Verificando config.json local...", "color: #6b7280;");
    fetch('config.json')
        .then(r => r.json())
        .then(data => {
            const songs = data.songs || [];
            console.log(`%c✅ config.json tiene ${songs.length} canciones`, "color: #22c55e;");
        })
        .catch(err => {
            console.log("%cℹ️ config.json no encontrado (esto es normal si usas archive.org directo)", "color: #6b7280;");
        });
    
    // 3. Verificar service worker
    console.log("%c3. Verificando Service Worker...", "color: #6b7280;");
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            if (registrations.length > 0) {
                console.log("%c✅ Service Worker activo", "color: #22c55e;");
            } else {
                console.log("%c⚠️ Service Worker no registrado", "color: #eab308;");
            }
        });
    } else {
        console.log("%c⚠️ Service Worker no soportado en este navegador", "color: #eab308;");
    }
    
    console.log("%c\n💡 Usa el botón verde (🔄) en la interfaz para actualizar la lista manualmente", "color: #6b7280;");
})();