# Chess Performance Analyser

A web-based application designed to analyze chess games and extract deep, move-by-move insights using the Stockfish engine. It provides an interactive interface for evaluating board positions, importing games from online platforms, and visualizing game metrics through dynamic charts.

## Features

- **Interactive Analysis Board**: A fully playable chessboard that evaluates moves in real-time.
- **Move Classification**: Instantly categorizes moves as Best Moves, Excellent, Good, Inaccuracies, Mistakes, or Blunders.
- **Game Import**: Fetch recent games directly from Chess.com and Lichess using your username.
- **Dynamic Visualization**: Generates interactive charts showing advantage shifts and tactical tension (fragility) over the course of a game.
- **Opening Recognition**: Automatically identifies the opening sequence you are playing using a local database.
- **Accuracy Scoring**: Calculates overall, opening, middlegame, and endgame accuracy based on win-probability shifts.

## Tech Stack

- **Backend**: Python, FastAPI
- **Frontend**: HTML, CSS, JavaScript, Chart.js
- **Chess Logic**: `python-chess` (Backend), `chess.js` and `chessground` (Frontend)
- **Engine**: Stockfish (UCI compatible)

## Prerequisites
- A local copy of the Stockfish Engine.

## Setup and Installation

1. **Clone the repository**:
   Ensure you have cloned the repository to your local machine and navigated into the project directory.

2. **Install dependencies**:
   Install the required Python packages using pip:
   `pip install -r requirements.txt`

3. **Configure Stockfish**:
   The Stockfish engine is strictly required for the analysis features to work.
   - Download the Stockfish binary for your operating system from the official Stockfish website.
   - Place the `stockfish.exe`  into the `stockfish/` directory within this project.

## Usage

1. **Start the server**:
   Launch the FastAPI web server by running the following command in your terminal:
   `uvicorn app:app --reload`

2. **Open the application**:
   Open your web browser and navigate to `http://127.0.0.1:8000` to access the interface.

3. **Analyze games**:
   You can make moves directly on the board, paste a PGN string into the text box, or use the import tool to fetch games from Chess.com or Lichess. Click the analysis buttons to generate accuracy reports and visual charts.

## Project Structure

- `app.py`: The main FastAPI server application and API endpoints.
- `game_analyzer.py`: Backend logic for batch-processing and scoring full games.
- `opening_explorer.py`: Utility for identifying chess openings from FEN strings.
- `analyser/`: Contains mathematical models for calculating tactical tension and engine wrapper logic.
- `static/`: Contains all frontend assets including the HTML, CSS, and JavaScript files.
- `Openings/`: Contains the JSON database used for opening recognition.
- `stockfish/`: The designated directory for your Stockfish binary.

## License

This project is licensed under the terms of the LICENSE file included in the repository.
