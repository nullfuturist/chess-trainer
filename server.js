const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const { Chess } = require('chess.js');
const { spawn } = require('child_process');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Database setup
const db = new sqlite3.Database('chess_games.db');
db.run(`CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pgn TEXT,
    result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS imported_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pgn TEXT,
    headers TEXT,
    result TEXT,
    my_color TEXT,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    studying INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS mistakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER,
    move_number INTEGER,
    position_fen TEXT,
    played_move TEXT,
    best_move TEXT,
    evaluation_before REAL,
    evaluation_after REAL,
    mistake_type TEXT,
    analysis TEXT,
    FOREIGN KEY(game_id) REFERENCES imported_games(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mistake_id INTEGER,
    next_review DATE,
    interval_days INTEGER DEFAULT 1,
    times_reviewed INTEGER DEFAULT 0,
    last_reviewed DATETIME,
    last_move TEXT,
    FOREIGN KEY(mistake_id) REFERENCES mistakes(id)
)`);

// Stockfish engine process
let stockfish = null;
let currentCallback = null;
let engineBusy = false;

function initStockfish() {
    try {
        stockfish = spawn('stockfish');
        stockfish.stdin.write('uci\n');
        stockfish.stdin.write('setoption name Threads value 1\n');
        stockfish.stdin.write('setoption name Hash value 32\n'); // Low memory usage
        stockfish.stdin.write('isready\n');
        
        stockfish.stdout.on('data', (data) => {
            const output = data.toString();
            if (currentCallback && output.includes('bestmove')) {
                const move = output.match(/bestmove (\S+)/);
                if (move && move[1] !== '(none)') {
                    const callback = currentCallback;
                    currentCallback = null;
                    engineBusy = false;
                    callback(move[1]);
                }
            }
        });
        
        stockfish.stderr.on('data', (data) => {
            console.error('Stockfish error:', data.toString());
        });
        
        stockfish.on('close', (code) => {
            console.log('Stockfish process closed with code', code);
            stockfish = null;
        });
    } catch (error) {
        console.log('Stockfish not available, using random moves');
        stockfish = null;
    }
}

function getComputerMove(fen, callback) {
    if (!stockfish) {
        return callback(null, 'Chess engine not available');
    }
    
    if (engineBusy) {
        return callback(null, 'Engine is busy');
    }
    
    engineBusy = true;
    currentCallback = (move) => {
        if (move && move !== '(none)') {
            callback(move);
        } else {
            callback(null, 'Engine failed to find move');
        }
    };
    
    try {
        stockfish.stdin.write(`position fen ${fen}\n`);
        stockfish.stdin.write('go depth 8\n'); // Limited depth for CPU control
        
        // Timeout after 10 seconds
        setTimeout(() => {
            if (currentCallback) {
                engineBusy = false;
                const cb = currentCallback;
                currentCallback = null;
                cb(null, 'Engine timeout');
            }
        }, 10000);
    } catch (error) {
        console.error('Engine communication error:', error);
        engineBusy = false;
        currentCallback = null;
        callback(null, 'Engine communication failed');
    }
}

initStockfish();

app.use(express.static('public'));
app.use(express.json());

// Helper functions
function parsePGN(pgnText) {
    const games = [];
    
    // Split by [Event markers to separate games
    const gameBlocks = pgnText.split(/(?=\[Event)/g).filter(block => block.trim());
    
    for (let block of gameBlocks) {
        const lines = block.split('\n');
        const headers = {};
        const moveLines = [];
        
        // Parse headers and collect move lines
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            const headerMatch = line.match(/^\[(\w+)\s+"([^"]+)"\]/);
            if (headerMatch) {
                headers[headerMatch[1]] = headerMatch[2];
            } else if (line.match(/^\d+\./)) {
                moveLines.push(line);
            }
        }
        
        // Combine move lines into pgn
        const pgn = moveLines.join(' ').trim();
        
        // Only include games with moves and required headers
        if (pgn && headers.White && headers.Black && headers.Result) {
            games.push({
                headers,
                pgn,
                result: headers.Result
            });
        }
    }
    
    console.log(`Parsed ${games.length} games from PGN`);
    return games;
}

function analyzePosition(fen, depth = 8) {
    return new Promise((resolve) => {
        if (!stockfish) {
            resolve({ bestMove: null, evaluation: 0, error: 'Engine not available' });
            return;
        }
        
        if (engineBusy) {
            resolve({ bestMove: null, evaluation: 0, error: 'Engine busy' });
            return;
        }
        
        engineBusy = true;
        let evaluation = 0;
        let bestMove = null;
        let responseReceived = false;
        
        const timeout = setTimeout(() => {
            if (!responseReceived) {
                responseReceived = true;
                engineBusy = false;
                resolve({ bestMove: null, evaluation: 0, error: 'Timeout' });
            }
        }, 3000);
        
        const dataHandler = (data) => {
            const output = data.toString();
            
            // Capture evaluation
            const evalMatch = output.match(/score cp (-?\d+)/);
            if (evalMatch) {
                evaluation = parseInt(evalMatch[1]) / 100;
            }
            const mateMatch = output.match(/score mate (-?\d+)/);
            if (mateMatch) {
                const mateIn = parseInt(mateMatch[1]);
                evaluation = mateIn > 0 ? 99 : -99;
            }
            
            // Capture best move and convert UCI to SAN
            if (output.includes('bestmove')) {
                const moveMatch = output.match(/bestmove (\S+)/);
                if (moveMatch && moveMatch[1] !== '(none)') {
                    const uciMove = moveMatch[1];
                    
                    // Convert UCI to SAN using a chess instance
                    try {
                        const tempChess = new Chess(fen);
                        const moveObj = tempChess.move(uciMove);
                        bestMove = moveObj ? moveObj.san : uciMove;
                    } catch (e) {
                        bestMove = uciMove; // Fallback to UCI
                    }
                }
                
                if (!responseReceived) {
                    responseReceived = true;
                    clearTimeout(timeout);
                    stockfish.stdout.removeListener('data', dataHandler);
                    engineBusy = false;
                    resolve({ bestMove, evaluation });
                }
            }
        };
        
        stockfish.stdout.on('data', dataHandler);
        
        try {
            stockfish.stdin.write(`position fen ${fen}\n`);
            stockfish.stdin.write(`go depth ${depth}\n`);
        } catch (error) {
            clearTimeout(timeout);
            stockfish.stdout.removeListener('data', dataHandler);
            engineBusy = false;
            resolve({ bestMove: null, evaluation: 0, error: 'Communication error' });
        }
    });
}

async function analyzeGame(pgn, myColor) {
    const chess = new Chess();
    const mistakes = [];
    
    console.log(`Analyzing game for ${myColor}, PGN: ${pgn.substring(0, 100)}...`);
    
    // Parse moves more carefully
    const moves = pgn.split(/\d+\./).filter(m => m.trim()).join(' ').split(/\s+/).filter(m => m && !m.match(/^[0-9-]+$/));
    console.log(`Found ${moves.length} moves:`, moves.slice(0, 10));
    
    let moveNumber = 1;
    let prevEvaluation = 0;
    
    for (let i = 0; i < moves.length; i++) {
        const moveStr = moves[i].replace(/[+#?!]+$/, ''); // Remove annotations
        if (!moveStr) continue;
        
        const currentTurn = chess.turn();
        const isMyMove = (myColor === 'white' && currentTurn === 'w') || 
                        (myColor === 'black' && currentTurn === 'b');
        
        console.log(`Move ${i}: ${moveStr}, Turn: ${currentTurn}, IsMyMove: ${isMyMove}`);
        
        if (isMyMove) {
            const positionBefore = chess.fen();
            console.log(`Analyzing position before move: ${positionBefore}`);
            
            const analysis = await analyzePosition(positionBefore, 10); // Reduced depth
            console.log(`Analysis result:`, analysis);
            
            const move = chess.move(moveStr);
            if (!move) {
                console.warn(`Invalid move: ${moveStr} in position ${positionBefore}`);
                break;
            }
            
            const positionAfter = chess.fen();
            const analysisAfter = await analyzePosition(positionAfter, 10);
            
            // Calculate evaluation drop
            const evalBefore = analysis.evaluation || 0;
            const evalAfter = analysisAfter.evaluation || 0;
            
            const evalDrop = myColor === 'white' ? 
                (evalBefore - evalAfter) : 
                (evalAfter - evalBefore);
            
            console.log(`Eval before: ${evalBefore}, after: ${evalAfter}, drop: ${evalDrop}`);
            
            let mistakeType = null;
            if (evalDrop >= 2) mistakeType = 'blunder';
            else if (evalDrop >= 1) mistakeType = 'mistake';
            else if (evalDrop >= 0.5) mistakeType = 'inaccuracy';
            
            if (mistakeType) {
                console.log(`Found ${mistakeType} on move ${moveNumber}`);
                mistakes.push({
                    moveNumber: Math.ceil((i + 1) / 2),
                    positionFen: positionBefore,
                    playedMove: moveStr,
                    bestMove: analysis.bestMove || 'unknown',
                    evaluationBefore: evalBefore,
                    evaluationAfter: evalAfter,
                    mistakeType,
                    analysis: `Lost ${evalDrop.toFixed(1)} points`
                });
            }
            
            prevEvaluation = evalAfter;
        } else {
            const move = chess.move(moveStr);
            if (!move) {
                console.warn(`Invalid opponent move: ${moveStr}`);
                break;
            }
            
            const analysis = await analyzePosition(chess.fen(), 8);
            prevEvaluation = analysis.evaluation || 0;
        }
        
        if (currentTurn === 'b') moveNumber++;
    }
    
    console.log(`Analysis complete. Found ${mistakes.length} mistakes`);
    return mistakes;
}

// API endpoints
app.get('/api/games', (req, res) => {
    db.all('SELECT * FROM games ORDER BY created_at DESC LIMIT 50', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/games', (req, res) => {
    const { pgn, result } = req.body;
    db.run('INSERT INTO games (pgn, result) VALUES (?, ?)', [pgn, result], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.post('/api/import-pgn', upload.single('pgnFile'), async (req, res) => {
    try {
        const fs = require('fs');
        const pgnContent = fs.readFileSync(req.file.path, 'utf8');
        console.log(`PGN file size: ${pgnContent.length} characters`);
        
        const games = parsePGN(pgnContent);
        console.log(`Found ${games.length} total games`);
        

        
        let imported = 0;
        for (const game of games) {
            const headers = game.headers;
            const myColor = headers.White === 'Semiotics' ? 'white' : 'black';
            
            db.run(`INSERT INTO imported_games (pgn, headers, result, my_color) VALUES (?, ?, ?, ?)`,
                [game.pgn, JSON.stringify(headers), game.result, myColor], function(err) {
                if (!err) {
                    imported++;
                    console.log(`Imported game: ${headers.White} vs ${headers.Black}`);
                } else {
                    console.error('Database error:', err);
                }
            });
        }
        
        fs.unlinkSync(req.file.path);
        res.json({ imported, total: games.length });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/imported-games', (req, res) => {
    db.all(`SELECT id, headers, result, my_color, studying, imported_at 
            FROM imported_games ORDER BY imported_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const games = rows.map(row => ({
            ...row,
            headers: JSON.parse(row.headers)
        }));
        
        res.json(games);
    });
});

app.post('/api/study-game/:id', async (req, res) => {
    const gameId = req.params.id;
    
    try {
        db.get('SELECT * FROM imported_games WHERE id = ?', [gameId], async (err, game) => {
            if (err || !game) return res.status(404).json({ error: 'Game not found' });
            
            // Analyze the game
            const mistakes = await analyzeGame(game.pgn, game.my_color);
            
            // Save mistakes
            for (const mistake of mistakes) {
                db.run(`INSERT INTO mistakes 
                       (game_id, move_number, position_fen, played_move, best_move, 
                        evaluation_before, evaluation_after, mistake_type, analysis) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [gameId, mistake.moveNumber, mistake.positionFen, mistake.playedMove,
                     mistake.bestMove, mistake.evaluationBefore, mistake.evaluationAfter,
                     mistake.mistakeType, mistake.analysis]);
            }
            
            // Mark game as studying
            db.run('UPDATE imported_games SET studying = 1 WHERE id = ?', [gameId]);
            
            res.json({ mistakes: mistakes.length });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/studying-games', (req, res) => {
    db.all(`SELECT g.*, COUNT(m.id) as mistake_count
            FROM imported_games g 
            LEFT JOIN mistakes m ON g.id = m.game_id 
            WHERE g.studying = 1 
            GROUP BY g.id 
            ORDER BY g.imported_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const games = rows.map(row => ({
            ...row,
            headers: JSON.parse(row.headers)
        }));
        
        res.json(games);
    });
});

app.get('/api/mistakes/:gameId', (req, res) => {
    db.all(`SELECT * FROM mistakes WHERE game_id = ? ORDER BY move_number DESC`, 
           [req.params.gameId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/engine-move', async (req, res) => {
    const { fen } = req.body;
    
    if (!fen) {
        return res.status(400).json({ error: 'FEN position required' });
    }
    
    getComputerMove(fen, (move, error) => {
        if (error) {
            res.json({ error });
        } else {
            res.json({ move });
        }
    });
});

app.get('/api/game-pgn/:mistakeId', (req, res) => {
    db.get(`SELECT g.pgn FROM imported_games g 
            JOIN mistakes m ON g.id = m.game_id 
            WHERE m.id = ?`, [req.params.mistakeId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Game not found' });
        res.json({ pgn: row.pgn });
    });
});

app.get('/api/review-due', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Checking for reviews due on or before: ${today}`);
    
    db.all(`SELECT m.*, s.next_review, s.interval_days, s.times_reviewed
            FROM mistakes m 
            JOIN study_sessions s ON m.id = s.mistake_id 
            WHERE s.next_review <= ? 
            ORDER BY s.next_review ASC`, [today], (err, rows) => {
        if (err) {
            console.error('Review query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`Found ${rows.length} reviews due`);
        if (rows.length > 0) {
            console.log('First review:', rows[0]);
        }
        
        // Also check what study sessions exist
        db.all('SELECT * FROM study_sessions ORDER BY next_review', (err2, allSessions) => {
            if (!err2) {
                console.log(`Total study sessions: ${allSessions.length}`);
                allSessions.forEach(session => {
                    console.log(`Session ${session.id}: mistake ${session.mistake_id}, next: ${session.next_review}`);
                });
            }
        });
        
        res.json(rows[0] || null);
    });
});

app.post('/api/review-result/:mistakeId', (req, res) => {
    const { difficulty, playerMove, days } = req.body; 
    const mistakeId = req.params.mistakeId;
    
    console.log(`Review result for mistake ${mistakeId}, difficulty: ${difficulty}, move: ${playerMove}, days: ${days}`);
    
    db.get('SELECT * FROM study_sessions WHERE mistake_id = ?', [mistakeId], (err, session) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let newInterval;
        const today = new Date().toISOString().split('T')[0];
        
        if (!session) {
            // First time adding to review - make it due TODAY for immediate review
            newInterval = 1;
            
            console.log(`Creating new study session for mistake ${mistakeId} - due today`);
            
            db.run(`INSERT INTO study_sessions (mistake_id, next_review, interval_days, times_reviewed, last_reviewed, last_move)
                    VALUES (?, ?, ?, 0, datetime('now'), ?)`,
                   [mistakeId, today, newInterval, playerMove || null], function(err) {
                if (err) {
                    console.error('Database insert error:', err);
                    return res.status(500).json({ error: err.message });
                }
                console.log(`Created study session with ID ${this.lastID} - due today`);
                res.json({ success: true, nextInterval: newInterval });
            });
        } else {
            // Actual review completion - use the specified number of days
            newInterval = days || 1;
            
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + newInterval);
            const nextReview = nextDate.toISOString().split('T')[0];
            
            console.log(`Completing review for mistake ${mistakeId}, next review: ${nextReview} (${newInterval} days)`);
            
            db.run(`UPDATE study_sessions 
                    SET next_review = ?, 
                        interval_days = ?, 
                        times_reviewed = times_reviewed + 1,
                        last_reviewed = datetime('now'),
                        last_move = ?
                    WHERE mistake_id = ?`, [nextReview, newInterval, playerMove || null, mistakeId], function(err) {
                if (err) {
                    console.error('Database update error:', err);
                    return res.status(500).json({ error: err.message });
                }
                console.log(`Completed review for mistake ${mistakeId}`);
                res.json({ success: true, nextInterval: newInterval });
            });
        }
    });
});

// Socket handling
io.on('connection', (socket) => {
    let currentGame = new Chess();
    
    socket.on('move', (move) => {
        try {
            const result = currentGame.move(move);
            if (!result) {
                socket.emit('invalidMove', move);
                return;
            }
            
            socket.emit('gameUpdate', {
                fen: currentGame.fen(),
                pgn: currentGame.pgn(),
                gameOver: currentGame.isGameOver(),
                check: currentGame.inCheck(),
                turn: currentGame.turn()
            });
            
            if (currentGame.isGameOver()) {
                let result = 'Draw';
                if (currentGame.isCheckmate()) {
                    result = currentGame.turn() === 'w' ? 'Black wins' : 'White wins';
                }
                
                // Save game to database
                db.run('INSERT INTO games (pgn, result) VALUES (?, ?)', 
                    [currentGame.pgn(), result]);
                
                socket.emit('gameOver', result);
                return;
            }
            
            // Computer move
            if (currentGame.turn() === 'b') {
                getComputerMove(currentGame.fen(), (computerMove, error) => {
                    if (error) {
                        socket.emit('engineError', error);
                        return;
                    }
                    
                    try {
                        currentGame.move(computerMove);
                        
                        socket.emit('gameUpdate', {
                            fen: currentGame.fen(),
                            pgn: currentGame.pgn(),
                            gameOver: currentGame.isGameOver(),
                            check: currentGame.inCheck(),
                            turn: currentGame.turn(),
                            lastMove: computerMove
                        });
                        
                        if (currentGame.isGameOver()) {
                            let result = 'Draw';
                            if (currentGame.isCheckmate()) {
                                result = currentGame.turn() === 'w' ? 'Black wins' : 'White wins';
                            }
                            
                            db.run('INSERT INTO games (pgn, result) VALUES (?, ?)', 
                                [currentGame.pgn(), result]);
                            
                            socket.emit('gameOver', result);
                        }
                    } catch (err) {
                        socket.emit('engineError', 'Computer made invalid move');
                    }
                });
            }
        } catch (err) {
            socket.emit('error', 'Invalid move');
        }
    });
    
    socket.on('newGame', () => {
        currentGame = new Chess();
        socket.emit('gameUpdate', {
            fen: currentGame.fen(),
            pgn: '',
            gameOver: false,
            check: false,
            turn: 'w'
        });
    });
    
    socket.on('disconnect', () => {
        // Clean up if needed
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Chess server running on port ${PORT}`);
});

process.on('exit', () => {
    if (stockfish) stockfish.kill();
    db.close();
});
