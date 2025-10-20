// Game state management
let currentGame = {};
let selectedSquare = null;
let flipped = false;
let studyMode = false;
let currentMistake = null;
let currentReviewMistake = null;
let reviewStartPosition = null;
let reviewFirstMoveMade = false;
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
