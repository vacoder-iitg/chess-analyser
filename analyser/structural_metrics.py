import chess
import networkx as nx

# Standard piece values for weighting
PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0  # King's defensive/attack weight treated as 0
}

def calculate_fragility_score(board: chess.Board, color: chess.Color = chess.WHITE) -> float:
    """
    Calculates the positional Fragility Score for a given color.
    
    For each piece under attack:
      - Higher centrality = more structurally important
      - More/stronger attackers = more fragile
      - More/stronger defenders = less fragile
    
    Net Fragility per piece = centrality * max(0, attacker_weight - defender_weight)
    """
    G = nx.DiGraph()
    pieces_on_board = {}

    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            pieces_on_board[square] = piece
            G.add_node(square, piece_type=piece.piece_type, color=piece.color)

    # Track attackers and defenders per square
    # attacked_squares[sq] = {'attackers': [...], 'defenders': [...]}
    square_relations = {sq: {'attackers': [], 'defenders': []} for sq in pieces_on_board}

    for square, piece in pieces_on_board.items():
        attacks = board.attacks(square)
        for target_square in attacks:
            if target_square in pieces_on_board:
                target_piece = pieces_on_board[target_square]

                if piece.color == target_piece.color:
                    # Defensive relationship
                    G.add_edge(square, target_square, type='defense')
                    square_relations[target_square]['defenders'].append(square)
                else:
                    # Attack relationship
                    G.add_edge(square, target_square, type='attack')
                    square_relations[target_square]['attackers'].append(square)

    # Only evaluate pieces of the given color that are under attack
    under_attack = {
        sq for sq, relations in square_relations.items()
        if relations['attackers']
        and pieces_on_board[sq].color == color
    }

    if not under_attack or len(G.nodes) <= 2:
        return 0.0

    centrality = nx.betweenness_centrality(G, normalized=True)

    total_fragility = 0.0

    for sq in under_attack:
        piece = pieces_on_board[sq]
        relations = square_relations[sq]

        # Sum of attacking piece values
        attacker_weight = sum(
            PIECE_VALUES[pieces_on_board[a].piece_type]
            for a in relations['attackers']
        )

        # Sum of defending piece values
        defender_weight = sum(
            PIECE_VALUES[pieces_on_board[d].piece_type]
            for d in relations['defenders']
        )

        # Net pressure: how much more attack than defense
        # Clamped to 0 — if well-defended, contributes 0 fragility
        net_pressure = max(0.0, attacker_weight - defender_weight)

        # Structural importance of this piece in the interaction network
        structural_weight = centrality[sq]

        # Fragility contribution of this piece
        piece_fragility = structural_weight * net_pressure
        total_fragility += piece_fragility

    # Normalize by pieces under attack to keep scale consistent
    normalized = total_fragility / len(under_attack)
    return round(normalized * 100, 2)