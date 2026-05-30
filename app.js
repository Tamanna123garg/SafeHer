// IMPORT FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// APP STATE
window.AppState = {
    authMode: 'login', user: null, isGuest: false, contacts: [],
    sosActive: false, isSilent: false, 
    mediaStream: null, location: null, locationWatchId: null,
    sosSirenParams: [], whistleOscillator: null,
    videoRecorder: null, audioRecorder: null, recordedChunks: [],
    monitoringMotion: false, monitoringShake: false, lastShakeTime: 0,
    autoSosTimer: null, autoSosCountdown: 10,
    voiceRecognition: null, isListening: false,
    stealthClicks: 0, wakeLockSentinel: null,
    checkInInterval: null,
    geoFenceAnchor: null, geoFenceWatcher: null, trackId: null
};

const firebaseConfig = { projectId: "safeher-demo-project" }; 
let auth, db;

try {
    const app = initializeApp(window.__firebase_config ? JSON.parse(window.__firebase_config) : firebaseConfig);
    auth = getAuth(app); db = getFirestore(app);
} catch(e) { console.warn("Firebase Init failed. App will run in Offline/Local Mode."); }

// --- CORE UI UTILITIES ---
window.showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg transform transition-all duration-300 -translate-y-10 opacity-0 text-white max-w-sm w-full ${type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-slate-900'}`;
    t.innerHTML = `<i class="ph-fill ${type === 'error' ? 'ph-warning-circle' : 'ph-info'} text-xl"></i> <span class="text-sm font-bold">${msg}</span>`;
    container.appendChild(t); requestAnimationFrame(() => t.classList.remove('-translate-y-10', 'opacity-0'));
    setTimeout(() => { t.classList.add('opacity-0', 'scale-95'); setTimeout(() => t.remove(), 300); }, 3000);
};

window.navigate = (id) => { 
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active')); 
    document.getElementById(id).classList.add('active'); 
    const isMain = ['screen-dashboard', 'screen-contacts', 'screen-helplines'].includes(id);
    document.getElementById('main-nav').classList.toggle('hidden', !isMain); 
    document.getElementById('main-nav').classList.toggle('flex', isMain); 
};
window.switchTab = (tab) => { navigate(`screen-${tab}`); };

const openModal = (html) => { 
    document.getElementById('modal-content').innerHTML = `<button onclick="closeModal()" class="absolute top-4 right-4 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200"><i class="ph-bold ph-x"></i></button>${html}`; 
    document.getElementById('modal-container').classList.remove('hidden'); document.getElementById('modal-container').classList.add('flex'); 
};
window.closeModal = () => { document.getElementById('modal-container').classList.add('hidden'); document.getElementById('modal-container').classList.remove('flex'); };

// --- AUTHENTICATION FLOW ---
window.toggleAuthMode = (mode) => {
    window.AppState.authMode = mode;
    const isLogin = mode === 'login';
    document.getElementById('tab-login').className = `flex-1 pb-2 border-b-4 font-black text-xl ${isLogin ? 'border-brand-500 text-slate-900' : 'border-transparent text-slate-400'}`;
    document.getElementById('tab-signup').className = `flex-1 pb-2 border-b-4 font-black text-xl ${!isLogin ? 'border-brand-500 text-slate-900' : 'border-transparent text-slate-400'}`;
    document.getElementById('btn-auth-submit').textContent = isLogin ? "Login Securely" : "Create Account";
};

window.handleAuthSubmit = async () => {
    if(!auth) return offlineLoginFallback();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || password.length < 6) return showToast("Enter valid email and password (min 6 chars)", "error");
    
    try {
        showToast(window.AppState.authMode === 'login' ? "Authenticating..." : "Registering...", "info");
        if (window.AppState.authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
        else await createUserWithEmailAndPassword(auth, email, password);
        navigate('screen-dashboard');
    } catch (error) { showToast(error.message.replace("Firebase: ", ""), "error"); }
};

window.handleGuestSession = async () => { 
    window.AppState.isGuest = true; 
    if(auth) { try { await signInAnonymously(auth); } catch(e){} }
    offlineLoginFallback(); 
};

window.handleLogout = async () => { if(auth) await signOut(auth); window.location.reload(); };

function offlineLoginFallback() {
    window.AppState.user = { uid: 'offline_user_' + Date.now() };
    document.getElementById('account-type-badge').textContent = 'Local Session';
    loadLocalContacts(); navigate('screen-dashboard');
}

if(auth) {
    onAuthStateChanged(auth, (user) => {
        if(user) { 
            window.AppState.user = user; 
            document.getElementById('account-type-badge').textContent = user.isAnonymous ? 'Guest Session' : 'Verified Account';
            loadFirebaseContacts(user.uid); 
        }
    });
}

// --- CONTACTS MANAGEMENT ---
const loadFirebaseContacts = (uid) => { 
    try {
        onSnapshot(collection(db, 'users', uid, 'contacts'), (snap) => { 
            window.AppState.contacts = []; 
            snap.forEach(d => window.AppState.contacts.push({ id: d.id, ...d.data() })); 
            localStorage.setItem('sh_contacts', JSON.stringify(window.AppState.contacts)); 
            renderContactsUI(); 
        }, (error) => { console.warn("Firestore error, using local contacts.", error); loadLocalContacts(); }); 
    } catch (e) { loadLocalContacts(); }
};

const loadLocalContacts = () => { const saved = localStorage.getItem('sh_contacts'); if(saved) { window.AppState.contacts = JSON.parse(saved); renderContactsUI(); } };

window.openAddContactModal = () => { openModal(`<h3 class="text-xl font-black mb-4">Add Contact</h3><input type="text" id="nc-name" placeholder="Name (e.g. Mom)" class="w-full bg-slate-50 p-4 rounded-xl mb-3 font-bold border"><input type="tel" id="nc-phone" placeholder="Phone Number" class="w-full bg-slate-50 p-4 rounded-xl mb-4 font-bold border"><button onclick="submitContact()" class="w-full py-4 bg-brand-500 text-white rounded-xl font-black text-lg shadow-md active:scale-95 transition-transform">Save Contact</button>`); };

window.submitContact = async () => { 
    const n = document.getElementById('nc-name').value; const p = document.getElementById('nc-phone').value; 
    if(!n || !p) return showToast("Name and Phone required", "error");
    if (db && window.AppState.user && !window.AppState.isGuest) {
        try { await addDoc(collection(db, 'users', window.AppState.user.uid, 'contacts'), {name:n, phone:p}); } 
        catch(e) { saveContactLocally(n, p); }
    } else { saveContactLocally(n, p); }
    closeModal(); 
};

const saveContactLocally = (n, p) => { window.AppState.contacts.push({ id: Date.now().toString(), name: n, phone: p }); localStorage.setItem('sh_contacts', JSON.stringify(window.AppState.contacts)); renderContactsUI(); showToast("Saved to device"); };

const renderContactsUI = () => { 
    const list = document.getElementById('contacts-list');
    if(window.AppState.contacts.length === 0) list.innerHTML = `<div class="text-center p-8 text-slate-400 font-bold border-2 border-dashed border-slate-300 rounded-2xl">No contacts added yet.<br>Add trusted people to receive your SOS.</div>`;
    else list.innerHTML = window.AppState.contacts.map(c => `<div class="p-4 glass-card rounded-2xl flex justify-between items-center shadow-sm border border-slate-200"><div class="font-bold text-lg text-slate-800">${c.name}<br><span class="text-sm text-slate-500">${c.phone}</span></div><button onclick="window.location.href='tel:${c.phone}'" class="p-3 bg-brand-50 text-brand-600 rounded-xl active:scale-95 transition-transform"><i class="ph-fill ph-phone text-xl"></i></button></div>`).join(''); 
};

// --- CORE PERMISSIONS & HARDWARE ACCESS ---
window.requestAllPermissions = async (manual = false) => {
    let success = true;
    try {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                pos => { window.AppState.location = { lat: pos.coords.latitude, lng: pos.coords.longitude }; document.getElementById('gps-status').innerHTML = '<i class="ph-fill ph-navigation-arrow"></i> LIVE GPS'; },
                err => { success = false; console.warn("GPS Denied"); }
            );
        }
        try {
            window.AppState.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
        } catch(e) {
            window.AppState.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
        }
        document.getElementById('camera-feed').srcObject = window.AppState.mediaStream;
        
        if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function') {
            if(manual) await DeviceMotionEvent.requestPermission();
        }

        if(manual && success) {
            showToast("Sensors Enabled Successfully", "success");
            document.getElementById('permissions-banner').classList.add('hidden');
        }
    } catch (e) { 
        if(manual) showToast("Permission Denied. Features limited.", "error"); 
    }
};

const getLocationString = () => window.AppState.location ? `https://maps.google.com/?q=${window.AppState.location.lat},${window.AppState.location.lng}` : '(Location Unavailable)';

// --- MAIN EMERGENCY (SOS) LOGIC ---
window.toggleSOS = async (silent = false) => {
    if(!window.AppState.mediaStream) await requestAllPermissions();
    window.AppState.sosActive = !window.AppState.sosActive; window.AppState.isSilent = silent;
    const active = window.AppState.sosActive;
    
    document.getElementById('panel-evidence').classList.toggle('hidden', !active);
    document.getElementById('advanced-toolkit').classList.toggle('hidden', active);
    
    const btn = document.getElementById('btn-sos'); const txt = document.getElementById('sos-text'); const icon = document.getElementById('sos-icon');
    
    if(active) {
        btn.className = 'w-60 h-60 lg:w-72 lg:h-72 rounded-full bg-white btn-3d-white flex flex-col items-center justify-center relative z-20 shadow-[0_0_50px_rgba(255,255,255,0.8)] transform scale-95 border-8 border-brand-500';
        icon.className = 'ph-fill ph-x-circle text-[70px] lg:text-[90px] text-brand-600 mb-2';
        txt.className = 'font-black text-4xl text-brand-600'; txt.textContent = 'CANCEL';
        document.getElementById('screen-dashboard').classList.add(silent ? 'bg-slate-900' : 'sos-active-bg');
        
        if(!silent) {
            await Tone.start(); const masterVol = new Tone.Volume(10).toDestination();
            const osc1 = new Tone.Oscillator(800, "square").connect(masterVol).start(); const lfo1 = new Tone.LFO("2n", 800, 1500).start(); lfo1.connect(osc1.frequency);
            window.AppState.sosSirenParams = [osc1, lfo1, masterVol];
        }
        
        if(!window.AppState.videoRecorder) window.toggleVideoRecorder(true);
        
        if('geolocation' in navigator) {
            window.AppState.locationWatchId = navigator.geolocation.watchPosition(pos => {
                window.AppState.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if(window.AppState.trackId && db) {
                    try { setDoc(doc(db, 'public_tracks', window.AppState.trackId), { lat: pos.coords.latitude, lng: pos.coords.longitude, time: Date.now() }, {merge:true}); } catch(e){}
                }
            });
        }
        
        showToast(silent ? "SILENT SOS DISPATCHED" : "SOS ALARM ACTIVE", "error");
        if(window.AppState.contacts.length > 0) window.sendEmergencySMS();

    } else {
        btn.className = 'w-60 h-60 lg:w-72 lg:h-72 rounded-full bg-brand-500 btn-3d-red flex flex-col items-center justify-center relative z-20';
        icon.className = 'ph-fill ph-warning-octagon text-[80px] lg:text-[100px] text-white mb-2';
        txt.className = 'font-black text-5xl lg:text-6xl text-white'; txt.textContent = 'SOS';
        document.getElementById('screen-dashboard').classList.remove('sos-active-bg', 'bg-slate-900');
        
        window.AppState.sosSirenParams.forEach(n => { n.stop && n.stop(); n.dispose && n.dispose(); }); window.AppState.sosSirenParams = [];
        if(window.AppState.videoRecorder) window.toggleVideoRecorder(); 
        if(window.AppState.locationWatchId) navigator.geolocation.clearWatch(window.AppState.locationWatchId);
        showToast("SOS Cancelled.", "info");
    }
};

window.startDelayedSOS = () => triggerAutoSosSequence("DELAYED 10s TIMER");

// --- COMMUNICATION FUNCTIONS ---
window.callPrimaryContact = () => window.location.href = window.AppState.contacts.length ? `tel:${window.AppState.contacts[0].phone}` : 'tel:112';

window.sendWhatsAppAlert = () => {
    const msg = `EMERGENCY SOS! I need help immediately. Loc: ${getLocationString()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
};

window.sendEmergencySMS = () => {
    if(window.AppState.contacts.length === 0) return showToast("No contacts saved!", "error");
    const phones = window.AppState.contacts.map(c=>c.phone).join(',');
    const msg = `EMERGENCY SOS! I need help immediately. Loc: ${getLocationString()}`;
    const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
    window.location.href = `sms:${phones}${separator}body=${encodeURIComponent(msg)}`;
};

window.generateLiveTrackLink = async () => { 
    if (!window.AppState.location) return showToast("Waiting for GPS...", "error");
    if(!window.AppState.trackId) window.AppState.trackId = "track_" + crypto.randomUUID().substring(0,8);
    
    if(db) {
        try {
            await setDoc(doc(db, 'public_tracks', window.AppState.trackId), { lat: window.AppState.location.lat, lng: window.AppState.location.lng, time: Date.now() });
        } catch(e) { console.warn("DB write failed"); }
    }
    const link = `https://safeher.app/live/${window.AppState.trackId}`;
    try { 
        await navigator.clipboard.writeText(link); showToast("Live link copied to clipboard!", "success"); 
    } catch(e) { 
        prompt("Copy link:", link); 
    }
};

// --- SENSORS & AUTOMATED MONITORS ---
window.triggerAutoSosSequence = (reason) => {
    if(window.AppState.sosActive) return; 
    window.AppState.autoSosCountdown = 10; document.getElementById('auto-sos-reason').textContent = reason;
    document.getElementById('overlay-auto-sos').classList.remove('hidden'); document.getElementById('overlay-auto-sos').classList.add('flex');
    if('vibrate' in navigator) navigator.vibrate([500, 500, 500]);
    window.AppState.autoSosTimer = setInterval(() => {
        window.AppState.autoSosCountdown--; document.getElementById('auto-sos-timer-text').textContent = window.AppState.autoSosCountdown;
        if(window.AppState.autoSosCountdown <= 0) { cancelAutoSos(); window.toggleSOS(); }
    }, 1000);
};
window.cancelAutoSos = () => { clearInterval(window.AppState.autoSosTimer); window.AppState.autoSosTimer = null; document.getElementById('overlay-auto-sos').classList.add('hidden'); };

window.toggleCrashDetection = async () => {
    const btn = document.getElementById('btn-crash');
    if(window.AppState.monitoringMotion) { 
        window.removeEventListener('devicemotion', handleMotion); 
        window.AppState.monitoringMotion = false; btn.classList.replace('bg-blue-50','bg-white'); btn.classList.remove('border-blue-400');
    } else {
        if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function') { 
            try { const p = await DeviceMotionEvent.requestPermission(); if(p==='granted') initMotion(btn); } catch(e){ showToast("Sensor permission denied", "error"); }
        } else initMotion(btn);
    }
};
function initMotion(btn) { window.addEventListener('devicemotion', handleMotion); window.AppState.monitoringMotion = true; btn.classList.replace('bg-white','bg-blue-50'); btn.classList.add('border-blue-400'); showToast("Fall detect active"); }
function handleMotion(e) { 
    if(!e.accelerationIncludingGravity) return; 
    const acc = Math.sqrt(e.accelerationIncludingGravity.x**2 + e.accelerationIncludingGravity.y**2 + e.accelerationIncludingGravity.z**2); 
    if(acc > 25 && !window.AppState.autoSosTimer && !window.AppState.sosActive) triggerAutoSosSequence("FALL / IMPACT DETECTED"); 
}

window.toggleShakeToSos = async () => {
    const btn = document.getElementById('btn-shake');
    if(window.AppState.monitoringShake) { 
        window.removeEventListener('devicemotion', handleShake); 
        window.AppState.monitoringShake = false; btn.classList.replace('bg-rose-50','bg-white'); btn.classList.remove('border-rose-400');
    } else { 
        if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function') { 
            try { const p = await DeviceMotionEvent.requestPermission(); if(p==='granted') initShake(btn); } catch(e){ showToast("Sensor permission denied", "error"); }
        } else initShake(btn); 
    }
};
function initShake(btn) { window.addEventListener('devicemotion', handleShake); window.AppState.monitoringShake = true; btn.classList.replace('bg-white','bg-rose-50'); btn.classList.add('border-rose-400'); showToast("Shake violently for SOS"); }
function handleShake(e) { 
    if(!e.accelerationIncludingGravity) return; 
    const acc = Math.sqrt(e.accelerationIncludingGravity.x**2 + e.accelerationIncludingGravity.y**2 + e.accelerationIncludingGravity.z**2); 
    if(acc > 30) { 
        const now = Date.now(); 
        if(now - window.AppState.lastShakeTime < 500 && !window.AppState.autoSosTimer && !window.AppState.sosActive) triggerAutoSosSequence("SHAKE DETECTED"); 
        window.AppState.lastShakeTime = now; 
    } 
}

window.openCheckInModal = () => {
    const btn = document.getElementById('btn-checkin');
    if(window.AppState.checkInInterval) { clearInterval(window.AppState.checkInInterval); window.AppState.checkInInterval = null; btn.classList.replace('bg-emerald-50','bg-white'); btn.classList.remove('border-emerald-400'); showToast("Check-in disabled"); return; }
    openModal(`<h3 class="text-xl font-black mb-2">Check-in Timer</h3><p class="text-xs mb-4 text-slate-500">App will ask if you are safe. If you don't respond, SOS triggers automatically.</p><div class="grid grid-cols-2 gap-3"><button onclick="startCheckIn(5)" class="p-4 bg-emerald-100 text-emerald-800 rounded-xl font-bold active:scale-95">Every 5 Min</button><button onclick="startCheckIn(15)" class="p-4 bg-emerald-100 text-emerald-800 rounded-xl font-bold active:scale-95">Every 15 Min</button></div>`);
};
window.startCheckIn = (mins) => { 
    closeModal(); 
    window.AppState.checkInInterval = setInterval(() => triggerAutoSosSequence("MISSED CHECK-IN"), mins * 60000); 
    const btn = document.getElementById('btn-checkin'); btn.classList.replace('bg-white','bg-emerald-50'); btn.classList.add('border-emerald-400'); showToast(`Check-in set for ${mins}m`); 
};

window.toggleGeofence = () => {
    const btn = document.getElementById('btn-geofence');
    if(window.AppState.geoFenceWatcher) { 
        navigator.geolocation.clearWatch(window.AppState.geoFenceWatcher); window.AppState.geoFenceWatcher = null; 
        btn.classList.replace('bg-cyan-50','bg-white'); btn.classList.remove('border-cyan-400'); showToast("Anchor removed"); 
    } else {
        if(!window.AppState.location) return showToast("Needs GPS to set anchor", "error");
        window.AppState.geoFenceAnchor = window.AppState.location;
        window.AppState.geoFenceWatcher = navigator.geolocation.watchPosition(pos => {
            const dist = getDistanceFromLatLonInMeters(window.AppState.geoFenceAnchor.lat, window.AppState.geoFenceAnchor.lng, pos.coords.latitude, pos.coords.longitude);
            if(dist > 200 && !window.AppState.autoSosTimer && !window.AppState.sosActive) triggerAutoSosSequence("MOVED 200m FROM ANCHOR");
        });
        btn.classList.replace('bg-white','bg-cyan-50'); btn.classList.add('border-cyan-400'); showToast("200m Safe Anchor Set");
    }
};
function getDistanceFromLatLonInMeters(lat1,lon1,lat2,lon2) { const R = 6371; const dLat = (lat2-lat1)*(Math.PI/180); const dLon = (lon2-lon1)*(Math.PI/180); const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*(Math.PI/180))*Math.cos(lat2*(Math.PI/180))*Math.sin(dLon/2)*Math.sin(dLon/2); return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))) * 1000; }

if ('getBattery' in navigator) {
    navigator.getBattery().then(bat => {
        bat.addEventListener('levelchange', () => { if(bat.level <= 0.05 && !window.AppState.sosActive && !window.AppState.autoSosTimer) triggerAutoSosSequence("CRITICAL BATTERY 5%"); });
    });
}

// --- HARDWARE & MEDIA CAPTURE ---
window.toggleHardwareTorch = async () => {
    if(!window.AppState.mediaStream) await requestAllPermissions();
    if(!window.AppState.mediaStream) return;
    const track = window.AppState.mediaStream.getVideoTracks()[0];
    if(!track) return showToast("No video track found", "error");
    try {
        const cap = track.getCapabilities();
        if(!cap.torch) return showToast("Torch API not supported by device/browser", "error");
        const torchOn = track.getSettings().torch;
        await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
        const btn = document.getElementById('btn-torch');
        if(!torchOn) { btn.classList.replace('bg-white','bg-yellow-50'); btn.classList.add('border-yellow-400'); showToast("Torch ON"); }
        else { btn.classList.replace('bg-yellow-50','bg-white'); btn.classList.remove('border-yellow-400'); showToast("Torch OFF"); }
    } catch(e) { showToast("Torch error: " + e.message, "error"); }
};

window.toggleVideoRecorder = async (silentStart = false) => {
    const btn = document.getElementById('btn-video-rec');
    if(window.AppState.videoRecorder && window.AppState.videoRecorder.state !== 'inactive') {
        window.AppState.videoRecorder.stop(); window.AppState.videoRecorder = null;
        btn.classList.replace('bg-red-50','bg-white'); btn.classList.remove('border-red-400', 'animate-pulse');
        if(!silentStart) showToast("Video saved to device", "success");
    } else {
        if(!window.AppState.mediaStream) await requestAllPermissions();
        if(!window.AppState.mediaStream) return;
        window.AppState.recordedChunks = [];
        try {
            window.AppState.videoRecorder = new MediaRecorder(window.AppState.mediaStream, { mimeType: 'video/webm' });
            window.AppState.videoRecorder.ondataavailable = e => { if(e.data.size > 0) window.AppState.recordedChunks.push(e.data); };
            window.AppState.videoRecorder.onstop = () => { 
                const blob = new Blob(window.AppState.recordedChunks, {type:'video/webm'});
                const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `evidence_${Date.now()}.webm`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            };
            window.AppState.videoRecorder.start(1000); 
            btn.classList.replace('bg-white','bg-red-50'); btn.classList.add('border-red-400', 'animate-pulse'); 
            if(!silentStart) showToast("Recording Video Evidence");
        } catch(e) { showToast("Recorder error: " + e.message, "error"); }
    }
};

window.toggleAudioRecorder = async () => {
    const btn = document.getElementById('btn-audio-rec');
    if(window.AppState.audioRecorder && window.AppState.audioRecorder.state !== 'inactive') {
        window.AppState.audioRecorder.stop(); window.AppState.audioRecorder = null;
        btn.classList.replace('bg-purple-50','bg-white'); btn.classList.remove('border-purple-400', 'animate-pulse'); showToast("Audio saved");
    } else {
        if(!window.AppState.mediaStream) await requestAllPermissions();
        if(!window.AppState.mediaStream) return;
        const audioChunks = [];
        try {
            const audioStream = new MediaStream(window.AppState.mediaStream.getAudioTracks());
            window.AppState.audioRecorder = new MediaRecorder(audioStream);
            window.AppState.audioRecorder.ondataavailable = e => { if(e.data.size > 0) audioChunks.push(e.data); };
            window.AppState.audioRecorder.onstop = () => { const blob = new Blob(audioChunks, {type:'audio/webm'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `audio_${Date.now()}.webm`; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
            window.AppState.audioRecorder.start();
            btn.classList.replace('bg-white','bg-purple-50'); btn.classList.add('border-purple-400', 'animate-pulse'); showToast("Recording Audio");
        } catch(e) { showToast("Audio Rec error", "error"); }
    }
};

window.quickSharePhoto = async () => {
    if(!window.AppState.mediaStream) await requestAllPermissions();
    if(!window.AppState.mediaStream) return;
    const video = document.getElementById('camera-feed'); 
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
        const file = new File([blob], "alert_photo.jpg", { type: "image/jpeg" });
        try {
            if(navigator.share && navigator.canShare({files: [file]})) { 
                await navigator.share({ files: [file], title: 'Emergency Photo', text: `SOS Photo! Loc: ${getLocationString()}` }); 
            } else { 
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'alert_photo.jpg'; a.click(); 
                showToast("Photo saved to device (Share API unsupported)", "info");
            }
        } catch(e) { console.warn(e); }
    }, 'image/jpeg', 0.8);
};

// --- ASSISTANCE & UTILITIES ---
window.toggleVoiceTrigger = async () => {
    const btn = document.getElementById('btn-voice-trigger'); const icon = document.getElementById('icon-voice');
    if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return showToast("Speech API not supported in browser", "error");
    
    if(window.AppState.isListening) { 
        window.AppState.voiceRecognition.stop(); window.AppState.isListening = false; 
        btn.classList.replace('bg-indigo-50','bg-white'); btn.classList.remove('border-indigo-400'); icon.classList.remove('animate-pulse'); 
    } else {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SpeechRecognition(); rec.continuous = true; rec.interimResults = true;
        rec.onresult = (e) => { 
            for(let i=e.resultIndex; i<e.results.length; i++) {
                if(e.results[i][0].transcript.toLowerCase().includes('help')) { 
                    rec.stop(); if(!window.AppState.sosActive) window.toggleSOS(true); 
                } 
            }
        };
        rec.onerror = (e) => { console.warn("Speech Rec Error", e); window.toggleVoiceTrigger(); }; 
        rec.start(); window.AppState.voiceRecognition = rec; window.AppState.isListening = true; 
        btn.classList.replace('bg-white','bg-indigo-50'); btn.classList.add('border-indigo-400'); icon.classList.add('animate-pulse'); 
        showToast("Say 'Help' to trigger SOS");
    }
};

window.speakLocation = () => {
    if(!window.AppState.location) return showToast("GPS missing", "error");
    window.speechSynthesis.cancel(); 
    const u = new SpeechSynthesisUtterance(`Emergency. My coordinates are ${window.AppState.location.lat.toFixed(4)}, ${window.AppState.location.lng.toFixed(4)}`);
    u.volume = 1; u.rate = 0.8; window.speechSynthesis.speak(u);
    showToast("Speaking location...");
};

window.playWhistle = async () => {
    const btn = document.getElementById('btn-whistle');
    if(window.AppState.whistleOscillator) { 
        window.AppState.whistleOscillator.stop(); window.AppState.whistleOscillator.dispose(); window.AppState.whistleOscillator = null; 
        btn.classList.replace('bg-sky-50','bg-white'); btn.classList.remove('border-sky-400');
    } else { 
        await Tone.start(); window.AppState.whistleOscillator = new Tone.Oscillator(2500, "sine").toDestination().start(); 
        btn.classList.replace('bg-white','bg-sky-50'); btn.classList.add('border-sky-400'); showToast("Whistle playing"); 
    }
};

window.toggleWakeLock = async () => {
    const btn = document.getElementById('btn-wakelock');
    if(!('wakeLock' in navigator)) return showToast("WakeLock not supported", "error");
    if(window.AppState.wakeLockSentinel) { 
        await window.AppState.wakeLockSentinel.release(); window.AppState.wakeLockSentinel = null; 
        btn.classList.replace('bg-amber-50','bg-white'); btn.classList.remove('border-amber-400');
    } else { 
        try { 
            window.AppState.wakeLockSentinel = await navigator.wakeLock.request('screen'); 
            btn.classList.replace('bg-white','bg-amber-50'); btn.classList.add('border-amber-400'); showToast("Screen forced ON"); 
            
            document.addEventListener('visibilitychange', async () => {
                if (window.AppState.wakeLockSentinel !== null && document.visibilityState === 'visible') {
                    window.AppState.wakeLockSentinel = await navigator.wakeLock.request('screen');
                }
            });
        } catch(e){ showToast("WakeLock error", "error"); } 
    }
};

window.findNearest = (query) => { 
    if(window.AppState.location) window.open(`https://maps.google.com/?q=${encodeURIComponent(query)}+near+me`, '_blank'); 
    else showToast("Needs GPS", "error");
};

window.openIncidentLog = () => {
    const logs = JSON.parse(localStorage.getItem('sh_logs') || '[]');
    let logHtml = logs.map(l => `<div class="p-3 bg-slate-50 mb-2 rounded-xl border border-slate-200"><p class="text-[10px] text-slate-400 font-bold mb-1">${new Date(l.time).toLocaleString()}</p><p class="text-sm text-slate-800">${l.text}</p></div>`).reverse().join('');
    openModal(`<h3 class="text-xl font-black mb-2 text-slate-900"><i class="ph-fill ph-notebook"></i> Private Diary</h3><p class="text-xs text-slate-500 mb-4">Saved locally on this device.</p><textarea id="log-text" class="w-full bg-slate-50 p-3 border rounded-xl mb-2 text-sm focus:outline-brand-500 font-bold" rows="3" placeholder="Note down license plates, descriptions, or suspicious activity..."></textarea><button onclick="saveLog()" class="w-full bg-slate-800 text-white p-3 rounded-xl font-bold mb-4 active:scale-95">Save Entry</button><div class="max-h-48 overflow-y-auto border-t border-slate-100 pt-2">${logHtml || '<p class="text-xs text-slate-400 text-center py-4">No entries yet.</p>'}</div>`);
};
window.saveLog = () => { 
    const t = document.getElementById('log-text').value; if(!t.trim()) return; 
    const logs = JSON.parse(localStorage.getItem('sh_logs') || '[]'); 
    logs.push({time: Date.now(), text: t}); localStorage.setItem('sh_logs', JSON.stringify(logs)); 
    closeModal(); showToast("Log saved securely", "success"); 
};

window.toggleStealthMode = () => {
    window.AppState.stealthClicks = 0; 
    document.getElementById('overlay-stealth').classList.remove('hidden'); document.getElementById('overlay-stealth').classList.add('flex');
    if(!window.AppState.audioRecorder && !window.AppState.videoRecorder) window.toggleAudioRecorder();
    document.body.style.backgroundColor = 'black';
    showToast("Screen dimmed. Tap 3 times rapidly to exit.");
};
window.exitStealthMode = () => { 
    window.AppState.stealthClicks++; 
    if(window.AppState.stealthClicks >= 3) {
        document.getElementById('overlay-stealth').classList.add('hidden');
        document.body.style.backgroundColor = ''; 
        window.AppState.stealthClicks = 0;
    }
    setTimeout(() => { window.AppState.stealthClicks = 0; }, 1500);
};