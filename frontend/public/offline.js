// Het script van offline.html. Stond inline in die pagina, maar de
// Content-Security-Policy staat alleen scripts van de eigen herkomst toe en
// geen onclick-attributen.

// Toon of er weer verbinding is, en ga dan terug naar de applicatie.
function updateStatus() {
  const statusEl = document.getElementById('connection-status');
  const textEl = document.getElementById('status-text');

  if (navigator.onLine) {
    statusEl.classList.add('online');
    textEl.textContent = 'Verbonden';
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  } else {
    statusEl.classList.remove('online');
    textEl.textContent = 'Geen verbinding';
  }
}

function tryReconnect(event) {
  updateStatus();
  if (navigator.onLine) {
    window.location.href = '/';
    return;
  }
  // Even laten zien dat er iets gebeurt.
  const btn = event.currentTarget;
  btn.textContent = 'Verbinden...';
  setTimeout(() => {
    btn.textContent = 'Opnieuw proberen';
    updateStatus();
  }, 1500);
}

// Terug naar de applicatie; die komt uit de cache.
function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
}

document.getElementById('opnieuw-proberen').addEventListener('click', tryReconnect);
document.getElementById('terug-naar-app').addEventListener('click', goBack);
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);

updateStatus();
