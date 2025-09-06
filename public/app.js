document.addEventListener('DOMContentLoaded', () => {

    // --- Local storage helpers ---
    const storage = {
        set(k, v) { try { localStorage.setItem(k, v); } catch {} },
        get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    };

    function showToast(text) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = text;
        t.style.display = 'block';
        setTimeout(() => { t.style.display = 'none'; }, 1800);
    }

    // Pre-fill saved values
    (function preload() {
        const savedId = storage.get('playerId');
        const savedKey = storage.get('playerKey');
        if (savedId) {
            const idWallet = document.getElementById('playerId-wallet');
            const idGuess = document.getElementById('playerId-guess');
            if (idWallet) idWallet.value = savedId;
            if (idGuess) idGuess.value = savedId;
        }
        if (savedKey) {
            const keyGuess = document.getElementById('player-key-guess');
            const keyCoord = document.getElementById('my-player-key');
            if (keyGuess) keyGuess.value = savedKey;
            if (keyCoord) keyCoord.value = savedKey;
        }
    })();

    // --- Helper Functions ---
    async function apiCall(endpoint, method = 'GET', body = null, keyOverride = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) options.body = JSON.stringify(body);
        let key;
        if (keyOverride) key = keyOverride;
        else if (endpoint.includes('/guess')) key = document.getElementById('player-key-guess').value;
        if (key) options.headers['Authorization'] = `Bearer ${key}`;
        try {
            const response = await fetch(endpoint, options);
            const data = await response.json();
            if (!response.ok) return { error: data.error || `HTTP error! status: ${response.status}` };
            return data;
        } catch (error) { return { error: error.message }; }
    }

    function displayResult(elementId, data) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (data.error) { el.textContent = `Error: ${data.error}`; return; }
        // Special renderers
        if (data.proposals) { return renderProposals(elementId, data.proposals); }
        if (data.gameId && data.joinDeadline) { return renderGameInfo(elementId, data); }
        if (Array.isArray(data.winners) || typeof data.finalized === 'boolean') { return renderGameStatus(elementId, data); }
        if (data.correct !== undefined) { return renderGuessResult(elementId, data); }
        el.textContent = JSON.stringify(data, null, 2);
    }

    function renderGuessResult(elementId, data) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (data.correct) {
            el.innerHTML = `Correct! ${data.message || ''} Prize: ${data.prize || 0}`;
            showToast('You won!');
        } else {
            const hintClass = data.hint ? `hint-${data.hint}` : '';
            el.innerHTML = `Incorrect guess. <span class="hint-display ${hintClass}">${(data.hint || '').toUpperCase()}</span>`;
        }
    }

    function renderProposals(elementId, proposals) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (!proposals || proposals.length === 0) { el.textContent = 'No pending proposals.'; return; }
        let html = '';
        proposals.forEach(deal => {
            const statusClass = `status-${deal.status}`;
            html += `
                <div class="deal-card">
                    <div class="deal-header">
                        <strong>From: ${deal.senderId}</strong>
                        <span class="status-badge ${statusClass}">${deal.status}</span>
                    </div>
                    <div class="deal-message">"${deal.message}"</div>
                    <small>Deal ID: <code>${deal.dealId}</code></small><br/>
                    <small>${new Date(deal.timestamp).toLocaleString()}</small>
                </div>
            `;
        });
        el.innerHTML = html;
    }

    function renderGameInfo(elementId, data) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = `Game Created!<br/>ID: <code>${data.gameId}</code><br/>Deadline: ${new Date(data.joinDeadline).toLocaleString()}<br/>Guess Fee: ${data.guessFee}`;
        // Save last game id to convenience fields
        const gidGuess = document.getElementById('game-id-guess');
        const gidStatus = document.getElementById('game-id-status');
        if (gidGuess) gidGuess.value = data.gameId;
        if (gidStatus) gidStatus.value = data.gameId;
    }

    function renderGameStatus(elementId, data) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const isFinalized = !!data.finalized;
        const winners = (data.winners || []).join(', ');
        el.innerHTML = `
            Game ID: <code>${data.gameId}</code><br/>
            Status: ${isFinalized ? 'Finalized' : 'Active'}<br/>
            Participants: ${data.numSubmissions}<br/>
            Range: ${data.min} - ${data.max}<br/>
            Deadline: ${new Date(data.joinDeadline).toLocaleString()}<br/>
            ${isFinalized && winners ? ('Winners: ' + winners) : ''}
        `;
    }

    // --- Registration ---
    document.getElementById('register-btn').addEventListener('click', async () => {
        const playerId = document.getElementById('playerId-register').value;
        const result = await apiCall('/player/register', 'POST', { playerId });
        displayResult('player-key-display', result);
        if (!result.error && result.key) {
            storage.set('playerId', playerId);
            storage.set('playerKey', result.key);
            showToast('Registration successful. Key saved locally.');
        }
    });

    document.getElementById('copy-key-btn').addEventListener('click', async () => {
        const display = document.getElementById('player-key-display');
        try {
            const payload = JSON.parse(display.textContent || '{}');
            if (payload.key) {
                await navigator.clipboard.writeText(payload.key);
                showToast('Key copied to clipboard');
            }
        } catch { showToast('Nothing to copy'); }
    });

    // --- Wallet ---
    document.getElementById('balance-btn').addEventListener('click', async () => {
        const playerId = document.getElementById('playerId-wallet').value;
        storage.set('playerId', playerId);
        const result = await apiCall(`/wallet/${playerId}/balance`);
        displayResult('balance-display', result);
    });

    document.getElementById('mint-btn').addEventListener('click', async () => {
        const playerId = document.getElementById('playerId-wallet').value;
        const amount = parseInt(document.getElementById('mint-amount').value, 10);
        const result = await apiCall('/wallet/mint', 'POST', { playerId, amount });
        displayResult('balance-display', result);
    });

    // --- Game Creation ---
    document.getElementById('create-game-btn').addEventListener('click', async () => {
        const min = parseInt(document.getElementById('game-min').value, 10);
        const max = parseInt(document.getElementById('game-max').value, 10);
        const guessFee = parseInt(document.getElementById('game-fee').value, 10);
        const joinDeadlineSeconds = parseInt(document.getElementById('game-deadline').value, 10);
        const result = await apiCall('/game/create', 'POST', { min, max, guessFee, joinDeadlineSeconds });
        displayResult('game-info-display', result);
    });

    // --- Guessing ---
    document.getElementById('use-saved-creds-btn').addEventListener('click', () => {
        const id = storage.get('playerId');
        const key = storage.get('playerKey');
        if (id) document.getElementById('playerId-guess').value = id;
        if (key) document.getElementById('player-key-guess').value = key;
        showToast('Credentials filled');
    });

    document.getElementById('guess-btn').addEventListener('click', async () => {
        const gameId = document.getElementById('game-id-guess').value;
        const playerId = document.getElementById('playerId-guess').value;
        storage.set('playerId', playerId);
        const guess = parseInt(document.getElementById('player-guess').value, 10);
        const result = await apiCall(`/game/${gameId}/guess`, 'POST', { playerId, guess });
        displayResult('guess-result-display', result);
    });

    // --- Status ---
    document.getElementById('status-btn').addEventListener('click', async () => {
        const gameId = document.getElementById('game-id-status').value;
        const result = await apiCall(`/game/${gameId}/status`);
        displayResult('status-display', result);
    });

    // --- Coordination ---
    document.getElementById('use-saved-key-coord-btn').addEventListener('click', () => {
        const key = storage.get('playerKey');
        if (key) document.getElementById('my-player-key').value = key;
        showToast('Saved key filled');
    });

    document.getElementById('propose-deal-btn').addEventListener('click', async () => {
        const recipientId = document.getElementById('deal-recipient-id').value;
        const message = document.getElementById('deal-message').value || 'do you want warm or cold or hot number for 10% pot share?';
        const key = document.getElementById('my-player-key').value;
        const result = await apiCall('/coordination/propose', 'POST', { recipientId, message }, key);
        displayResult('proposal-result-display', result);
    });

    document.getElementById('check-proposals-btn').addEventListener('click', async () => {
        const key = document.getElementById('my-player-key').value;
        const result = await apiCall('/coordination/proposals', 'GET', null, key);
        displayResult('proposals-display', result);
    });

    document.getElementById('accept-deal-btn').addEventListener('click', async () => {
        const dealId = document.getElementById('respond-deal-id').value;
        const key = document.getElementById('my-player-key').value;
        const result = await apiCall('/coordination/respond', 'POST', { dealId, response: 'accept' }, key);
        displayResult('response-display', result);
    });

    document.getElementById('reject-deal-btn').addEventListener('click', async () => {
        const dealId = document.getElementById('respond-deal-id').value;
        const key = document.getElementById('my-player-key').value;
        const result = await apiCall('/coordination/respond', 'POST', { dealId, response: 'reject' }, key);
        displayResult('response-display', result);
    });

});
