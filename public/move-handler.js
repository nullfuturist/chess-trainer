// Move handling and game logic
function captureReviewMove(playerMove) {
    if (!currentReviewMistake) return;
    
    const status = document.getElementById('status');
    const bestMove = currentReviewMistake.best_move;
    
    let isCorrect = false;
    let feedback = '';
    
    if (playerMove === bestMove) {
        feedback = `✓ CORRECT! You found the best move: ${bestMove}. Continue playing the variation.`;
        isCorrect = true;
    } else {
        feedback = `✗ INCORRECT. You played ${playerMove}. The best move was ${bestMove}. Continue exploring.`;
        isCorrect = false;
    }
    
    status.textContent = feedback;
    
    currentReviewMistake.playerMove = playerMove;
    currentReviewMistake.wasCorrect = isCorrect;
    
    updateDifficultyButtons(isCorrect);
    document.getElementById('review-difficulty').style.display = 'block';
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
        
        if (studyMode && currentReviewMistake && !reviewFirstMoveMade) {
            // First move in review - evaluate it and set up for continued play
            const moveNotation = getMoveNotation(selectedSquare, square);
            captureReviewMove(moveNotation);
            reviewFirstMoveMade = true;
        }
        
        if (studyMode) {
            // Always allow moves in study mode
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
    fetch('/api/engine-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen })
    })
    .then(response => response.json())
    .then(result => {
        if (result.move && !result.error) {
            const engineMove = {
                from: result.move.substring(0, 2),
                to: result.move.substring(2, 4),
                promotion: result.move.length > 4 ? result.move.substring(4) : undefined
            };
            
            if (makeStudyMove(engineMove)) {
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

function newGame() {
    studyMode = false;
    currentMistake = null;
    currentReviewMistake = null;
    socket.emit('newGame');
}
