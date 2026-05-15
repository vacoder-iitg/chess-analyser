# ♟️ Chess Performance Analyser

A Python-based toolset for extracting chess games from online platforms and performing deep move-by-move accuracy analysis using the Stockfish engine.

## 🚀 Features
- **Game Extraction**: Automatically fetch the latest games from Chess.com and Lichess.
- **Accuracy Scoring**: Move-by-move accuracy calculation based on win-probability shifts.
- **Phase Analysis**: Performance breakdown across Opening, Middlegame, and Endgame phases.
- **Opening Recognition**: Identify and categorize games by specific opening names and variations using a fast FEN-based detector.
- **Performance Highlights**: Track conversion of advantage states and recovery from losing positions.

## 🛠️ Tech Stack
- **Language**: Python
- **Libraries**: `python-chess`, `requests`, `python-lichess`
- **Engine**: Stockfish (UCI compatible)

## 📋 Prerequisites
- Python 3.x
- [Stockfish Engine](https://stockfishchess.org/download/) installed locally.

## ⚙️ Setup & Installation
1. **Clone the repository**:
   ```bash
   git clone https://github.com/vacoder-iitg/chess-analyser.git
   cd chess-analyser
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Download Stockfish**:
   The Stockfish engine is required for analysis.
   - Download the Stockfish binary from [stockfishchess.org](https://stockfishchess.org/download/).
   - Place the `stockfish.exe` (or your platform's binary) in the `stockfish/` directory.
   - Ensure the path in `analyser/game_stats.py` matches your binary location.

## 📖 Usage

### 1. Fetch Games

To download your latest games from Chess.com:
```bash
python pgn_parser/chesscom_game_extractor.py
```

To download your latest games from Lichess:
Update the `LICHESS_USERNAME` in `pgn_parser/lichess_game_extractor.py` and run:
```bash
python pgn_parser/lichess_game_extractor.py
```

### 2. Run Analysis

Run the batch analysis script:
```bash
python analyser/game_stats.py
```

## 📂 Project Structure

- `analyser/`: Core analysis logic and stats calculation.
- `pgn_parser/`: Scripts to fetch games from online platforms.
- `Openings/`: Opening database (JSON).
- `stockfish/`: Placeholder for the Stockfish engine and source.

## 📜 License

This project is licensed under the terms of the LICENSE file included in the repository.
