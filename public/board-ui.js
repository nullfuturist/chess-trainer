// Board UI and interaction handling
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

function flipBoard() {
    flipped = !flipped;
    createBoard();
    updateBoard(currentGame.fen);
}
