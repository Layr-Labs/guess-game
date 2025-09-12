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
            const gidGlobal = document.getElementById('global-game-id');
            if (idWallet) idWallet.value = savedId;
            if (idGuess) idGuess.value = savedId;
            if (gidGlobal && !gidGlobal.value) gidGlobal.value = storage.get('gameId') || '';
        }
        if (savedKey) {
            const keyGuess = document.getElementById('player-key-guess');
            const keyCoord = document.getElementById('my-player-key');
            const keyGlobal = document.getElementById('global-secret-key');
            if (keyGuess) keyGuess.value = savedKey;
            if (keyCoord) keyCoord.value = savedKey;
            if (keyGlobal) keyGlobal.value = savedKey;
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

        // Clear previous content and classes
        el.className = 'result-display';
        el.textContent = '';

        if (data.error) {
            el.classList.add('error');
            el.textContent = `❌ ${data.error}`;
            return;
        }

        // Handle different response types
        if (Array.isArray(data.players)) {
            el.innerHTML = `<strong>👥 Registered Players:</strong><br/>${data.players.length > 0 ? data.players.join(', ') : 'No players registered yet'}`;
        } else if (Array.isArray(data.activities)) {
            renderActivities(elementId, data.activities);
        } else if (Array.isArray(data.pendingDeals)) {
            renderPendingDeals(elementId, data.pendingDeals);
        } else if (data.gameId && data.joinDeadline) {
            renderGameInfo(elementId, data);
        } else if (data.correct !== undefined) {
            renderGuessResult(elementId, data);
        } else if (Array.isArray(data.winners) || typeof data.finalized === 'boolean') {
            renderGameStatus(elementId, data);
        } else if (data.balance !== undefined) {
            el.innerHTML = `💰 <strong>Balance:</strong> ${data.balance} coins`;
        } else if (data.key) {
            el.innerHTML = `🔑 <strong>Secret Key:</strong> <code>${data.key}</code><br/><small style="color: #e74c3c;">⚠️ Save this key securely!</small>`;
        } else if (data.status) {
            el.classList.add('success');
            el.textContent = `✅ ${data.status}`;
        } else {
            el.textContent = JSON.stringify(data, null, 2);
        }
    }

    function renderGuessResult(elementId, data) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (data.correct) {
            el.innerHTML = `🎉 Correct! ${data.message || ''} ${data.prize ? `Prize: ${data.prize} coins` : ''}`;
            showToast('You won!');
        } else {
            const hintClass = data.hint ? `hint-${data.hint}` : '';
            el.innerHTML = `❌ Incorrect guess. <span class="hint-display ${hintClass}">${(data.hint || 'NO HINT').toUpperCase()}</span>`;
        }
    }

    function renderActivities(elementId, activities) {
        const el = document.getElementById(elementId);
        if (!el) return;

        if (!activities || activities.length === 0) {
            el.textContent = 'No player activities found for this game.';
            return;
        }

        el.innerHTML = `<strong>🔥 Player Hints:</strong><br/>`;
        activities.forEach(activity => {
            const hintClass = activity.hint ? `hint-${activity.hint}` : '';
            const guessText = (activity.guess !== undefined) ? ` <span style="color:#8e44ad">(guess: ${activity.guess})</span>` : '';
            el.innerHTML += `• ${activity.playerId}: <span class="hint-display ${hintClass}">${activity.hint.toUpperCase()}</span>${guessText}<br/>`;
        });
    }

    function renderPendingDeals(elementId, deals) {
        const el = document.getElementById(elementId);
        if (!el) return;

        if (!deals || deals.length === 0) {
            el.textContent = 'No pending deals.';
            return;
        }

        el.innerHTML = `<strong>📨 Pending Deal Proposals:</strong><br/>`;
        deals.forEach(deal => {
            el.innerHTML += `
                <div class="deal-card">
                    <div><strong>From:</strong> ${deal.senderId}</div>
                    <div><strong>Game:</strong> ${deal.gameId}</div>
                    <div><strong>Message:</strong> ${deal.message}</div>
                    <div><strong>Pot Share:</strong> ${deal.potSharePercent}%</div>
                    <button onclick="acceptDeal('${deal.dealId}')">
                        ✅ Accept Deal
                    </button>
                </div>
            `;
        });
    }

    // Global function for accepting deals from the deal display
    window.acceptDeal = function(dealId) {
        document.getElementById('respond-deal-id').value = dealId;
        document.getElementById('accept-deal-btn').click();
    };

    function renderGameInfo(elementId, data) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const fee = (data.guessFee ?? 0);
        el.innerHTML = `
            🎮 <strong>Game Created Successfully!</strong><br/>
            🆔 <strong>ID:</strong> <code>${data.gameId}</code><br/>
            ⏰ <strong>Deadline:</strong> ${new Date(data.joinDeadline).toLocaleString()}<br/>
            💰 <strong>Guess Fee:</strong> ${fee} coins
        `;
        el.classList.add('success');

        // Auto-fill game IDs in other sections
        const gidGlobal = document.getElementById('global-game-id');
        const gidStatus = document.getElementById('game-id-status');
        const gidActivities = document.getElementById('game-id-activities');
        if (gidGlobal) gidGlobal.value = data.gameId;
        if (gidStatus) gidStatus.value = data.gameId;
        if (gidActivities) gidActivities.value = data.gameId;
    }

    function renderGameStatus(elementId, data) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const isFinalized = !!data.finalized;
        const winners = (data.winners || []).join(', ');

        el.innerHTML = `
            📊 <strong>Game Status</strong><br/>
            🆔 <strong>ID:</strong> <code>${data.gameId}</code><br/>
            📈 <strong>Status:</strong> ${isFinalized ? '🏆 Finalized' : '⏳ Active'}<br/>
            👥 <strong>Participants:</strong> ${data.numSubmissions}<br/>
            🎯 <strong>Range:</strong> ${data.min} - ${data.max}<br/>
            ⏰ <strong>Deadline:</strong> ${new Date(data.joinDeadline).toLocaleString()}<br/>
            ${isFinalized && winners ? ('🏆 <strong>Winners:</strong> ' + winners) : ''}
        `;

        if (isFinalized) {
            el.classList.add('success');
        }
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
        // Priority: localStorage -> visible inputs -> rendered code tag -> JSON fallback
        let key = storage.get('playerKey');

        if (!key) {
            const keyGuess = document.getElementById('player-key-guess');
            const keyCoord = document.getElementById('my-player-key');
            key = (keyGuess && keyGuess.value) || (keyCoord && keyCoord.value) || '';
        }

        if (!key) {
            const display = document.getElementById('player-key-display');
            const code = display ? display.querySelector('code') : null;
            if (code && code.textContent) key = code.textContent.trim();
        }

        if (!key) {
            // Fallback to old JSON structure if present
            try {
                const display = document.getElementById('player-key-display');
                const payload = JSON.parse((display && display.textContent) || '{}');
                if (payload && payload.key) key = payload.key;
            } catch {}
        }

        if (key) {
            try {
                await navigator.clipboard.writeText(key);
                showToast('Key copied to clipboard');
            } catch {
                showToast('Copy failed');
            }
        } else {
            showToast('No key found to copy');
        }
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
        if (key) {
            document.getElementById('player-key-guess').value = key;
            const keyGlobal = document.getElementById('global-secret-key');
            if (keyGlobal) keyGlobal.value = key;
        }
        showToast('Credentials filled');
    });

    document.getElementById('guess-btn').addEventListener('click', async () => {
        const gameId = document.getElementById('global-game-id').value;
        const playerId = document.getElementById('playerId-guess').value;
        storage.set('playerId', playerId);
        storage.set('gameId', gameId);
        const guess = parseInt(document.getElementById('player-guess').value, 10);
        const key = document.getElementById('global-secret-key').value || document.getElementById('player-key-guess').value;
        const result = await apiCall(`/game/${gameId}/guess`, 'POST', { playerId, guess }, key);
        displayResult('guess-result-display', result);
    });

    // --- Status ---
    document.getElementById('status-btn').addEventListener('click', async () => {
        const gameId = document.getElementById('global-game-id').value;
        storage.set('gameId', gameId);
        const result = await apiCall(`/game/${gameId}/status`);
        displayResult('status-display', result);
    });

    // --- Coordination ---
    document.getElementById('use-saved-key-coord-btn').addEventListener('click', () => {
        const key = document.getElementById('global-secret-key').value || storage.get('playerKey');
        if (key) document.getElementById('my-player-key').value = key;
        showToast('Saved key filled');
    });

    document.getElementById('list-players-btn').addEventListener('click', async () => {
        const result = await apiCall('/coordination/players');
        displayResult('players-display', result);
    });

    document.getElementById('load-activities-btn').addEventListener('click', async () => {
        const gameId = document.getElementById('global-game-id').value;
        storage.set('gameId', gameId);
        const key = document.getElementById('global-secret-key').value || storage.get('playerKey');
        const result = await apiCall(`/coordination/${gameId}/activities`, 'GET', null, key);
        displayResult('activities-display', result);
    });

    document.getElementById('propose-deal-btn').addEventListener('click', async () => {
        const recipientId = document.getElementById('deal-recipient-id').value;
        const gameId = document.getElementById('global-game-id').value;
        const potSharePercent = parseInt(document.getElementById('deal-pot-share').value, 10) || 50;
        const key = document.getElementById('global-secret-key').value || document.getElementById('my-player-key').value;
        const result = await apiCall('/coordination/auto-propose', 'POST', { recipientId, potSharePercent, gameId }, key);
        displayResult('proposal-result-display', result);
    });

    document.getElementById('accept-deal-btn').addEventListener('click', async () => {
        const dealId = document.getElementById('respond-deal-id').value;
        const key = document.getElementById('global-secret-key').value || document.getElementById('my-player-key').value;
        const result = await apiCall('/coordination/accept', 'POST', { dealId }, key);
        displayResult('response-display', result);
        // Refresh pending deals after accepting
        if (!result.error) {
            setTimeout(fetchPendingDeals, 500);
        }
    });

    // --- Pending Deals Fetching ---
    let autoFetchInterval = null;

    document.getElementById('fetch-deals-btn').addEventListener('click', fetchPendingDeals);

    document.getElementById('start-auto-fetch-btn').addEventListener('click', () => {
        if (autoFetchInterval) return;

        autoFetchInterval = setInterval(fetchPendingDeals, 5000);
        document.getElementById('start-auto-fetch-btn').style.display = 'none';
        document.getElementById('stop-auto-fetch-btn').style.display = 'inline-block';
        showToast('Auto-fetch started (every 5 seconds)');
        fetchPendingDeals(); // Initial fetch
    });

    document.getElementById('stop-auto-fetch-btn').addEventListener('click', () => {
        if (autoFetchInterval) {
            clearInterval(autoFetchInterval);
            autoFetchInterval = null;
        }
        document.getElementById('start-auto-fetch-btn').style.display = 'inline-block';
        document.getElementById('stop-auto-fetch-btn').style.display = 'none';
        showToast('Auto-fetch stopped');
    });

    async function fetchPendingDeals() {
        const keyGlobal = document.getElementById('global-secret-key');
        const keyField = document.getElementById('my-player-key');
        const key = (keyGlobal && keyGlobal.value) || (keyField && keyField.value) || storage.get('playerKey');
        if (!key) {
            displayResult('pending-deals-display', { error: 'No authentication key found. Please register first.' });
            return;
        }

        const result = await apiCall('/coordination/pending-deals', 'GET', null, key);
        if (result.pendingDeals !== undefined) {
            renderPendingDeals('pending-deals-display', result.pendingDeals);
        } else {
            displayResult('pending-deals-display', result);
        }
    }

});
