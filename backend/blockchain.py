"""
VTB (Vote Through Blockchain) - Simulación de Blockchain
=========================================================
Implementa una simulación simplificada de blockchain con:
- Bloques de votos
- Cálculo de hashes SHA-256
- Proof-of-Work simplificado
- Cadena inmutable

Esta es la capa Web3 que garantiza la inmutabilidad y anonimidad de los votos.
"""

import hashlib
import json
from datetime import datetime
from typing import Dict, List, Optional


class Block:
    """
    Representa un bloque en la blockchain.
    
    Atributos:
        index: Número de bloque en la cadena
        timestamp: Timestamp de creación del bloque
        votes: Lista de votos en este bloque
        previous_hash: Hash del bloque anterior (encadenamiento)
        nonce: Número usado para Proof-of-Work
        hash: Hash del bloque actual
    """
    
    def __init__(self, index: int, timestamp: str, votes: List[Dict], previous_hash: str):
        """
        Inicializa un nuevo bloque.
        
        Args:
            index: Posición en la cadena
            timestamp: Hora de creación ISO format
            votes: Lista de votos (candidato) en este bloque
            previous_hash: Hash del bloque anterior
        """
        self.index = index
        self.timestamp = timestamp
        self.votes = votes
        self.previous_hash = previous_hash
        self.nonce = 0
        self.hash = self.calculate_hash()
    
    def calculate_hash(self) -> str:
        """
        Calcula el SHA-256 del bloque.
        Cambiar cualquier dato invalida el bloque (inmutabilidad).
        
        Returns:
            Hash SHA-256 en hexadecimal
        """
        block_data = {
            'index': self.index,
            'timestamp': self.timestamp,
            'votes': self.votes,
            'previous_hash': self.previous_hash,
            'nonce': self.nonce
        }
        block_string = json.dumps(block_data, sort_keys=True)
        return hashlib.sha256(block_string.encode()).hexdigest()
    
    def proof_of_work(self, difficulty: int = 2):
        """
        Implementa Proof-of-Work simplificado.
        Busca un nonce tal que el hash comience con 'difficulty' ceros.
        
        Args:
            difficulty: Número de ceros iniciales requeridos
        """
        target = '0' * difficulty
        while not self.hash.startswith(target):
            self.nonce += 1
            self.hash = self.calculate_hash()
    
    def to_dict(self) -> Dict:
        """Serializa el bloque a diccionario."""
        return {
            'index': self.index,
            'timestamp': self.timestamp,
            'votes': self.votes,
            'previous_hash': self.previous_hash,
            'nonce': self.nonce,
            'hash': self.hash
        }


class Blockchain:
    """
    Implementa una blockchain simplificada para gestionar votos.
    
    Características:
    - Cadena de bloques inmutable
    - Validación de integridad
    - Almacenamiento de votos de forma anónima (sin relación usuario-candidato)
    - Proof-of-Work para evitar registros fraudulentos
    
    Notas:
    - Esta es una SIMULACIÓN educativa, no es un blockchain real
    - Los votos están almacenados en texto plano en los bloques
    - No hay distribución P2P
    """
    
    def __init__(self, difficulty: int = 2):
        """
        Inicializa la blockchain.
        
        Args:
            difficulty: Nivel de dificultad para PoW (ceros iniciales del hash)
        """
        self.chain: List[Block] = []
        self.pending_votes: List[Dict] = []
        self.difficulty = difficulty
        self.block_size = 10  # Máximo de votos por bloque
        
        # Crear bloque génesis
        self.create_genesis_block()
    
    def create_genesis_block(self) -> Block:
        """
        Crea el primer bloque (Genesis Block) de la cadena.
        
        Returns:
            El bloque génesis
        """
        genesis_block = Block(0, datetime.utcnow().isoformat(), [], "0")
        genesis_block.proof_of_work(self.difficulty)
        self.chain.append(genesis_block)
        return genesis_block
    
    def get_latest_block(self) -> Block:
        """
        Obtiene el último bloque de la cadena.
        
        Returns:
            El último bloque
        """
        return self.chain[-1]
    
    def add_vote(self, election_id: int, candidate: str, anonymous_id: str) -> Dict:
        """
        Añade un voto a la lista de votos pendientes.
        Cuando hay suficientes votos, se crea un nuevo bloque.
        
        Args:
            election_id: ID de la elección
            candidate: Nombre del candidato (sin relación a usuario)
            anonymous_id: ID anónimo generado en frontend (ZK-Proof simulado)
        
        Returns:
            Diccionario con info del voto registrado y su hash de transacción
        """
        vote_data = {
            'election_id': election_id,
            'candidate': candidate,
            'anonymous_id': anonymous_id,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Calcular hash de transacción del voto
        vote_tx_hash = self._calculate_vote_hash(vote_data)
        
        self.pending_votes.append(vote_data)
        
        # Si alcanzamos tamaño de bloque, crear nuevo bloque
        if len(self.pending_votes) >= self.block_size:
            self.mine_block()
        
        return {
            'success': True,
            'tx_hash': vote_tx_hash,
            'message': 'Voto registrado en la blockchain',
            'block_ready': len(self.pending_votes) >= self.block_size
        }
    
    def mine_block(self) -> Optional[Block]:
        """
        Crea y añade un nuevo bloque a la cadena con los votos pendientes.
        Realiza Proof-of-Work para asegurar la integridad.
        
        Returns:
            El bloque minado, o None si no hay votos pendientes
        """
        if not self.pending_votes:
            return None
        
        new_block = Block(
            len(self.chain),
            datetime.utcnow().isoformat(),
            self.pending_votes.copy(),
            self.get_latest_block().hash
        )
        
        # Proof-of-Work: encontrar nonce válido
        new_block.proof_of_work(self.difficulty)
        
        self.chain.append(new_block)
        self.pending_votes = []
        
        return new_block
    
    def is_chain_valid(self) -> bool:
        """
        Valida que toda la cadena sea íntegra.
        Verifica que cada bloque tenga el hash correcto y la referencia al anterior.
        
        Returns:
            True si la cadena es válida, False si fue manipulada
        """
        for i in range(1, len(self.chain)):
            current_block = self.chain[i]
            previous_block = self.chain[i - 1]
            
            # Verificar que el hash del bloque actual es correcto
            if current_block.hash != current_block.calculate_hash():
                return False
            
            # Verificar la cadena de hashes
            if current_block.previous_hash != previous_block.hash:
                return False
        
        return True
    
    def get_election_results(self, election_id: int) -> Dict:
        """
        Obtiene los resultados de una elección leyendo desde la blockchain.
        
        Args:
            election_id: ID de la elección
        
        Returns:
            Diccionario con conteo de votos por candidato
        """
        results = {
            'election_id': election_id,
            'total_votes': 0,
            'candidates': {},
            'blockchain_valid': self.is_chain_valid()
        }
        
        # Recorrer todos los bloques buscando votos de esta elección
        for block in self.chain:
            for vote in block.votes:
                if vote['election_id'] == election_id:
                    candidate = vote['candidate']
                    results['candidates'][candidate] = results['candidates'].get(candidate, 0) + 1
                    results['total_votes'] += 1
        
        return results
    
    def get_chain_details(self) -> Dict:
        """
        Obtiene detalles completos de la blockchain para auditoría.
        
        Returns:
            Diccionario con la cadena completa serializada
        """
        return {
            'length': len(self.chain),
            'is_valid': self.is_chain_valid(),
            'difficulty': self.difficulty,
            'pending_votes': len(self.pending_votes),
            'blocks': [block.to_dict() for block in self.chain]
        }
    
    @staticmethod
    def _calculate_vote_hash(vote_data: Dict) -> str:
        """
        Calcula el hash SHA-256 de un voto individual.
        Este es el "recibo" que el usuario recibe para auditoría.
        
        Args:
            vote_data: Diccionario con datos del voto
        
        Returns:
            Hash SHA-256 en hexadecimal
        """
        vote_string = json.dumps(vote_data, sort_keys=True)
        return hashlib.sha256(vote_string.encode()).hexdigest()