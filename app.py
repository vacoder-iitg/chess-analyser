from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import chess
import chess.engine
import os
import sys
import requests
import ndjson
import asyncio
from typing import Optional

sys.path.append(os.path.join(os.path.dirname(__file__), 'analyser'))
from opening_explorer import FastOpeningDetector
from game_engine import cp_to_win_prob, calculate_move_accuracy
from game_analyzer import analyze_full_game

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

openings_path = os.path.join(os.path.dirname(__file__), 'Openings', 'openings.json')
detector = FastOpeningDetector(openings_path)

engine = None
current_analysis_task = None
evaluation_cache = {}

@app.on_event("startup")
async def startup_event():
    global engine
    engine_path = os.path.join(os.path.dirname(__file__), 'stockfish', 'stockfish.exe')
    try:
        transport, engine = await chess.engine.popen_uci(engine_path)
        await engine.configure({"Threads": 2, "Hash": 128})
    except Exception:
        engine = None

class EvaluationRequest(BaseModel):
    fen: str
    prev_cp: Optional[float] = None
    prev_mate: Optional[int] = None

class FullGameAnalysisRequest(BaseModel):
    pgn: str

@app.get("/", response_class=HTMLResponse)
async def get_index():
    with open(os.path.join(os.path.dirname(__file__), 'static', 'index.html'), 'r') as f:
        return f.read()

def get_threats(board: chess.Board):
    threats = []
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            attacks = board.attacks(square)
            for target_square in attacks:
                target_piece = board.piece_at(target_square)
                if target_piece and piece.color != target_piece.color:
                    threats.append({"from": chess.square_name(square), "to": chess.square_name(target_square), "color": "white" if piece.color == chess.WHITE else "black"})
    return threats

def format_evaluation_response(raw_eval: dict, req: EvaluationRequest, board: chess.Board, opening_name: str):
    cp_after = raw_eval["raw_cp"]
    response_data = {"score": raw_eval["score"], "mate": raw_eval["mate"], "best_move": raw_eval["best_move"], "opening": opening_name, "category": None, "accuracy": None, "raw_cp": cp_after, "threats": get_threats(board)}
    player = "white" if not board.turn else "black"
    if opening_name != "Unknown Opening":
        response_data["category"] = "Book Move"
        response_data["accuracy"] = 100.0
    elif req.prev_cp is not None or req.prev_mate is not None:
        prev_cp = req.prev_cp if req.prev_cp is not None else (10000 if req.prev_mate > 0 else -10000)
        wp_before, wp_after = cp_to_win_prob(prev_cp), cp_to_win_prob(cp_after)
        acc = calculate_move_accuracy(wp_before, wp_after) if player == "white" else calculate_move_accuracy(100 - wp_before, 100 - wp_after)
        response_data["accuracy"] = acc
        if acc >= 98: cat = "Best Move"
        elif acc >= 90: cat = "Excellent"
        elif acc >= 80: cat = "Good"
        elif acc >= 70: cat = "Inaccuracy"
        elif acc >= 50: cat = "Mistake"
        else: cat = "Blunder"
        response_data["category"] = cat
    return response_data

@app.post("/evaluate")
async def evaluate_position(req: EvaluationRequest):
    global current_analysis_task
    fen = req.fen
    board = chess.Board(fen)
    opening_name = detector.get_name(board) or "Unknown Opening"
    
    if fen in evaluation_cache: return format_evaluation_response(evaluation_cache[fen], req, board, opening_name)
    if not engine: return format_evaluation_response({"score": 0.0, "mate": None, "best_move": None, "raw_cp": 0}, req, board, opening_name)
    
    if current_analysis_task and not current_analysis_task.done():
        current_analysis_task.cancel()
        try:
            await current_analysis_task
        except Exception:
            pass

    async def run_analysis():
        info = await engine.analyse(board, chess.engine.Limit(time=2.0))
        cp_after = score = 0.0
        mate = best_move = None
        if "score" in info:
            score_val = info["score"].white()
            cp_after = info["score"].pov(chess.WHITE).score(mate_score=10000)
            if score_val.is_mate(): mate = score_val.mate()
            else: score = score_val.score() / 100.0
        if "pv" in info and len(info["pv"]) > 0: best_move = board.san(info["pv"][0])
        return {"score": score, "mate": mate, "best_move": best_move, "raw_cp": cp_after}

    current_analysis_task = asyncio.create_task(run_analysis())
    try:
        raw_eval = await current_analysis_task
        evaluation_cache[fen] = raw_eval
        return format_evaluation_response(raw_eval, req, board, opening_name)
    except asyncio.CancelledError:
        return {"score": 0.0, "mate": None, "best_move": None, "opening": opening_name, "category": "Interrupted", "accuracy": None, "raw_cp": 0, "threats": []}

@app.post("/analyze_full_game")
async def handle_full_game_analysis(req: FullGameAnalysisRequest):
    engine_path = os.path.join(os.path.dirname(__file__), 'stockfish', 'stockfish.exe')
    try:
        results = await asyncio.to_thread(analyze_full_game, req.pgn, engine_path)
        if not results:
            return {"error": "Invalid PGN"}
        return results
    except Exception as e:
        return {"error": str(e)}

@app.get("/fetch_games")
async def fetch_games(platform: str, username: str, time_format: str):
    games = []
    headers = {"User-Agent": "adityavishwas83@gmail.com"}
    if platform == "lichess":
        r = requests.get(f"https://lichess.org/api/games/user/{username}?max=10&perfType={time_format}&pgnInJson=true", headers={"Accept": "application/x-ndjson"})
        if r.status_code == 200:
            for game in ndjson.loads(r.text):
                wp, bp = game.get("players", {}).get("white", {}), game.get("players", {}).get("black", {})
                res = "1-0" if game.get("winner") == "white" else "0-1" if game.get("winner") == "black" else "1/2-1/2"
                if game.get("pgn"): games.append({"white": wp.get("user", {}).get("name", "Unknown"), "white_rating": wp.get("rating", "?"), "black": bp.get("user", {}).get("name", "Unknown"), "black_rating": bp.get("rating", "?"), "result": res, "pgn": game["pgn"]})
    elif platform == "chesscom":
        r = requests.get(f"https://api.chess.com/pub/player/{username}/games/archives", headers=headers)
        if r.status_code == 200:
            for arch in r.json().get("archives", [])[::-1]:
                if len(games) >= 10: break
                ar = requests.get(arch, headers=headers)
                if ar.status_code == 200:
                    for g in ar.json().get("games", [])[::-1]:
                        if len(games) >= 10: break
                        if g.get("time_class") == time_format and "pgn" in g:
                            res = "1-0" if g.get("white", {}).get("result") == "win" else "0-1" if g.get("black", {}).get("result") == "win" else "1/2-1/2"
                            games.append({"white": g.get("white", {}).get("username", "Unknown"), "white_rating": g.get("white", {}).get("rating", "?"), "black": g.get("black", {}).get("username", "Unknown"), "black_rating": g.get("black", {}).get("rating", "?"), "result": res, "pgn": g["pgn"]})
    return {"games": games}

@app.on_event("shutdown")
async def shutdown_event():
    if engine: await engine.quit()