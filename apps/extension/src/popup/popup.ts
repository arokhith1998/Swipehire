/**
 * Popup UI — what the user sees when they click the extension icon.
 * Shows session status, last sync, settings link.
 */

interface Session {
  token: string;
  userId: number;
  expiresAt: string;
}

const root = document.getElementById('root')!;

(async () => {
  const session: Session | null = await sendMessage({ type: 'GET_SESSION' });
  if (!session) {
    root.innerHTML = renderSignedOut();
    document.getElementById('btn-signin')?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://swipehire.io/extension-login' });
    });
    return;
  }

  const profile = await sendMessage({ type: 'GET_PROFILE' });
  root.innerHTML = renderSignedIn(session, profile);
  document.getElementById('btn-signout')?.addEventListener('click', async () => {
    await sendMessage({ type: 'CLEAR_SESSION' });
    location.reload();
  });
  document.getElementById('btn-open')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://swipehire.io/dashboard' });
  });
})();

function renderSignedOut(): string {
  return `
    <div class="card">
      <div class="logo">
        <span class="logo-mark">SH</span>
        <strong>SwipeHire</strong>
      </div>
      <p class="muted">Sign in to your SwipeHire account to auto-fill applications on any career page.</p>
      <button id="btn-signin" class="btn-primary">Sign in</button>
      <p class="fineprint">We'll always show you what we're about to fill before doing it.<br/>You always click Submit yourself.</p>
    </div>
  `;
}

function renderSignedIn(session: Session, profile: any): string {
  const name = profile?.fullName ?? `User #${session.userId}`;
  return `
    <div class="card">
      <div class="logo">
        <span class="logo-mark">SH</span>
        <strong>SwipeHire</strong>
      </div>
      <p class="signed-in">Signed in as <strong>${name}</strong></p>
      ${profile?.requiresSponsorship ? `
        <div class="badge badge-info">🌍 Sponsorship-aware fill enabled</div>
      ` : ''}
      <button id="btn-open" class="btn-primary">Open SwipeHire</button>
      <button id="btn-signout" class="btn-secondary">Sign out</button>
      <p class="fineprint">Profile last synced: ${new Date(session.expiresAt).toLocaleString()}</p>
    </div>
  `;
}

function sendMessage<T = any>(msg: any): Promise<T> {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}
