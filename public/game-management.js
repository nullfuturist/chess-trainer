// Game import and management functionality
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
            status.textContent = `Imported ${result.total} total games`;
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
