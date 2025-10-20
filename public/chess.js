const socket = io();
let currentGame = {};
let selectedSquare = null;
let flipped = false;
let studyMode = false;
let currentMistake = null;
let currentReviewMistake = null;
let gameHistory = [];
let currentMoveIndex = 0;

const pieceImages = {
    'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg'
};

function createBoard() {
    const board = document.getElementById('chessboard');
    board.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            const actualRow = flipped ? row : 7 - row;
            const actualCol = flipped ? 7 - col : col;
            const isLight = (actualRow + actualCol) % 2 === 0;
            
            square.className = `square ${isLight ? 'light' : 'dark'}`;
            square.dataset.square = String.fromCharCode(97 + actualCol) + (actualRow + 1);
            
            const pieceDiv = document.createElement('div');
            pieceDiv.className = 'piece';
            square.appendChild(pieceDiv);
            
            square.addEventListener('click', handleSquareClick);
            board.appendChild(square);
        }
    }
}

function updateBoard(fen) {
    const position = fenToPosition(fen);
    const squares = document.querySelectorAll('.square');
    
    squares.forEach(square => {
        const pieceDiv = square.querySelector('.piece');
        pieceDiv.style.backgroundImage = '';
        square.classList.remove('selected', 'check');
    });
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = position[row][col];
            if (piece) {
                const squareName = String.fromCharCode(97 + col) + (row + 1);
                const squareElement = document.querySelector(`[data-square="${squareName}"]`);
                if (squareElement) {
                    const pieceDiv = squareElement.querySelector('.piece');
                    pieceDiv.style.backgroundImage = `url(${pieceImages[piece]})`;
                }
            }
        }
    }
    
    if (currentGame.check) {
        const kingSquare = findKing(position, currentGame.turn);
        if (kingSquare) {
            const element = document.querySelector(`[data-square="${kingSquare}"]`);
            if (element) element.classList.add('check');
        }
    }
}

function fenToPosition(fen) {
    const position = Array(8).fill().map(() => Array(8).fill(null));
    const piecePlacement = fen.split(' ')[0];
    const ranks = piecePlacement.split('/');
    
    for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
        const rank = ranks[rankIndex];
        let fileIndex = 0;
        
        for (let char of rank) {
            if (isNaN(char)) {
                position[7 - rankIndex][fileIndex] = char;
                fileIndex++;
            } else {
                fileIndex += parseInt(char);
            }
        }
    }
    
    return position;
}

function findKing(position, color) {
    const king = color === 'w' ? 'K' : 'k';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (position[row][col] === king) {
                return String.fromCharCode(97 + col) + (row + 1);
            }
        }
    }
    return null;
}

function handleSquareClick(event) {
    const square = event.currentTarget.dataset.square;
    
    if (selectedSquare === square) {
        event.currentTarget.classList.remove('selected');
        selectedSquare = null;
        return;
    }
    
    if (selectedSquare) {
        const move = {
            from: selectedSquare,
            to: square,
            promotion: 'q'
        };
        
        if (studyMode && currentReviewMistake && !currentReviewMistake.moveEvaluated) {
            // First move in review - evaluate it and continue playing
            const moveNotation = getMoveNotation(selectedSquare, square);
            evaluateFirstReviewMove(moveNotation, move);
        } else if (studyMode) {
            // Continue playing in study mode with engine responses
            if (makeStudyMove(move) && currentGame.turn === 'b' && !currentGame.gameOver) {
                getEngineMove(currentGame.fen);
            }
        } else {
            // Normal game - send to server for engine response
            socket.emit('move', move);
        }
        
        document.querySelector('.selected')?.classList.remove('selected');
        selectedSquare = null;
    } else {
        const pieceDiv = event.currentTarget.querySelector('.piece');
        const hasImage = pieceDiv.style.backgroundImage;
        
        if (hasImage && currentGame.turn === 'w') {
            const isWhitePiece = hasImage.includes('lt45.svg');
            if (isWhitePiece) {
                document.querySelector('.selected')?.classList.remove('selected');
                event.currentTarget.classList.add('selected');
                selectedSquare = square;
            }
        }
    }
}

function getMoveNotation(from, to) {
    try {
        const tempChess = new Chess(currentGame.fen);
        const moveObj = tempChess.move({ from, to, promotion: 'q' });
        return moveObj ? moveObj.san : `${from}${to}`;
    } catch (e) {
        return `${from}${to}`;
    }
}

function evaluateFirstReviewMove(playerMove, move) {
    if (!currentReviewMistake) return;
    
    const status = document.getElementById('status');
    const bestMove = currentReviewMistake.best_move;
    
    // Make the move on the board and continue with engine play
    makeStudyMove(move);
    
    // Evaluate the move
    let isCorrect = false;
    let feedback = '';
    
    if (playerMove === bestMove) {
        feedback = `✓ CORRECT! You found the best move: ${bestMove}`;
        isCorrect = true;
    } else {
        feedback = `✗ INCORRECT. You played ${playerMove}. The best move was ${bestMove}`;
        isCorrect = false;
    }
    
    status.textContent = feedback;
    
    // Store evaluation and show scheduling options
    currentReviewMistake.moveEvaluated = true;
    currentReviewMistake.playerMove = playerMove;
    currentReviewMistake.wasCorrect = isCorrect;
    
    updateDifficultyButtons(isCorrect);
    document.getElementById('review-difficulty').style.display = 'block';
    
    // If it's black's turn after the move, get computer response
    if (currentGame.turn === 'b' && !currentGame.gameOver) {
        getEngineMove(currentGame.fen);
    }
}

function makeStudyMove(move) {
    try {
        const tempChess = new Chess(currentGame.fen);
        const result = tempChess.move(move);
        
        if (result) {
            currentGame.fen = tempChess.fen();
            currentGame.turn = tempChess.turn();
            currentGame.check = tempChess.inCheck();
            currentGame.gameOver = tempChess.isGameOver();
            
            updateBoard(currentGame.fen);
            updateStatus();
            
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

function getEngineMove(fen) {
    // Request engine move from server
    fetch('/api/engine-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen })
    })
    .then(response => response.json())
    .then(result => {
        if (result.move && !result.error) {
            // Make the engine move
            const engineMove = {
                from: result.move.substring(0, 2),
                to: result.move.substring(2, 4),
                promotion: result.move.length > 4 ? result.move.substring(4) : undefined
            };
            
            if (makeStudyMove(engineMove)) {
                // Continue the cycle - if it's white's turn again, wait for user
                // If black's turn, get another engine move (for longer variations)
                if (currentGame.turn === 'b' && !currentGame.gameOver) {
                    setTimeout(() => getEngineMove(currentGame.fen), 500);
                }
            }
        }
    })
    .catch(error => {
        document.getElementById('status').textContent = 'Engine error during study';
    });
}

function updateDifficultyButtons(wasCorrect) {
    const difficultyDiv = document.getElementById('review-difficulty');
    
    if (wasCorrect) {
        difficultyDiv.innerHTML = `
            <p>How confident are you with this pattern?</p>
            <button onclick="submitReview(1, 7)">Very confident (7 days)</button>
            <button onclick="submitReview(2, 3)">Somewhat confident (3 days)</button>
            <button onclick="submitReview(3, 1)">Lucky guess (1 day)</button>
        `;
    } else {
        difficultyDiv.innerHTML = `
            <p>How familiar was this pattern?</p>
            <button onclick="submitReview(1, 3)">I knew it but missed it (3 days)</button>
            <button onclick="submitReview(2, 1)">Somewhat familiar (1 day)</button>
            <button onclick="submitReview(3, 1)">Completely new to me (1 day)</button>
        `;
    }
}

function updateStatus() {
    const status = document.getElementById('status');
    const moves = document.getElementById('moves');
    
    if (currentGame.gameOver) {
        status.textContent = 'Game Over';
    } else {
        const turn = currentGame.turn === 'w' ? 'White' : 'Black';
        const check = currentGame.check ? ' (Check!)' : '';
        status.textContent = `${turn} to move${check}`;
    }
    
    moves.textContent = currentGame.pgn || 'No moves yet';
    moves.scrollTop = moves.scrollHeight;
}

function newGame() {
    studyMode = false;
    currentMistake = null;
    currentReviewMistake = null;
    socket.emit('newGame');
}

function flipBoard() {
    flipped = !flipped;
    createBoard();
    updateBoard(currentGame.fen);
}

function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).style.display = 'block';
    
    if (tabName === 'import') loadImportedGames();
    if (tabName === 'study') loadStudyingGames();
}

function importPGN() {
    const fileInput = document.getElementById('pgn-file');
    const file = fileInput.files[0];
    const status = document.getElementById('import-status');
    
    if (!file) {
        status.className = 'error';
        status.textContent = 'Please select a PGN file';
        return;
    }
    
    status.className = 'success';
    status.textContent = 'Uploading and parsing PGN file...';
    
    const formData = new FormData();
    formData.append('pgnFile', file);
    
    fetch('/api/import-pgn', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            status.className = 'error';
            status.textContent = `Error: ${result.error}`;
        } else {
            status.className = 'success';
            status.textContent = `Imported ${result.imported} lost games out of ${result.total} total games`;
            loadImportedGames();
        }
    })
    .catch(error => {
        status.className = 'error';
        status.textContent = `Error: ${error.message}`;
    });
}

function loadImportedGames() {
    fetch('/api/imported-games')
        .then(response => response.json())
        .then(games => {
            const container = document.getElementById('imported-games');
            container.innerHTML = games.map(game => 
                `<div class="game-item ${game.studying ? 'studying' : ''}" onclick="addToStudy(${game.id})">
                    <strong>${game.headers.White} vs ${game.headers.Black}</strong><br>
                    <small>${game.headers.Date} - ${game.result} - Playing as ${game.my_color}</small>
                    ${game.studying ? '<br><em>Currently studying</em>' : ''}
                </div>`
            ).join('');
        });
}

function addToStudy(gameId) {
    const status = document.getElementById('import-status');
    status.className = 'success';
    status.textContent = 'Analyzing game... This may take a few minutes.';
    
    fetch(`/api/study-game/${gameId}`, { method: 'POST' })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                status.className = 'error';
                status.textContent = `Error: ${result.error}`;
            } else {
                status.className = 'success';
                status.textContent = `Analysis complete! Found ${result.mistakes} mistakes to study.`;
                loadImportedGames();
            }
        })
        .catch(error => {
            status.className = 'error';
            status.textContent = `Error: ${error.message}`;
        });
}

function loadStudyingGames() {
    fetch('/api/studying-games')
        .then(response => response.json())
        .then(games => {
            const container = document.getElementById('studying-games');
            container.innerHTML = games.map(game => 
                `<div class="game-item" onclick="viewMistakes(${game.id})">
                    <strong>${game.headers.White} vs ${game.headers.Black}</strong><br>
                    <small>${game.headers.Date} - ${game.mistake_count} mistakes found</small>
                </div>`
            ).join('');
        });
}

function viewMistakes(gameId) {
    fetch(`/api/mistakes/${gameId}`)
        .then(response => response.json())
        .then(mistakes => {
            const container = document.getElementById('mistakes-list');
            container.innerHTML = mistakes.map((mistake, index) => 
                `<div class="mistake-item" onclick="loadMistakePosition(${mistake.id}, '${mistake.position_fen}')">
                    <div class="mistake-type ${mistake.mistake_type}">${mistake.mistake_type.toUpperCase()}</div>
                    <div>Move ${mistake.move_number}: Played ${mistake.played_move}, best was ${mistake.best_move || 'unknown'}</div>
                    <div><small>${mistake.analysis}</small></div>
                </div>`
            ).join('');
            
            document.getElementById('mistake-viewer').style.display = 'block';
        });
}

function loadMistakePosition(mistakeId, fen) {
    currentMistake = mistakeId;
    studyMode = true;
    
    // Load the full game for navigation
    fetch(`/api/game-pgn/${mistakeId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(gameData => {
            if (gameData.pgn) {
                loadGameForStudy(gameData.pgn, fen);
            } else {
                loadFallbackPosition(fen);
            }
        })
        .catch(error => {
            loadFallbackPosition(fen);
        });
    
    document.getElementById('study-mistake-btn').style.display = 'block';
    document.getElementById('study-mistake-btn').onclick = () => studyMistake(mistakeId);
    document.getElementById('game-navigator').style.display = 'block';
}

function loadFallbackPosition(fen) {
    gameHistory = [{
        fen: fen,
        move: null,
        san: 'Mistake Position',
        moveNumber: 0
    }];
    
    currentMoveIndex = 0;
    
    currentGame = {
        fen: fen,
        pgn: '',
        gameOver: false,
        check: false,
        turn: fen.split(' ')[1]
    };
    
    updateBoard(fen);
    updateStatus();
    
    document.getElementById('move-info').textContent = 'Mistake Position (navigation unavailable)';
}

function loadGameForStudy(pgn, targetFen) {
    gameHistory = [];
    
    if (typeof Chess === 'undefined') {
        setTimeout(() => loadGameForStudy(pgn, targetFen), 100);
        return;
    }
    
    const chess = new Chess();
    
    gameHistory.push({
        fen: chess.fen(),
        move: null,
        san: 'Start',
        moveNumber: 0
    });
    
    const cleanPgn = pgn.replace(/\d+\./g, '').replace(/1-0|0-1|1\/2-1\/2|\*/g, '').trim();
    const moves = cleanPgn.split(/\s+/).filter(move => {
        const cleaned = move.trim();
        return cleaned && !cleaned.match(/^[0-9-]+$/) && cleaned !== '';
    });
    
    let moveNumber = 1;
    let isWhiteTurn = true;
    
    for (let i = 0; i < moves.length; i++) {
        const moveStr = moves[i];
        if (!moveStr) continue;
        
        const cleanMove = moveStr.replace(/[+#?!]+$/, '').trim();
        if (!cleanMove) continue;
        
        try {
            const moveObj = chess.move(cleanMove);
            if (moveObj) {
                gameHistory.push({
                    fen: chess.fen(),
                    move: moveObj,
                    san: moveObj.san,
                    moveNumber: isWhiteTurn ? moveNumber : moveNumber,
                    color: isWhiteTurn ? 'white' : 'black'
                });
                
                if (!isWhiteTurn) moveNumber++;
                isWhiteTurn = !isWhiteTurn;
            } else {
                break;
            }
        } catch (e) {
            break;
        }
    }
    
    currentMoveIndex = 0;
    if (targetFen) {
        const targetIndex = gameHistory.findIndex(pos => pos.fen === targetFen);
        if (targetIndex !== -1) {
            currentMoveIndex = targetIndex;
        }
    }
    
    updateGamePosition();
}

function updateGamePosition() {
    if (gameHistory.length === 0) return;
    
    const position = gameHistory[currentMoveIndex];
    
    currentGame = {
        fen: position.fen,
        pgn: '',
        gameOver: false,
        check: false,
        turn: position.fen.split(' ')[1]
    };
    
    updateBoard(position.fen);
    updateStatus();
    
    const moveInfo = position.moveNumber ? 
        `${position.moveNumber}${position.color === 'white' ? '.' : '...'} ${position.san}` : 
        position.san;
    
    document.getElementById('move-info').textContent = 
        `${moveInfo} (${currentMoveIndex + 1}/${gameHistory.length})`;
}

function goToStart() {
    currentMoveIndex = 0;
    updateGamePosition();
}

function previousMove() {
    if (currentMoveIndex > 0) {
        currentMoveIndex--;
        updateGamePosition();
    }
}

function nextMove() {
    if (currentMoveIndex < gameHistory.length - 1) {
        currentMoveIndex++;
        updateGamePosition();
    }
}

function goToEnd() {
    currentMoveIndex = gameHistory.length - 1;
    updateGamePosition();
}

function studyMistake(mistakeId) {
    const status = document.getElementById('import-status');
    status.className = 'success';
    status.textContent = 'Adding mistake to review queue (available immediately)...';
    
    fetch(`/api/review-result/${mistakeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        status.className = 'success';
        status.textContent = 'Mistake added to review queue! Check the Review tab.';
    })
    .catch(error => {
        status.className = 'error';
        status.textContent = `Error adding to review: ${error.message}`;
    });
}

function loadReview() {
    const content = document.getElementById('review-content');
    content.innerHTML = '<p>Loading reviews...</p>';
    
    fetch('/api/review-due')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(mistake => {
            if (!mistake) {
                content.innerHTML = '<p>No reviews due today! Check back tomorrow.</p>';
                return;
            }
            
            currentReviewMistake = mistake;
            currentReviewMistake.moveEvaluated = false;
            studyMode = true;
            selectedSquare = null;
            
            currentGame = {
                fen: mistake.position_fen,
                pgn: '',
                gameOver: false,
                check: false,
                turn: mistake.position_fen.split(' ')[1]
            };
            
            createBoard();
            updateBoard(mistake.position_fen);
            
            const statusMsg = `Review: Find the best move in this position. (You originally played ${mistake.played_move})`;
            document.getElementById('status').textContent = statusMsg;
            
            document.getElementById('review-question').textContent = 
                `Move ${mistake.move_number}: Find the best move. You originally played ${mistake.played_move}.`;
            
            document.getElementById('review-position').style.display = 'block';
            document.getElementById('review-difficulty').style.display = 'none';
            
            showTab('play');
        })
        .catch(error => {
            content.innerHTML = `<p>Error loading reviews: ${error.message}</p>`;
        });
}

function submitReview(difficulty, days) {
    if (!currentReviewMistake) return;
    
    const status = document.getElementById('status');
    const playerMove = currentReviewMistake.playerMove || 'no move';
    
    fetch(`/api/review-result/${currentReviewMistake.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty, playerMove, days })
    })
    .then(response => response.json())
    .then(result => {
        status.textContent = `Review complete! Next review in ${days} days.`;
        
        setTimeout(() => {
            document.getElementById('review-position').style.display = 'none';
            currentReviewMistake = null;
            studyMode = false;
            loadReview();
        }, 2000);
    })
    .catch(error => {
        status.textContent = `Error: ${error.message}`;
    });
}

function loadGames() {
    fetch('/api/games')
        .then(response => response.json())
        .then(games => {
            const container = document.getElementById('games-history');
            container.innerHTML = games.map(game => 
                `<div class="game-item">
                    <strong>${game.result}</strong><br>
                    <small>${new Date(game.created_at).toLocaleString()}</small>
                </div>`
            ).join('');
        });
}

// Socket events
socket.on('gameUpdate', (data) => {
    currentGame = data;
    updateBoard(data.fen);
    updateStatus();
});

socket.on('gameOver', (result) => {
    const status = document.getElementById('status');
    status.textContent = `Game Over: ${result}`;
    loadGames();
});

socket.on('invalidMove', (move) => {
    document.querySelector('.selected')?.classList.remove('selected');
    selectedSquare = null;
});

socket.on('engineError', (message) => {
    const status = document.getElementById('status');
    status.textContent = `Engine Error: ${message}`;
});

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    createBoard();
    newGame();
    loadGames();
    showTab('play');
});
