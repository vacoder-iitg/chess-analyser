# Chess Performance Analyser

A Python-based toolset for extracting chess games from online platforms and performing deep move-by-move accuracy analysis using the Stockfish engine.

## 🚀 Features
- **Game Extraction**: Automatically fetch the latest games from Chess.com and Lichess.
- **Accuracy Scoring**: Move-by-move accuracy calculation based on win-probability shifts.
- **Phase Analysis**: Performance breakdown across Opening, Middlegame, and Endgame phases.
- **Opening Recognition**: Identify and categorize games by specific opening names and variations.

## 🛠️ Tech Stack
- **Language**: Python
- **Libraries**: `python-chess`, `requests`, `python-lichess`, `python-dotenv`
- **Engine**: Stockfish (UCI compatible)

## 📋 Prerequisites
- Python 3.x
- [Stockfish Engine](https://stockfishchess.org/download/) installed locally.

## ⚙️ Setup & Installation
1. **Clone the repository**:
   ```bash
   git clone [https://github.com/YOUR_USERNAME/chess-analyser.git](https://github.com/YOUR_USERNAME/chess-analyser.git)
   cd chess-analyser
