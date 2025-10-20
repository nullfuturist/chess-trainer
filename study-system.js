// Study system and review functionality
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

function resetToReviewPosition() {
    if (!reviewStartPosition) return;
    
    currentGame = {
        fen: reviewStartPosition,
        pgn: '',
        gameOver: false,
        check: false,
        turn: reviewStartPosition.split(' ')[1]
    };
    
    reviewFirstMoveMade = false;
    updateBoard(reviewStartPosition);
    updateStatus();
    
    const status = document.getElementById('status');
    status.textContent = `Review: Find the best move in this position. (You originally played ${currentReviewMistake.played_move})`;
}

function updateDifficultyButtons(wasCorrect) {
    const difficultyDiv = document.getElementById('review-difficulty');
    
    if (wasCorrect) {
        difficultyDiv.innerHTML = `
            <p>How confident are you with this pattern?</p>
            <button onclick="submitReview(1, 7)">Very confident (7 days)</button>
            <button onclick="submitReview(2, 3)">Somewhat confident (3 days)</button>
            <button onclick="submitReview(3, 1)">Lucky guess (1 day)</button>
            <button onclick="resetToReviewPosition()">Try Again</button>
        `;
    } else {
        difficultyDiv.innerHTML = `
            <p>How familiar was this pattern?</p>
            <button onclick="submitReview(1, 3)">I knew it but missed it (3 days)</button>
            <button onclick="submitReview(2, 1)">Somewhat familiar (1 day)</button>
            <button onclick="submitReview(3, 1)">Completely new to me (1 day)</button>
            <button onclick="resetToReviewPosition()">Try Again</button>
        `;
    }
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
            reviewStartPosition = mistake.position_fen;
            reviewFirstMoveMade = false;
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
            reviewStartPosition = null;
            reviewFirstMoveMade = false;
            studyMode = false;
            loadReview();
        }, 2000);
    })
    .catch(error => {
        status.textContent = `Error: ${error.message}`;
    });
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
