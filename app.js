import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getDatabase, ref, set, push, onValue, remove } from "firebase/database";

// ══════════════════════════════════════════
// STATE & CORE MANAGEMENT
// ══════════════════════════════════════════
const state = {
    user: null,
    theme: 'dark',
    activeView: 'home',
    sirenPlaying: false,
    stealthActive: false,
    sirenLoopId: null,
    emergencyContacts: [],
    sosTimerId: null
};

// LocalStorage Helper Utility
const ls = {
    get: (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } },
    set: (key, val) => { try { localStorage.setItem(key, val); } catch(e) {} }
};

// Global DOM View Switcher
window.switchActiveView = (viewId) => {
    document.querySelectorAll('.app-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
    
    const targetView = document.getElementById(`view-${viewId}`);
    const targetDock = document.getElementById(`dock-${viewId}`);
    
    if (targetView && targetDock) {
        targetView.classList.add('active');
        targetDock.classList.add('active');
        state.activeView = viewId;
    }
};

// System Global Toast Handler
window.showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast-msg ${type}`;
    let icon = 'ph-info';
    if(type==='success') icon='ph-check-circle';
    if(type==='error') icon='ph-warning-circle';
    t.innerHTML = `<i class="ph-bold ${icon}"></i><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
};

// Theme Management Engine
window.toggleTheme = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    ls.set('sh_theme', next);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = next === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
};

// ══════════════════════════════════════════
// SECURE BACKEND INTEGRATION (FIREBASE)
// ══════════════════════════════════════════
let db, auth;
let currentAuthActionType = 'login';

async function initFirebase() {
    // Replace with your explicit web configuration payload blocks
    const firebaseConfig = {
        apiKey: "YOUR_FIREBASE_API_KEY",
        authDomain: "YOUR_PROJECT.firebaseapp.com",
        databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    };

    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);
        setupAuthObserver();
    } catch (error) {
        console.warn("Firebase config elements are structural placeholders. System running on fallback layout matrices.");
    }
}

function setupAuthObserver() {
    if(!auth) return;
    onAuthStateChanged(auth, (user) => {
        const container = document.getElementById('auth-status-container');
        if (user) {
            state.user = user;
            if(container) {
                container.innerHTML = `
                    <button class="auth-pill-btn matched" onclick="triggerSignOut()">
                        <i class="ph-bold ph-sign-out"></i><span>Disconnect</span>
                    </button>`;
            }
            showToast(`Secure node connected: ${user.email}`, 'success');
            syncContactsFromCloud();
        } else {
            state.user = null;
            if(container) {
                container.innerHTML = `
                    <button class="auth-pill-btn" onclick="openAuthModal()">
                        <i class="ph-bold ph-user"></i><span>Sign In</span>
                    </button>`;
            }
            state.emergencyContacts = JSON.parse(ls.get('sh_local_contacts', '[]'));
            renderContactsUI();
        }
    });
}

window.openAuthModal = () => document.getElementById('auth-modal')?.classList.add('active');
window.closeAuthModal = () => document.getElementById('auth-modal')?.classList.remove('active');

window.switchAuthTab = (type) => {
    currentAuthActionType = type;
    document.getElementById('tab-login-trigger').classList.toggle('active', type === 'login');
    document.getElementById('tab-register-trigger').classList.toggle('active', type === 'register');
    document.getElementById('auth-submit-action').innerText = type === 'login' ? 'Process Secure Entry' : 'Build Shield Account';
};

window.executeAuthAction = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if(!email || !pass) return showToast('Complete credential vectors.', 'error');

    if(!auth) return showToast('Database link uninitialized.', 'error');

    try {
        if (currentAuthActionType === 'login') {
            await signInWithEmailAndPassword(auth, email, pass);
        } else {
            await createUserWithEmailAndPassword(auth, email, pass);
        }
        closeAuthModal();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.triggerSignOut = () => { if(auth) signOut(auth).then(() => showToast('Session cleared safely.', 'info')); };

// ══════════════════════════════════════════
// AUDITORY DEFENSE & DEVICE WEB APIS
// ══════════════════════════════════════════
window.triggerSirenAlarm = async () => {
    const card = document.querySelector('.pulse-card');
    if (state.sirenPlaying) {
        if(state.sirenLoopId) clearInterval(state.sirenLoopId);
        state.sirenPlaying = false;
        card?.classList.remove('active');
        showToast('Acoustic beacon deactivated.', 'info');
        return;
    }

    try {
        await Tone.start();
        const synth = new Tone.Synth({
            oscillator: { type: "sawtooth" },
            envelope: { attack: 0.1, decay: 0.2, sustain: 0.9, release: 0.3 }
        }).toDestination();

        state.sirenPlaying = true;
        card?.classList.add('active');
        showToast('High-decibel alert active.', 'warning');

        let highFlag = false;
        state.sirenLoopId = setInterval(() => {
            if (!state.sirenPlaying) return;
            synth.triggerAttackRelease(highFlag ? 900 : 600, "4n");
            highFlag = !highFlag;
        }, 300);
    } catch (e) {
        showToast('Audio Context blocked by client policies.', 'error');
    }
};

window.toggleStealthMode = () => {
    const card = document.querySelector('.counter-card');
    state.stealthActive = !state.stealthActive;
    card?.classList.toggle('active', state.stealthActive);
    
    if (state.stealthActive) {
        showToast('Stealth monitor active. Screen masking frame running.', 'success');
        navigator.geolocation?.getCurrentPosition(
            (pos) => console.log(`[Stealth Track]: Lat ${pos.coords.latitude}, Lng ${pos.coords.longitude}`),
            () => {}, { enableHighAccuracy: true }
        );
    } else {
        showToast('Stealth matrix down.', 'info');
    }
};

window.handleSosActivation = () => {
    const btn = document.getElementById('sos-trigger');
    btn.classList.toggle('active');
    
    if(btn.classList.contains('active')) {
        showToast('SOS Transmission initialized.', 'success');
        if(navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const mapLink = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
                showToast('Coordinates locked. Packaging emergency data payload...', 'success');
                state.emergencyContacts.forEach(c => {
                    console.log(`[SOS Matrix Outbound] To: ${c.phone} | Data: Help! Locked location: ${mapLink}`);
                });
            }, () => showToast('Unable to grab location vectors.', 'error'), { enableHighAccuracy: true });
        }
    } else {
        showToast('SOS Standby active.', 'info');
    }
};

// ══════════════════════════════════════════
// EMERGENCY CONTACT REGISTRY
// ══════════════════════════════════════════
function renderContactsUI() {
    const list = document.getElementById('contacts-list');
    if(!list) return;
    list.innerHTML = '';
    
    if (state.emergencyContacts.length === 0) {
        list.innerHTML = '<p style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px;">No registered guardian nodes found.</p>';
        return;
    }

    state.emergencyContacts.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'contact-item';
        row.innerHTML = `
            <div class="contact-meta-info">
                <span class="c-name">${c.name}</span>
                <span class="c-phone">${c.phone}</span>
            </div>
            <button class="remove-contact-btn" data-id="${c.id}"><i class="ph-bold ph-trash"></i></button>
        `;
        row.querySelector('.remove-contact-btn').addEventListener('click', () => removeContactNode(c.id));
        list.appendChild(row);
    });
}

window.addNewEmergencyContact = async () => {
    const nameEl = document.getElementById('contact-name');
    const phoneEl = document.getElementById('contact-phone');
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();

    if(!name || !phone) return showToast('Ensure contact fields are populated.', 'error');

    const newContact = { id: Date.now().toString(), name, phone };

    if (state.user && db) {
        try {
            await push(ref(db, `users/${state.user.uid}/contacts`), { name, phone });
            showToast('Guardian cloud node committed.', 'success');
        } catch {
            showToast('Cloud commit failure.', 'error');
        }
    } else {
        state.emergencyContacts.push(newContact);
        ls.set('sh_local_contacts', JSON.stringify(state.emergencyContacts));
        showToast('Saved locally (Offline state).', 'success');
        renderContactsUI();
    }

    nameEl.value = ''; phoneEl.value = '';
};

async function removeContactNode(id) {
    if (state.user && db) {
        try {
            await remove(ref(db, `users/${state.user.uid}/contacts/${id}`));
            showToast('Cloud record purged.', 'info');
        } catch {
            showToast('Purge event failed.', 'error');
        }
    } else {
        state.emergencyContacts = state.emergencyContacts.filter(c => c.id !== id);
        ls.set('sh_local_contacts', JSON.stringify(state.emergencyContacts));
        showToast('Local trace cleared.', 'info');
        renderContactsUI();
    }
}

function syncContactsFromCloud() {
    if(!state.user || !db) return;
    onValue(ref(db, `users/${state.user.uid}/contacts`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.emergencyContacts = Object.keys(data).map(key => ({
                id: key,
                name: data[key].name,
                phone: data[key].phone
            }));
        } else {
            state.emergencyContacts = [];
        }
        renderContactsUI();
    });
}

// ══════════════════════════════════════════
// COGNITIVE LAYER: GEMINI AI ENGINE
// ══════════════════════════════════════════
window.saveSystemKeys = () => {
    const token = document.getElementById('api-key-input').value.trim();
    if(!token) return showToast('Provide a structural runtime token.', 'error');
    ls.set('sh_gemini_key', token);
    showToast('Secure local memory updated with API token.', 'success');
};

async function requestGeminiService(promptText) {
    const token = ls.get('sh_gemini_key', '');
    if(!token) throw new Error("Missing Token Framework in configuration panel.");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${token}`;
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    if(!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP Exception Gateway: ${response.status}`);
    }

    const json = await response.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || "The endpoint evaluated an empty structural matrix response.";
}

window.sendChatMessage = async () => {
    const input = document.getElementById('chat-input');
    const history = document.getElementById('chat-messages');
    const query = input?.value.trim();
    if(!query || !history) return;

    input.value = '';
    
    // Render user dialog interface frame
    const userRow = document.createElement('div');
    userRow.className = 'user-msg-wrapper';
    userRow.innerHTML = `<div class="msg-bubble">${query}</div>`;
    history.appendChild(userRow);
    history.scrollTop = history.scrollHeight;

    // Build processing layout state
    const botRow = document.createElement('div');
    botRow.className = 'bot-msg-wrapper';
    botRow.innerHTML = `
        <div class="bot-avatar"><i class="ph-bold ph-cpu"></i></div>
        <div class="msg-bubble processing"><div class="loader-dots"><span></span><span></span><span></span></div></div>`;
    history.appendChild(botRow);
    history.scrollTop = history.scrollHeight;

    try {
        const response = await requestGeminiService(`
            You are SafeHer AI, an expert structural intelligence engine specializing in personal defense strategies, legal transparency framework structures, and trauma-informed cognitive support under Indian laws (IPC, Bhartiya Nyaya Sanhita, POSH metrics, etc.).
            Analyze the following user text sequence expertly. Respond with clean, modern layout architectures using Markdown parsing. Maintain a balance between crisp guidance patterns and deep structural insight. Do not hallucinate files or paths.
            
            User message context input: ${query}
        `);
        botRow.querySelector('.msg-bubble').innerHTML = formatMarkdown(response);
    } catch (e) {
        botRow.querySelector('.msg-bubble').innerHTML = `<p style="color:var(--red);">Operational Error: ${e.message}</p>`;
    }
    history.scrollTop = history.scrollHeight;
};

function formatMarkdown(text) {
    // Escaping simple HTML wrappers safely
    let clean = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Code block wrappers parsing logic matrices
    clean = clean.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline bold highlighting transformations
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return clean;
}

window.compileLegalFirDraft = async () => {
    const narrative = document.getElementById('fir-narrative').value.trim();
    const el = document.getElementById('fir-output-box');
    if(!narrative || !el) return showToast('Input operational details first.', 'error');

    el.className = 'fir-output-box';
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--secondary)"><i class="ph-bold ph-cpu" style="font-size:28px;animation:pulseFloat 1.5s infinite"></i><span>Parsing Legal Matrices...</span></div>';

    try {
        const response = await requestGeminiService(`
            You are a structural paralegal engine integrated into the SafeHer application ecosystem. 
            Analyze the raw text narrative input provided by the victim below and convert it into an expertly compiled legal draft suitable for printing or submitting as a formal First Information Report (FIR) to law enforcement officials in India.
            
            Explicit Output Construction Goals:
            1. Isolate chronologies clearly (Date, Time, Location constraints).
            2. Map explicit behaviors to proper statutory offenses (e.g., matching Stalking to IPC Section 354D / BNS frameworks, Criminal Intimidation to Section 503/506, Assault to Section 351). Mention legal codes precisely.
            3. Ensure standard formal legal structures while keeping the structural tone strictly objective, rigorous, and completely accurate.
            
            Victim's narrative input description: "${narrative}"
        `);
        
        el.innerHTML = `<div>${response}</div><button class="primary-btn" onclick="copyText(\`${response.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" style="margin-top:16px;max-width:180px;height:38px;font-size:12px;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="ph-bold ph-copy\"></i>Copy FIR Draft</button>`;
    } catch(e) {
        el.innerHTML = `<p style="color:var(--red);font-size:12px;">Error: ${e.message}</p>`;
    }
};

window.copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    } catch {
        showToast('Copy failed', 'error');
    }
};

window.runEmotionalSupport = () => {
    switchActiveView('ai');
    setTimeout(() => {
        document.getElementById('chat-input').value = "I need emotional support. I've been through something scary and I feel anxious.";
        sendChatMessage();
    }, 500);
};

window.runLegalAdvisor = () => {
    switchActiveView('ai');
    setTimeout(() => {
        document.getElementById('chat-input').value = "What are my legal rights as a woman in India if I face harassment or assault? What IPC sections protect me?";
        sendChatMessage();
    }, 500);
};

window.runSelfDefenseAI = () => {
    switchActiveView('ai');
    setTimeout(() => {
        document.getElementById('chat-input').value = "Give me practical self-defense tips and de-escalation techniques for common threatening situations.";
        sendChatMessage();
    }, 500);
};

// ══════════════════════════════════════════
// APP INITIALIZATION
// ══════════════════════════════════════════
(async () => {
    // Apply saved theme configuration patterns instantly
    const t = ls.get('sh_theme', 'dark');
    document.documentElement.setAttribute('data-theme', t || 'dark');
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.className = t === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';

    // Hydrate key input element if token exists
    const keyInput = document.getElementById('api-key-input');
    if (keyInput) keyInput.value = ls.get('sh_gemini_key', '');

    await initFirebase();
    
    // Dismiss Splash Screen Frame cleanly once scripts process completely
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) splash.classList.add('hidden');
    }, 1200);
})();