'use strict';

// =====================================================
//  Config & stare
// =====================================================
const API = '/api';
const RESERVATION_MS = 30 * 60 * 1000;
const REFRESH_MS = 15000;
const LS_TOKEN = 'jwt_token';
const LS_RES = 'my_reservations';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
    parkings: [],
    markers: new Map(),   // id -> L.Marker
    isAdmin: false,
    chart: null,
    tempMarker: null,
    tempLatLng: null,
    reserveId: null,
    deleteId: null,
    myReservations: loadReservations(),  // [{ parkingId, plate, reservedAt(ms) }]
    favorites: new Set(loadJson('favorites', [])),
    filter: 'all',
    userPos: null,                       // { lat, lng }
    userMarker: null,
    chart2: null
};

function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ---------- Temă ----------
function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('theme-btn').textContent = t === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('theme', t); } catch { /* ignore */ }
}
$('theme-btn').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
applyTheme((() => { try { return localStorage.getItem('theme'); } catch { return null; } })()
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

// =====================================================
//  Hartă
// =====================================================
const map = L.map('map', { zoomControl: false }).setView([44.4268, 26.1025], 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);
let tileErrors = 0;
tiles.on('tileerror', () => {
    if (++tileErrors === 5) toast('Nu pot încărca harta (verifică conexiunea la internet).', 'err');
});
// Recalculează dimensiunea hărții după încărcarea layout-ului/fonturilor
window.addEventListener('load', () => map.invalidateSize());
window.addEventListener('resize', () => map.invalidateSize());

// =====================================================
//  Utilitare
// =====================================================
function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3600);
}

const openModal = (id) => { $(id).style.display = 'flex'; };
const closeModal = (id) => { $(id).style.display = 'none'; };

document.querySelectorAll('.modal-overlay').forEach(m =>
    m.addEventListener('mousedown', e => { if (e.target === m) { m.style.display = 'none'; if (m.id === 'addModal') clearTempMarker(); } }));
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); clearTempMarker(); }
});

// Serverul (SQLite) întoarce uneori ora UTC fără "Z" -> o tratăm explicit ca UTC
function parseServerDate(s) {
    if (!s) return null;
    const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
    const t = new Date(hasTz ? s : s + 'Z').getTime();
    return isNaN(t) ? null : t;
}

function fmtRemaining(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60), s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function statusOf(p) {
    const pct = p.totalSpots ? (p.availableSpots / p.totalSpots) * 100 : 0;
    if (p.availableSpots <= 0) return { color: '#ef4444', label: 'Plin' };
    if (pct < 50) return { color: '#f59e0b', label: 'Aproape plin' };
    return { color: '#10b981', label: 'Disponibil' };
}

function authHeaders(json = false) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    const t = localStorage.getItem(LS_TOKEN);
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
}

async function api(path, opts = {}) {
    const res = await fetch(API + path, opts);
    if (res.status === 401) { logout(true); }
    return res;
}

// =====================================================
//  Rezervările mele (per browser)
// =====================================================
function loadReservations() {
    try { return JSON.parse(localStorage.getItem(LS_RES)) || []; } catch { return []; }
}
function saveReservations() {
    try { localStorage.setItem(LS_RES, JSON.stringify(state.myReservations)); } catch { /* ignore */ }
}
const myReservationFor = (id) => state.myReservations.find(r => r.parkingId === id);

async function releaseSpot(parkingId, silent = false) {
    try {
        const res = await api(`/parkings/${parkingId}/release`, { method: 'PUT' });
        if (!res.ok && res.status !== 404) throw new Error(res.status);
    } catch (e) {
        if (!silent) toast('Nu am putut elibera locul.', 'err');
        return false;
    }
    state.myReservations = state.myReservations.filter(r => r.parkingId !== parkingId);
    saveReservations();
    return true;
}

// Rezervările expirate sunt eliberate automat pe server
async function expireReservations() {
    const now = Date.now();
    const expired = state.myReservations.filter(r => now - r.reservedAt >= RESERVATION_MS);
    for (const r of expired) {
        const p = state.parkings.find(x => x.id === r.parkingId);
        await releaseSpot(r.parkingId, true);
        toast(`Rezervarea de la ${p ? p.name : 'parcare'} a expirat.`);
    }
    if (expired.length) await loadParkings();
}

function renderMyReservations() {
    const box = $('my-reservations'), list = $('my-res-list');
    // curățăm rezervări pentru parcări șterse
    state.myReservations = state.myReservations.filter(r => state.parkings.some(p => p.id === r.parkingId));
    if (!state.myReservations.length) { box.style.display = 'none'; list.innerHTML = ''; return; }
    box.style.display = 'block';
    list.innerHTML = state.myReservations.map(r => {
        const p = state.parkings.find(x => x.id === r.parkingId);
        return `<div class="res-item">
            <div class="info"><b>${esc(p?.name)}</b><span>🚗 ${esc(r.plate)}</span></div>
            <div class="time" data-expires="${r.reservedAt + RESERVATION_MS}">--:--</div>
            <button data-release="${r.parkingId}">Eliberează</button>
        </div>`;
    }).join('');
    tickTimers();
}

function tickTimers() {
    const now = Date.now();
    document.querySelectorAll('[data-expires]').forEach(el => {
        el.textContent = fmtRemaining(Number(el.dataset.expires) - now);
    });
    if (state.myReservations.some(r => now - r.reservedAt >= RESERVATION_MS)) expireReservations();
}
setInterval(tickTimers, 1000);

// =====================================================
//  Date
// =====================================================
async function loadParkings() {
    try {
        const res = await fetch(`${API}/parkings`);
        if (!res.ok) throw new Error(res.status);
        state.parkings = await res.json();
        render();
    } catch (e) {
        console.error(e);
        if (!state.parkings.length)
            $('parking-list').innerHTML = '<div class="empty-state"><div>⚠️</div>Nu m-am putut conecta la server.</div>';
    }
}
setInterval(() => { if (!document.hidden) loadParkings(); }, REFRESH_MS);

function visibleParkings() {
    const term = $('search-input').value.trim().toLowerCase();
    const sort = $('sort-select').value;
    const data = state.parkings.filter(p => {
        if (!(p.name.toLowerCase().includes(term) || p.address.toLowerCase().includes(term))) return false;
        if (state.filter === 'free') return p.availableSpots > 0;
        if (state.filter === 'cheap') return p.pricePerHour <= 6;
        if (state.filter === 'fav') return state.favorites.has(p.id);
        return true;
    });
    if (sort === 'distance' && state.userPos)
        data.sort((a, b) => distanceKm(state.userPos, a) - distanceKm(state.userPos, b));
    if (sort === 'price-asc') data.sort((a, b) => a.pricePerHour - b.pricePerHour);
    if (sort === 'price-desc') data.sort((a, b) => b.pricePerHour - a.pricePerHour);
    if (sort === 'spots-desc') data.sort((a, b) => b.availableSpots - a.availableSpots);
    return data;
}

window.filterAndSortParkings = () => render();

// ---------- Filtre rapide ----------
$('filter-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-filter]');
    if (!c) return;
    state.filter = c.dataset.filter;
    document.querySelectorAll('#filter-chips .chip').forEach(x => x.classList.toggle('active', x === c));
    render();
});

// ---------- Locație utilizator ----------
function distanceKm(a, p) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (p.latitude - a.lat) * rad, dLng = (p.longitude - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(p.latitude * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

$('locate-btn').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Browserul nu suportă geolocația.', 'err');
    const btn = $('locate-btn');
    btn.classList.add('busy');
    navigator.geolocation.getCurrentPosition((pos) => {
        btn.classList.remove('busy');
        state.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (state.userMarker) map.removeLayer(state.userMarker);
        state.userMarker = L.marker([state.userPos.lat, state.userPos.lng], {
            icon: L.divIcon({ className: 'pin-wrap', html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            interactive: false, zIndexOffset: -500
        }).addTo(map);
        $('sort-select').value = 'distance';
        map.flyTo([state.userPos.lat, state.userPos.lng], 14, { duration: 1 });
        toast('Locația ta a fost găsită. Sortez după distanță.', 'ok');
        render();
    }, () => {
        btn.classList.remove('busy');
        toast('Nu am putut obține locația (permite accesul în browser).', 'err');
    }, { enableHighAccuracy: true, timeout: 10000 });
});

// ---------- Favorite ----------
function toggleFavorite(id) {
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    saveJson('favorites', [...state.favorites]);
    render();
}

// =====================================================
//  Randare
// =====================================================
function pinIcon(p, color) {
    return L.divIcon({
        className: 'pin-wrap',
        html: `<div class="pin" style="--c:${color}"><span>${p.availableSpots}</span></div>`,
        iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -34]
    });
}

function popupHtml(p) {
    return `<div class="pop"><h4>${esc(p.name)}</h4><p>${esc(p.address)}</p>
        <div class="row"><span>Locuri libere</span><b>${p.availableSpots}/${p.totalSpots}</b></div>
        <div class="row"><span>Preț</span><b>${p.pricePerHour} RON/oră</b></div></div>`;
}

function syncMarkers(data) {
    const keep = new Set(data.map(p => p.id));
    for (const [id, m] of state.markers) {
        if (!keep.has(id)) { map.removeLayer(m); state.markers.delete(id); }
    }
    data.forEach(p => {
        const st = statusOf(p);
        let m = state.markers.get(p.id);
        if (!m) {
            m = L.marker([p.latitude, p.longitude], { icon: pinIcon(p, st.color) }).addTo(map).bindPopup(popupHtml(p));
            state.markers.set(p.id, m);
        } else {
            m.setIcon(pinIcon(p, st.color));
            m.setPopupContent(popupHtml(p));
        }
    });
}

function render() {
    const data = visibleParkings();
    const list = $('parking-list');

    const free = data.reduce((s, p) => s + Math.max(0, p.availableSpots), 0);
    $('global-stats').innerHTML = `
        <div class="stat-tile a"><b>${data.length}</b><span>Parcări active</span></div>
        <div class="stat-tile b"><b>${free}</b><span>Locuri libere</span></div>`;

    syncMarkers(data);
    renderMyReservations();

    if (!data.length) {
        list.innerHTML = state.parkings.length
            ? '<div class="empty-state"><div>🔎</div>Nu am găsit rezultate.</div>'
            : `<div class="empty-state"><div>🅿️</div>Nu există parcări încă.<p class="hint">${state.isAdmin
                ? 'Click pe hartă pentru a adăuga prima parcare.'
                : 'Un administrator trebuie să adauge parcări.'}</p></div>`;
        return;
    }

    list.innerHTML = data.map((p, i) => {
        const st = statusOf(p);
        const occ = p.totalSpots ? Math.round(((p.totalSpots - p.availableSpots) / p.totalSpots) * 100) : 100;
        const mine = myReservationFor(p.id);
        return `<div class="parking-card" data-id="${p.id}" style="--status:${st.color};animation-delay:${Math.min(i * 40, 400)}ms">
            <div class="card-header">
                <div>
                    <h3 class="card-title">${esc(p.name)}</h3>
                    <p class="card-address">📍 ${esc(p.address)}${state.userPos ? `<span class="dist-tag">${fmtDist(distanceKm(state.userPos, p))}</span>` : ''}</p>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                    <span class="status-pill">${st.label}</span>
                    <button class="btn-fav ${state.favorites.has(p.id) ? 'on' : ''}" data-fav="${p.id}" title="Favorită">${state.favorites.has(p.id) ? '♥' : '♡'}</button>
                    <button class="btn-delete" data-delete="${p.id}" title="Șterge parcare">✕</button>
                </div>
            </div>
            <div class="occupancy">
                <div class="bar"><i style="width:${occ}%"></i></div>
                <div class="occ-row">
                    <span>Libere: <b>${p.availableSpots}</b> / ${p.totalSpots}</span>
                    <span class="price">${p.pricePerHour} <small>RON/h</small></span>
                </div>
            </div>
            ${mine ? `<div class="timer-badge active">✅ Rezervat (${esc(mine.plate)}) · <span data-expires="${mine.reservedAt + RESERVATION_MS}">--:--</span></div>` : ''}
            <div class="card-actions">
                <button class="btn-reserve" data-reserve="${p.id}" ${p.availableSpots <= 0 || mine ? 'disabled' : ''}>${mine ? 'Rezervat' : 'Rezervă'}</button>
                <a class="btn-nav" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}">🧭 Navighează</a>
            </div>
        </div>`;
    }).join('');
    tickTimers();
}

// Delegare evenimente pe lista de carduri / rezervări
$('parking-list').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) return toggleFavorite(Number(fav.dataset.fav));
    const del = e.target.closest('[data-delete]');
    if (del) return askDelete(Number(del.dataset.delete));
    const res = e.target.closest('[data-reserve]');
    if (res) return askReserve(Number(res.dataset.reserve));
    if (e.target.closest('.btn-nav')) return;
    const card = e.target.closest('.parking-card');
    if (card) {
        const p = state.parkings.find(x => x.id === Number(card.dataset.id));
        if (!p) return;
        map.flyTo([p.latitude, p.longitude], 16, { duration: 1.1 });
        map.once('moveend', () => state.markers.get(p.id)?.openPopup());
    }
});

$('my-res-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-release]');
    if (!b) return;
    if (await releaseSpot(Number(b.dataset.release))) { toast('Loc eliberat.', 'ok'); loadParkings(); }
});

// =====================================================
//  Rezervare
// =====================================================
function askReserve(id) {
    const p = state.parkings.find(x => x.id === id);
    if (!p) return;
    state.reserveId = id;
    $('reserveInfo').textContent = `${p.name} · ${p.pricePerHour} RON/oră`;
    $('plateInput').value = '';
    $('hoursSelect').value = '1';
    updateCost();
    openModal('reserveModal');
    setTimeout(() => $('plateInput').focus(), 50);
}
window.closeReserve = () => closeModal('reserveModal');

function updateCost() {
    const p = state.parkings.find(x => x.id === state.reserveId);
    const hours = Number($('hoursSelect').value);
    $('costEstimate').textContent = p ? `${(p.pricePerHour * hours).toFixed(2).replace(/\.00$/, '')} RON` : '0 RON';
}
$('hoursSelect').addEventListener('change', updateCost);

async function confirmReserve() {
    const plate = $('plateInput').value.trim().toUpperCase();
    if (!plate) return toast('Introdu numărul de înmatriculare.', 'err');
    const id = state.reserveId;
    closeReserve();
    try {
        const res = await api(`/parkings/${id}/reserve`, { method: 'PUT' });
        if (res.ok) {
            const updated = await res.json();
            const t = parseServerDate(updated.reservationTime) || Date.now();
            state.myReservations = state.myReservations.filter(r => r.parkingId !== id);
            state.myReservations.push({ parkingId: id, plate, reservedAt: t });
            saveReservations();
            toast(`Loc rezervat pentru ${plate}! Ai 30 de minute.`, 'ok');
        } else {
            toast(res.status === 400 ? 'Parcarea este plină!' : 'Nu am putut rezerva locul.', 'err');
        }
    } catch (e) { console.error(e); toast('Eroare de conexiune.', 'err'); }
    loadParkings();
}
$('confirmReserveBtn').addEventListener('click', confirmReserve);
$('plateInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmReserve(); });

// =====================================================
//  Ștergere (admin)
// =====================================================
function askDelete(id) {
    const p = state.parkings.find(x => x.id === id);
    state.deleteId = id;
    $('confirmText').textContent = p ? `„${p.name}” va fi ștearsă definitiv.` : 'Acțiunea nu poate fi anulată.';
    openModal('confirmModal');
}
window.closeConfirm = () => closeModal('confirmModal');

$('confirmDeleteBtn').addEventListener('click', async () => {
    const id = state.deleteId;
    closeConfirm();
    try {
        const res = await api(`/parkings/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (res.ok) {
            state.myReservations = state.myReservations.filter(r => r.parkingId !== id);
            saveReservations();
            toast('Parcare ștearsă.', 'ok');
        } else toast('Eroare la ștergere.', 'err');
    } catch (e) { console.error(e); toast('Eroare de conexiune.', 'err'); }
    loadParkings();
});

// =====================================================
//  Adăugare parcare (admin) – click pe hartă
// =====================================================
function clearTempMarker() {
    if (state.tempMarker) { map.removeLayer(state.tempMarker); state.tempMarker = null; }
}

map.on('click', (e) => {
    if (!state.isAdmin) {
        toast('Mod vizualizare. Autentifică-te ca Administrator pentru a adăuga parcări.');
        return;
    }
    clearTempMarker();
    state.tempLatLng = e.latlng;
    state.tempMarker = L.marker(e.latlng, {
        icon: L.divIcon({ className: 'pin-wrap', html: '<div class="pin temp"><span>+</span></div>', iconSize: [36, 36], iconAnchor: [18, 36] })
    }).addTo(map);
    $('addCoords').textContent = `Poziție: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
    ['addName', 'addAddress', 'addTotal', 'addPrice'].forEach(i => $(i).value = '');
    $('addError').style.display = 'none';
    openModal('addModal');
    setTimeout(() => $('addName').focus(), 50);
});

$('closeAddBtn').addEventListener('click', () => { closeModal('addModal'); clearTempMarker(); });

$('saveAddBtn').addEventListener('click', async () => {
    const err = $('addError');
    const total = parseInt($('addTotal').value, 10);
    const price = parseFloat($('addPrice').value);
    const name = $('addName').value.trim(), address = $('addAddress').value.trim();
    if (!name || !address || !(total > 0) || !(price >= 0)) {
        err.textContent = 'Completează corect toate câmpurile.';
        err.style.display = 'block';
        return;
    }
    const body = {
        name, address,
        latitude: state.tempLatLng.lat, longitude: state.tempLatLng.lng,
        totalSpots: total, availableSpots: total, pricePerHour: price
    };
    try {
        const res = await api('/parkings', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
        if (res.ok) {
            closeModal('addModal'); clearTempMarker();
            toast('Parcare adăugată ✔', 'ok');
            loadParkings();
        } else { err.textContent = 'Eroare la salvare.'; err.style.display = 'block'; }
    } catch (e) { console.error(e); err.textContent = 'Eroare de conexiune.'; err.style.display = 'block'; }
});

// =====================================================
//  Admin / login JWT
// =====================================================
function tokenValid() {
    const t = localStorage.getItem(LS_TOKEN);
    if (!t) return false;
    try {
        const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return !payload.exp || payload.exp * 1000 > Date.now();
    } catch { return false; }
}

function applyAdminUI() {
    const btn = $('admin-btn');
    document.body.classList.toggle('admin-mode', state.isAdmin);
    btn.className = 'chip-btn ' + (state.isAdmin ? 'chip-danger' : 'chip-neutral');
    btn.textContent = state.isAdmin ? '🔓 Ieși' : '🔒 Admin';
}

function logout(expired = false) {
    if (!state.isAdmin) return;
    state.isAdmin = false;
    localStorage.removeItem(LS_TOKEN);
    applyAdminUI();
    closeStats();
    render();
    toast(expired ? 'Sesiunea a expirat. Autentifică-te din nou.' : 'Te-ai deconectat.');
}

window.toggleAdmin = () => {
    if (state.isAdmin) return logout();
    $('loginError').style.display = 'none';
    openModal('loginModal');
    setTimeout(() => $('adminEmail').focus(), 50);
};
$('closeModalBtn').addEventListener('click', () => closeModal('loginModal'));

async function submitLogin() {
    const email = $('adminEmail').value.trim(), password = $('adminPassword').value;
    const err = $('loginError');
    err.style.display = 'none';
    if (!email || !password) { err.textContent = 'Completează ambele câmpuri!'; err.style.display = 'block'; return; }
    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem(LS_TOKEN, data.token);
            state.isAdmin = true;
            $('adminPassword').value = '';
            closeModal('loginModal');
            applyAdminUI();
            render();
            toast('Te-ai logat ca Administrator ✔', 'ok');
        } else {
            err.textContent = 'Credențiale incorecte sau fără drepturi de admin.';
            err.style.display = 'block';
        }
    } catch (e) { console.error(e); err.textContent = 'Eroare de conexiune cu serverul.'; err.style.display = 'block'; }
}
$('submitLoginBtn').addEventListener('click', submitLogin);
$('adminPassword').addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });

// =====================================================
//  Dashboard financiar
// =====================================================
window.showStats = () => {
    openModal('stats-modal');
    const labels = [], revenues = [];
    let total = 0;
    state.parkings.forEach(p => {
        const r = Math.max(0, p.totalSpots - p.availableSpots) * p.pricePerHour;
        labels.push(p.name); revenues.push(r); total += r;
    });
    $('total-revenue').textContent = `💰 Încasări estimate rețea: ${total.toLocaleString('ro-RO')} RON / oră`;
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($('revenueChart').getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Încasări curente (RON/h)', data: revenues, backgroundColor: '#6366f1', hoverBackgroundColor: '#4f46e5', borderRadius: 8, maxBarThickness: 48 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#eef2f7' } }, x: { grid: { display: false } } }
        }
    });

    // KPI + grafic de ocupare
    const totalSpots = state.parkings.reduce((s, p) => s + p.totalSpots, 0);
    const freeSpots = state.parkings.reduce((s, p) => s + Math.max(0, p.availableSpots), 0);
    const occupied = Math.max(0, totalSpots - freeSpots);
    const pct = totalSpots ? Math.round((occupied / totalSpots) * 100) : 0;
    $('kpi-row').innerHTML = `
        <div class="kpi"><b>${state.parkings.length}</b><span>Parcări</span></div>
        <div class="kpi"><b>${totalSpots}</b><span>Locuri totale</span></div>
        <div class="kpi"><b>${pct}%</b><span>Grad de ocupare</span></div>
        <div class="kpi"><b>${state.parkings.filter(p => p.availableSpots <= 0).length}</b><span>Parcări pline</span></div>`;
    if (state.chart2) state.chart2.destroy();
    state.chart2 = new Chart($('occupancyChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Ocupate', 'Libere'], datasets: [{ data: [occupied, freeSpots], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' } } }
    });
};
window.closeStats = () => closeModal('stats-modal');

// =====================================================
//  Pornire
// =====================================================
state.isAdmin = tokenValid();
if (!state.isAdmin) localStorage.removeItem(LS_TOKEN);
applyAdminUI();
loadParkings();
