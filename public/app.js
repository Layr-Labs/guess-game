document.addEventListener('DOMContentLoaded', () => {

    // ===== GAME STATE MANAGEMENT =====
    const GameState = {
        currentStep: 1,
        player: {
            id: null,
            key: null,
            balance: 0,
            isRegistered: false
        },
        currentGame: {
            id: null,
            min: null,
            max: null,
            fee: null,
            deadline: null,
            isActive: false
        },
        ui: {
            isLoading: false,
            lastHint: null
        }
    };

    // ===== ENHANCED LOCAL STORAGE =====
    const Storage = {
        keys: {
            PLAYER_ID: 'retroguess_player_id',
            PLAYER_KEY: 'retroguess_player_key',
            CURRENT_GAME: 'retroguess_current_game',
            GAME_HISTORY: 'retroguess_game_history',
            SETTINGS: 'retroguess_settings'
        },
        
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('Storage error:', error);
                return false;
            }
        },
        
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.error('Storage error:', error);
                return defaultValue;
            }
        },
        
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error('Storage error:', error);
                return false;
            }
        },
        
        clear() {
            try {
                Object.values(this.keys).forEach(key => this.remove(key));
                return true;
            } catch (error) {
                console.error('Storage error:', error);
                return false;
            }
        }
    };

    // ===== VISUAL EFFECTS SYSTEM =====
    const Effects = {
        // Screen shake effect
        screenShake() {
            document.body.classList.add('screen-shake-active');
            setTimeout(() => {
                document.body.classList.remove('screen-shake-active');
            }, 500);
        },
        
        // Show win overlay with confetti
        showWinOverlay(message = 'You guessed the number!') {
            const overlay = document.getElementById('win-overlay');
            const content = overlay.querySelector('p');
            if (content) content.textContent = message;
            overlay.classList.add('show');
            
            this.createConfetti();
            
            // Auto hide after 5 seconds
            setTimeout(() => {
                overlay.classList.remove('show');
            }, 5000);
        },
        
        // Show lose overlay
        showLoseOverlay(message = 'Better luck next time!') {
            const overlay = document.getElementById('lose-overlay');
            const content = overlay.querySelector('p');
            if (content) content.textContent = message;
            overlay.classList.add('show');
            
            // Auto hide after 3 seconds
            setTimeout(() => {
                overlay.classList.remove('show');
            }, 3000);
        },
        
        // Create confetti particles
        createConfetti() {
            const container = document.getElementById('particles-container');
            const colors = ['#ff6b35', '#00d4ff', '#00ff88', '#ffaa00', '#ff3366'];
            
            for (let i = 0; i < 50; i++) {
                const particle = document.createElement('div');
                particle.style.cssText = `
                    position: absolute;
                    width: 10px;
                    height: 10px;
                    background: ${colors[Math.floor(Math.random() * colors.length)]};
                    top: -10px;
                    left: ${Math.random() * 100}%;
                    border-radius: 50%;
                    animation: confettiFall ${2 + Math.random() * 3}s linear forwards;
                    transform: rotate(${Math.random() * 360}deg);
                `;
                
                container.appendChild(particle);
                
                // Remove particle after animation
                setTimeout(() => {
                    if (particle.parentNode) {
                        particle.parentNode.removeChild(particle);
                    }
                }, 5000);
            }
        },
        
        // Show loading overlay
        showLoading(message = 'Loading...') {
            const overlay = document.getElementById('loading-overlay');
            const text = overlay.querySelector('p');
            if (text) text.textContent = message;
            overlay.classList.add('show');
            GameState.ui.isLoading = true;
        },
        
        // Hide loading overlay
        hideLoading() {
            const overlay = document.getElementById('loading-overlay');
            overlay.classList.remove('show');
            GameState.ui.isLoading = false;
        }
    };

    // ===== NOTIFICATION SYSTEM =====
    const Notifications = {
        show(message, type = 'success', duration = 3000) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = `toast ${type}`;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        },
        
        success(message) {
            this.show(message, 'success');
        },
        
        error(message) {
            this.show(message, 'error');
        },
        
        warning(message) {
            this.show(message, 'warning');
        },
        
        info(message) {
            this.show(message, 'info');
        }
    };

    // ===== API COMMUNICATION =====
    const API = {
        async call(endpoint, method = 'GET', body = null, useAuth = false) {
            if (GameState.ui.isLoading) return { error: 'Please wait...' };
            
        const options = {
            method,
                headers: { 'Content-Type': 'application/json' }
        };
            
        if (body) options.body = JSON.stringify(body);
            
            if (useAuth && GameState.player.key) {
                options.headers['Authorization'] = `Bearer ${GameState.player.key}`;
            }
            
            try {
                Effects.showLoading();
            const response = await fetch(endpoint, options);
            const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || `HTTP error! status: ${response.status}`);
                }
                
            return data;
            } catch (error) {
                console.error('API Error:', error);
                return { error: error.message };
            } finally {
                Effects.hideLoading();
            }
        }
    };

    // ===== STEP NAVIGATION SYSTEM =====
    const StepManager = {
        goToStep(stepNumber) {
            // Hide current step
            const currentStep = document.querySelector('.game-step.active');
            if (currentStep) {
                currentStep.classList.remove('active');
            }
            
            // Show target step
            const targetStep = document.getElementById(`step-${stepNumber}`);
            if (targetStep) {
                targetStep.classList.add('active');
                GameState.currentStep = stepNumber;
            }
            
            // Update progress bar
            this.updateProgressBar();
            
            // Auto-focus first input in new step
            setTimeout(() => {
                const firstInput = targetStep.querySelector('input:not([type="hidden"])');
                if (firstInput && !firstInput.value) {
                    firstInput.focus();
                }
            }, 300);
        },
        
        updateProgressBar() {
            const steps = document.querySelectorAll('.progress-step');
            steps.forEach((step, index) => {
                const stepNumber = index + 1;
                step.classList.remove('active', 'completed');
                
                if (stepNumber === GameState.currentStep) {
                    step.classList.add('active');
                } else if (stepNumber < GameState.currentStep) {
                    step.classList.add('completed');
                }
            });
        },
        
        enableNextButton(stepNumber) {
            const nextBtn = document.getElementById(`next-step-${stepNumber}`);
            if (nextBtn) {
                nextBtn.disabled = false;
            }
        },
        
        disableNextButton(stepNumber) {
            const nextBtn = document.getElementById(`next-step-${stepNumber}`);
            if (nextBtn) {
                nextBtn.disabled = true;
            }
        }
    };

    // ===== GAME LOGIC =====
    const Game = {
        async initializePlayer() {
            // Check if player already exists
            const savedPlayerId = Storage.get(Storage.keys.PLAYER_ID);
            const savedPlayerKey = Storage.get(Storage.keys.PLAYER_KEY);
            
            if (savedPlayerId && savedPlayerKey) {
                GameState.player.id = savedPlayerId;
                GameState.player.key = savedPlayerKey;
                GameState.player.isRegistered = true;
                
                // Load balance
                await this.updateBalance();
                
                // Show welcome message
                this.showWelcomeMessage();
                StepManager.enableNextButton(1);
        } else {
                // Show registration form
                this.showRegistrationForm();
            }
        },
        
        showWelcomeMessage() {
            const welcomeMsg = document.getElementById('welcome-message');
            const regForm = document.getElementById('registration-form');
            const playerName = document.getElementById('existing-player-name');
            const currentBalance = document.getElementById('current-balance');
            
            if (welcomeMsg && regForm && playerName) {
                playerName.textContent = GameState.player.id;
                currentBalance.textContent = GameState.player.balance;
                welcomeMsg.classList.add('show');
                regForm.style.display = 'none';
            }
        },
        
        showRegistrationForm() {
            const welcomeMsg = document.getElementById('welcome-message');
            const regForm = document.getElementById('registration-form');
            
            if (welcomeMsg && regForm) {
                welcomeMsg.classList.remove('show');
                regForm.style.display = 'block';
            }
        },
        
        async registerPlayer(playerId) {
            if (!playerId || playerId.trim().length < 3) {
                Notifications.error('Player name must be at least 3 characters long');
                return false;
            }
            
            const result = await API.call('/player/register', 'POST', { playerId: playerId.trim() });
            
            if (result.error) {
                Notifications.error(result.error);
                return false;
            }
            
            // Save player data
            GameState.player.id = playerId.trim();
            GameState.player.key = result.key;
            GameState.player.isRegistered = true;
            
            Storage.set(Storage.keys.PLAYER_ID, GameState.player.id);
            Storage.set(Storage.keys.PLAYER_KEY, GameState.player.key);
            
            Notifications.success(`Welcome ${GameState.player.id}! Registration successful!`);
            this.showWelcomeMessage();
            StepManager.enableNextButton(1);
            
            return true;
        },
        
        async updateBalance() {
            if (!GameState.player.id) return;
            
            // Don't show loading for balance updates
            const options = {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            };
            
            try {
                const response = await fetch(`/wallet/${GameState.player.id}/balance`, options);
                const result = await response.json();
                
                if (!response.ok) {
                    console.error('Balance update error:', result.error);
                    return;
                }
                
                GameState.player.balance = result.balance || 0;
                
                // Update all balance displays
                const balanceElements = document.querySelectorAll('#balance-amount, #current-balance');
                balanceElements.forEach(el => {
                    if (el) el.textContent = GameState.player.balance;
                });
            } catch (error) {
                console.error('Balance update error:', error);
            }
        },
        
        async mintCoins(amount) {
            if (!GameState.player.id) {
                Notifications.error('Please register first');
                return false;
            }
            
            const result = await API.call('/wallet/mint', 'POST', {
                playerId: GameState.player.id,
                amount: parseInt(amount)
            });
            
            if (result.error) {
                Notifications.error(result.error);
                return false;
            }
            
            await this.updateBalance();
            Notifications.success(`Added ${amount} coins to your wallet!`);
            return true;
        },
        
        async createGame(min, max, fee, deadline) {
            const result = await API.call('/game/create', 'POST', {
                min: parseInt(min),
                max: parseInt(max),
                guessFee: parseInt(fee),
                joinDeadlineSeconds: parseInt(deadline)
            });
            
            if (result.error) {
                Notifications.error(result.error);
                return false;
            }
            
            // Save game data
            GameState.currentGame = {
                id: result.gameId,
                min: result.min,
                max: result.max,
                fee: result.guessFee,
                deadline: result.joinDeadline,
                isActive: true
            };
            
            Storage.set(Storage.keys.CURRENT_GAME, GameState.currentGame);
            
            Notifications.success(`Game created! ID: ${result.gameId}`);
            this.setupGameDisplay();
            StepManager.enableNextButton(3);
            
            return true;
        },
        
        setupGameDisplay() {
            const gameId = document.getElementById('current-game-id');
            const gameRange = document.getElementById('game-range');
            const gameCost = document.getElementById('game-cost');
            
            if (gameId) gameId.textContent = GameState.currentGame.id;
            if (gameRange) gameRange.textContent = `${GameState.currentGame.min} to ${GameState.currentGame.max}`;
            if (gameCost) gameCost.textContent = `${GameState.currentGame.fee} coins`;
            
            // Start countdown timer
            this.startGameTimer();
        },
        
        startGameTimer() {
            const timerElement = document.getElementById('time-remaining');
            if (!timerElement || !GameState.currentGame.deadline) return;
            
            const updateTimer = () => {
                const now = Date.now();
                const timeLeft = GameState.currentGame.deadline - now;
                
                if (timeLeft <= 0) {
                    timerElement.textContent = 'EXPIRED';
                    timerElement.style.color = 'var(--accent-danger)';
            return;
        }

                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Change color based on time left
                if (timeLeft < 30000) { // Less than 30 seconds
                    timerElement.style.color = 'var(--accent-danger)';
                } else if (timeLeft < 60000) { // Less than 1 minute
                    timerElement.style.color = 'var(--accent-warning)';
        } else {
                    timerElement.style.color = 'var(--text-secondary)';
                }
            };
            
            updateTimer();
            const interval = setInterval(updateTimer, 1000);
            
            // Clear interval when game ends or page unloads
            window.addEventListener('beforeunload', () => clearInterval(interval));
        },

        async makeGuess(guess) {
            if (!GameState.currentGame.id) {
                Notifications.error('No active game found');
                return false;
            }
            
            if (!GameState.player.id || !GameState.player.key) {
                Notifications.error('Please register first');
                return false;
            }
            
            const guessNumber = parseInt(guess);
            if (isNaN(guessNumber)) {
                Notifications.error('Please enter a valid number');
                return false;
            }
            
            if (guessNumber < GameState.currentGame.min || guessNumber > GameState.currentGame.max) {
                Notifications.error(`Guess must be between ${GameState.currentGame.min} and ${GameState.currentGame.max}`);
                return false;
            }
            
            const result = await API.call(
                `/game/${GameState.currentGame.id}/guess`,
                'POST',
                {
                    playerId: GameState.player.id,
                    guess: guessNumber
                },
                true
            );
            
            if (result.error) {
                Notifications.error(result.error);
                if (result.error.includes('Insufficient funds')) {
                    // Suggest going back to get more coins
                    setTimeout(() => {
                        if (confirm('You need more coins. Go back to get more?')) {
                            StepManager.goToStep(2);
                        }
                    }, 2000);
                }
                return false;
            }
            
            // Update balance after guess
            await this.updateBalance();
            
            if (result.correct) {
                // Player won!
                Effects.showWinOverlay('Congratulations! You guessed correctly!');
                Notifications.success('🎉 YOU WON! 🎉');
                
                // Show play again button
                const playAgainBtn = document.getElementById('play-again-btn');
                if (playAgainBtn) {
                    playAgainBtn.style.display = 'block';
                }
                
                // Clear current game
                GameState.currentGame.isActive = false;
                
            } else {
                // Wrong guess - show hint and effects
                this.displayHint(result.hint);
                
                if (result.hint === 'cold') {
                    Effects.screenShake();
                    Notifications.warning('❄️ Cold! Try a different range');
                } else if (result.hint === 'warm') {
                    Notifications.info('🔥 Warm! You\'re getting closer');
                } else if (result.hint === 'hot') {
                    Notifications.success('🌶️ Hot! Very close now!');
                }
            }
            
            // Clear the guess input
            const guessInput = document.getElementById('player-guess');
            if (guessInput) {
                guessInput.value = '';
                guessInput.focus();
            }
            
            return true;
        },
        
        displayHint(hint) {
            const hintDisplay = document.getElementById('hint-display');
            if (!hintDisplay || !hint) return;
            
            hintDisplay.className = `hint-display hint-${hint}`;
            hintDisplay.textContent = hint.toUpperCase();
            GameState.ui.lastHint = hint;
        },
        
        async checkGameStatus() {
            if (!GameState.currentGame.id) {
                Notifications.error('No active game found');
                return;
            }
            
            const result = await API.call(`/game/${GameState.currentGame.id}/status`);
            
            if (result.error) {
                Notifications.error(result.error);
            return;
        }

            if (result.finalized) {
                if (result.winners && result.winners.length > 0) {
                    if (result.winners.includes(GameState.player.id)) {
                        Effects.showWinOverlay('You were the closest guess!');
                        Notifications.success('🏆 You won by closest guess!');
                    } else {
                        Effects.showLoseOverlay(`Game ended. Winner: ${result.winners.join(', ')}`);
                        Notifications.info(`Game ended. Winner: ${result.winners.join(', ')}`);
                    }
                } else {
                    Effects.showLoseOverlay('Game ended with no winner');
                    Notifications.info('Game ended with no winner');
                }
                
                // Show play again button
                const playAgainBtn = document.getElementById('play-again-btn');
                if (playAgainBtn) {
                    playAgainBtn.style.display = 'block';
                }
                
                GameState.currentGame.isActive = false;
        } else {
                Notifications.info(`Game is still active. ${result.numSubmissions} players have participated.`);
            }
        },
        
        resetForNewGame() {
            GameState.currentGame = {
                id: null,
                min: null,
                max: null,
                fee: null,
                deadline: null,
                isActive: false
            };
            
            Storage.remove(Storage.keys.CURRENT_GAME);
            
            // Hide play again button
            const playAgainBtn = document.getElementById('play-again-btn');
            if (playAgainBtn) {
                playAgainBtn.style.display = 'none';
            }
            
            // Clear hint display
            const hintDisplay = document.getElementById('hint-display');
            if (hintDisplay) {
                hintDisplay.className = 'hint-display';
                hintDisplay.textContent = '';
            }
            
            // Reset step 3 next button
            StepManager.disableNextButton(3);
            
            // Go to step 3
            StepManager.goToStep(3);
        }
    };

    // ===== EVENT LISTENERS =====
    function setupEventListeners() {
        
        // Step 1: Registration
        const registerBtn = document.getElementById('register-btn');
        const playerIdInput = document.getElementById('playerId-register');
        const nextStep1 = document.getElementById('next-step-1');
        
        if (registerBtn && playerIdInput) {
            registerBtn.addEventListener('click', async () => {
                const playerId = playerIdInput.value.trim();
                await Game.registerPlayer(playerId);
            });
            
            playerIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    registerBtn.click();
                }
            });
        }
        
        if (nextStep1) {
            nextStep1.addEventListener('click', () => {
                StepManager.goToStep(2);
                Game.updateBalance();
            });
        }
        
        // Step 2: Funds
        const mintBtn = document.getElementById('mint-btn');
        const mintAmountInput = document.getElementById('mint-amount');
        const prevStep2 = document.getElementById('prev-step-2');
        const nextStep2 = document.getElementById('next-step-2');
        
        if (mintBtn && mintAmountInput) {
            mintBtn.addEventListener('click', async () => {
                const amount = mintAmountInput.value;
                if (amount && amount > 0) {
                    await Game.mintCoins(amount);
                }
            });
            
            mintAmountInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    mintBtn.click();
                }
            });
        }
        
        if (prevStep2) {
            prevStep2.addEventListener('click', () => StepManager.goToStep(1));
        }
        
        if (nextStep2) {
            nextStep2.addEventListener('click', () => StepManager.goToStep(3));
        }
        
        // Step 3: Game Setup
        const createModeBtn = document.getElementById('create-mode-btn');
        const joinModeBtn = document.getElementById('join-mode-btn');
        const createGameConfig = document.getElementById('create-game-config');
        const joinGameConfig = document.getElementById('join-game-config');
        const createGameBtn = document.getElementById('create-game-btn');
        const prevStep3 = document.getElementById('prev-step-3');
        const nextStep3 = document.getElementById('next-step-3');
        
        if (createModeBtn && joinModeBtn) {
            createModeBtn.addEventListener('click', () => {
                createModeBtn.classList.add('active');
                joinModeBtn.classList.remove('active');
                if (createGameConfig) createGameConfig.style.display = 'block';
                if (joinGameConfig) joinGameConfig.style.display = 'none';
            });
            
            joinModeBtn.addEventListener('click', () => {
                joinModeBtn.classList.add('active');
                createModeBtn.classList.remove('active');
                if (joinGameConfig) joinGameConfig.style.display = 'block';
                if (createGameConfig) createGameConfig.style.display = 'none';
            });
        }
        
        if (createGameBtn) {
            createGameBtn.addEventListener('click', async () => {
                const min = document.getElementById('game-min').value;
                const max = document.getElementById('game-max').value;
                const fee = document.getElementById('game-fee').value;
                const deadline = document.getElementById('game-deadline').value;
                
                await Game.createGame(min, max, fee, deadline);
            });
        }
        
        if (prevStep3) {
            prevStep3.addEventListener('click', () => StepManager.goToStep(2));
        }
        
        if (nextStep3) {
            nextStep3.addEventListener('click', () => StepManager.goToStep(4));
        }
        
        // Step 4: Play Game
        const guessBtn = document.getElementById('guess-btn');
        const guessInput = document.getElementById('player-guess');
        const checkStatusBtn = document.getElementById('check-status-btn');
        const prevStep4 = document.getElementById('prev-step-4');
        const playAgainBtn = document.getElementById('play-again-btn');
        
        if (guessBtn && guessInput) {
            guessBtn.addEventListener('click', async () => {
                const guess = guessInput.value;
                await Game.makeGuess(guess);
            });
            
            guessInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    guessBtn.click();
                }
            });
        }
        
        if (checkStatusBtn) {
            checkStatusBtn.addEventListener('click', () => Game.checkGameStatus());
        }
        
        if (prevStep4) {
            prevStep4.addEventListener('click', () => Game.resetForNewGame());
        }
        
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => Game.resetForNewGame());
        }
        
        // Progress bar step navigation
        const progressSteps = document.querySelectorAll('.progress-step');
        progressSteps.forEach((step, index) => {
            step.addEventListener('click', () => {
                const stepNumber = index + 1;
                if (stepNumber <= GameState.currentStep || 
                    (stepNumber === 2 && GameState.player.isRegistered)) {
                    StepManager.goToStep(stepNumber);
                }
            });
        });
        
        // Close overlays on click
        const winOverlay = document.getElementById('win-overlay');
        const loseOverlay = document.getElementById('lose-overlay');
        
        if (winOverlay) {
            winOverlay.addEventListener('click', (e) => {
                if (e.target === winOverlay) {
                    winOverlay.classList.remove('show');
                }
            });
        }
        
        if (loseOverlay) {
            loseOverlay.addEventListener('click', (e) => {
                if (e.target === loseOverlay) {
                    loseOverlay.classList.remove('show');
                }
            });
        }
    }

    // ===== INITIALIZATION =====
    function init() {
        console.log('🎮 RetroGuess Game Initializing...');
        
        // Setup event listeners
        setupEventListeners();
        
        // Initialize player state
        Game.initializePlayer();
        
        // Check for existing game
        const savedGame = Storage.get(Storage.keys.CURRENT_GAME);
        if (savedGame && savedGame.id) {
            GameState.currentGame = savedGame;
            Game.setupGameDisplay();
        }
        
        // Update progress bar
        StepManager.updateProgressBar();
        
        console.log('🎮 RetroGuess Game Ready!');
        Notifications.success('Welcome to RetroGuess!');
    }

    // ===== ADD CONFETTI ANIMATION TO CSS =====
    const style = document.createElement('style');
    style.textContent = `
        @keyframes confettiFall {
            0% {
                transform: translateY(-100vh) rotate(0deg);
                opacity: 1;
            }
            100% {
                transform: translateY(100vh) rotate(360deg);
                opacity: 0;
            }
        }
        
        .toast.success {
            background: linear-gradient(135deg, var(--accent-success), #00cc7a);
        }
        
        .toast.error {
            background: linear-gradient(135deg, var(--accent-danger), #cc2244);
        }
        
        .toast.warning {
            background: linear-gradient(135deg, var(--accent-warning), #cc8800);
        }
        
        .toast.info {
            background: linear-gradient(135deg, var(--accent-secondary), #0099cc);
        }
    `;
    document.head.appendChild(style);

    // Start the game!
    init();
});
