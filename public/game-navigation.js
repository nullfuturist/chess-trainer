// Game navigation and position loading
function loadMistakePosition(mistakeId, fen) {
    currentMistake = mistakeId;
    studyMode = true;
    
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
