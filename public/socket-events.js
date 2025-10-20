// Socket.io connection and event handling
const socket = io();

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

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    createBoard();
    newGame();
    loadGames();
    showTab('play');
});
