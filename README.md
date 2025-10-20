# Chess Trainer
NodeJS web server that imports user games from .pgn file (exportable from chess.com and lichess.org), automatically analyzes the
games with stockfish and extracts exercises where a poor move was made, then tests user in these repeatedly over a spaced repetition
schedule that responds to user's ability to find the right move.

# Bugs
There are bugs in both the analysis and review system currently. These are simple bugs in how results are passed between stockfish 
and the rest of the program, or in how the data is handled internally, the overall concept is working. To be fixed soon.

<img src='import1.jpg' width='480'/>
Bulk import of games

<img src='import2.jpg' width='480'/>
<img src='import3.jpg' width='480'/>
<img src='import4.jpg' width='480'/>

