"""
VTB (Vote Through Blockchain) - API REST con Flask
====================================================
Aplicación principal que implementa el servidor backend.

Esta aplicación expone una API REST que:
1. Gestiona autenticación de usuarios (SQL)
2. Registra votos en la blockchain simulada
3. Proporciona resultados de elecciones desde la blockchain
4. Valida la integridad de la cadena

Estructura de componentes:
- Web2: Usuarios y elecciones (SQLite + SQLAlchemy)
- Web3: Votos anónimos e inmutables (Blockchain simulada)
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import uuid
import os

# Importar componentes personalizados
from models import db, User, Election, Vote, UserRole
from blockchain import Blockchain

# ============================================================
# INICIALIZACIÓN DE LA APLICACIÓN
# ============================================================

app = Flask(__name__)
CORS(app)  # Permite comunicación entre React (frontend) y Python (backend)

# Configuración de la base de datos
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, "vtb_demo.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Inicializar la base de datos y la blockchain
db.init_app(app)
blockchain = Blockchain(difficulty=2)  # PoW con 2 ceros iniciales


# ============================================================
# FUNCIONES AUXILIARES
# ============================================================

def seed_database():
    """
    Inicializa la base de datos con datos de prueba.
    Se ejecuta una sola vez al inicio de la aplicación.
    """
    # Crear todas las tablas
    db.create_all()
    
    # Verificar si ya hay datos
    if User.query.first() is not None:
        print("✓ Base de datos ya inicializada.")
        return
    
    print("📊 Inicializando base de datos con datos de prueba...")
    
    # === CREAR USUARIOS ===
    admin = User(
        email='admin@ufv.es',
        password='admin123',  # En producción: hashear con werkzeug
        role=UserRole.ADMIN
    )
    
    alumno = User(
        email='alumno@ufv.es',
        password='alumno123',
        role=UserRole.VOTANTE
    )
    
    # === CREAR ELECCIONES ===
    eleccion_delegado = Election(
        title='Delegado 3º Ingeniería Informática',
        description='Elección del delegado de curso para el año académico 2025-2026',
        is_active=True,
        candidates=[
            {'name': 'Alice García', 'description': 'Propuesta: más recursos en laboratorios'},
            {'name': 'Bob López', 'description': 'Propuesta: flexibilizar horarios de clases'},
            {'name': 'Carol Martínez', 'description': 'Propuesta: mejorar comunicación con profesorado'}
        ]
    )
    
    eleccion_presupuestos = Election(
        title='Presupuestos 2025 - Aprobación',
        description='Votación sobre la aprobación de presupuestos para 2025',
        is_active=False,  # Cerrada
        candidates=[
            {'name': 'Opción A: Invertir en becas', 'description': '+40% en becas'},
            {'name': 'Opción B: Invertir en infraestructura', 'description': '+40% en equipos'}
        ]
    )
    
    # Guardar en BD
    db.session.add_all([admin, alumno, eleccion_delegado, eleccion_presupuestos])
    db.session.commit()
    
    print(f"✓ {User.query.count()} usuarios creados")
    print(f"✓ {Election.query.count()} elecciones creadas")
    print(f"✓ Blockchain génesis creado")


def generate_anonymous_credential():
    """
    Genera una "credencial anónima" simulada.
    En un sistema real, esto sería un Zero-Knowledge Proof.
    
    Returns:
        str: ID anónimo (UUID) para auditoría sin revelar identidad
    """
    return str(uuid.uuid4())[:8]  # 8 caracteres de UUID


# ============================================================
# RUTAS: AUTENTICACIÓN
# ============================================================

@app.route('/api/login', methods=['POST'])
def login():
    """
    Autentica un usuario contra la base de datos SQL.
    
    Payload:
        {
            "email": "alumno@ufv.es",
            "password": "alumno123"
        }
    
    Response:
        {
            "success": true,
            "user": {
                "id": 1,
                "email": "alumno@ufv.es",
                "role": "votante"
            }
        }
    """
    data = request.get_json()
    
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email y contraseña requeridos'}), 400
    
    user = User.query.filter_by(email=data['email']).first()
    
    if user and user.password == data['password']:  # En producción: usar check_password_hash
        return jsonify({
            'success': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'role': user.role.value
            }
        }), 200
    
    return jsonify({'error': 'Credenciales inválidas'}), 401


# ============================================================
# RUTAS: ELECCIONES
# ============================================================

@app.route('/api/elections', methods=['GET'])
def get_elections():
    """
    Obtiene todas las elecciones disponibles.
    
    Response:
        [
            {
                "id": 1,
                "title": "Delegado 3º Ingeniería",
                "is_active": true,
                "candidates": [...]
            }
        ]
    """
    elections = Election.query.all()
    return jsonify([e.to_dict() for e in elections]), 200


@app.route('/api/elections/<int:election_id>', methods=['GET'])
def get_election(election_id):
    """
    Obtiene una elección específica por ID.
    """
    election = Election.query.get(election_id)
    
    if not election:
        return jsonify({'error': 'Elección no encontrada'}), 404
    
    return jsonify(election.to_dict()), 200


# ============================================================
# RUTAS: VOTACIÓN (EL CORE)
# ============================================================

@app.route('/api/vote', methods=['POST'])
def vote():
    """
    Registra un voto en la blockchain simulada.
    
    Proceso:
    1. Usuario autenticado elige candidato
    2. Frontend genera credencial anónima (ZK-Proof simulado)
    3. Backend recibe voto y lo añade a blockchain
    4. Se calcula hash SHA-256 (asegura inmutabilidad)
    5. Frontend muestra "recibo" (hash) para auditoría
    
    Payload:
        {
            "election_id": 1,
            "candidate": "Alice García",
            "user_id": 2
        }
    
    Response:
        {
            "success": true,
            "tx_hash": "a1b2c3d4e5f6...",
            "message": "Voto registrado en la blockchain",
            "receipt": {
                "timestamp": "2025-02-13T10:30:00",
                "election_id": 1,
                "anonymous_credential": "a7c3f9d0"
            }
        }
    """
    data = request.get_json()
    
    # Validación
    if not all(k in data for k in ['election_id', 'candidate', 'user_id']):
        return jsonify({'error': 'Faltan campos requeridos'}), 400
    
    election_id = data['election_id']
    candidate = data['candidate']
    user_id = data['user_id']
    
    # Verificar que la elección existe y está activa
    election = Election.query.get(election_id)
    if not election:
        return jsonify({'error': 'Elección no encontrada'}), 404
    
    if not election.is_active:
        return jsonify({'error': 'Esta elección está cerrada'}), 403
    
    # Verificar que el usuario no ha votado ya en esta elección
    existing_vote = Vote.query.filter_by(user_id=user_id, election_id=election_id).first()
    if existing_vote:
        return jsonify({'error': 'Ya has votado en esta elección'}), 403
    
    # Generar credencial anónima (simulación de ZK-Proof)
    anonymous_credential = generate_anonymous_credential()
    
    # Añadir voto a la blockchain (sin relación usuario-candidato)
    blockchain_result = blockchain.add_vote(
        election_id=election_id,
        candidate=candidate,
        anonymous_id=anonymous_credential
    )
    
    # Registrar el voto en SQL (para auditoría de censo, sin candidato)
    vote = Vote(
        user_id=user_id,
        election_id=election_id,
        blockchain_tx_hash=blockchain_result['tx_hash']
    )
    db.session.add(vote)
    db.session.commit()
    
    # Si hay 10 votos, minar un bloque automáticamente
    if blockchain_result['block_ready']:
        blockchain.mine_block()
    
    return jsonify({
        'success': True,
        'tx_hash': blockchain_result['tx_hash'],
        'message': 'Voto registrado en la blockchain',
        'receipt': {
            'timestamp': datetime.utcnow().isoformat(),
            'election_id': election_id,
            'anonymous_credential': anonymous_credential,
            'note': 'Guarda este recibo para auditoría. Tu voto es anónimo.'
        }
    }), 201


# ============================================================
# RUTAS: RESULTADOS
# ============================================================

@app.route('/api/results/<int:election_id>', methods=['GET'])
def get_results(election_id):
    """
    Obtiene los resultados de una elección DESDE LA BLOCKCHAIN.
    
    Nota: Los resultados se leen ÚNICAMENTE de la blockchain,
    no de la SQL. Esto garantiza que nadie puede manipular con
    acceso directo a BD.
    
    Response:
        {
            "election_id": 1,
            "total_votes": 5,
            "candidates": {
                "Alice García": 2,
                "Bob López": 2,
                "Carol Martínez": 1
            },
            "blockchain_valid": true
        }
    """
    # Verificar que la elección existe
    election = Election.query.get(election_id)
    if not election:
        return jsonify({'error': 'Elección no encontrada'}), 404
    
    # Leer resultados desde blockchain
    results = blockchain.get_election_results(election_id)
    
    return jsonify({
        'election_id': election_id,
        'title': election.title,
        'results': results,
        'can_view': not election.is_active  # Solo ver si está cerrada
    }), 200


# ============================================================
# RUTAS: AUDITORÍA (BLOCKCHAIN)
# ============================================================

@app.route('/api/chain', methods=['GET'])
def get_chain():
    """
    Devuelve los detalles completos de la blockchain.
    Útil para auditoría y demostración de integridad.
    
    Response:
        {
            "length": 3,
            "is_valid": true,
            "difficulty": 2,
            "pending_votes": 2,
            "blocks": [
                {
                    "index": 0,
                    "timestamp": "...",
                    "votes": [...],
                    "hash": "00a1b2c3d4e5f6..."
                }
            ]
        }
    """
    return jsonify(blockchain.get_chain_details()), 200


@app.route('/api/chain/validate', methods=['GET'])
def validate_chain():
    """
    Valida que la blockchain no ha sido manipulada.
    
    Response:
        {
            "is_valid": true,
            "message": "La blockchain es íntegra"
        }
    """
    is_valid = blockchain.is_chain_valid()
    
    return jsonify({
        'is_valid': is_valid,
        'message': 'La blockchain es íntegra' if is_valid else 'La blockchain ha sido manipulada'
    }), 200


# ============================================================
# RUTAS: ADMIN
# ============================================================

@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    """
    Panel de administración: estadísticas generales.
    (Solo accesible para admin - en producción: verificar token)
    """
    return jsonify({
        'total_users': User.query.count(),
        'total_elections': Election.query.count(),
        'total_votes_registered': Vote.query.count(),
        'blockchain_blocks': len(blockchain.chain),
        'blockchain_pending_votes': len(blockchain.pending_votes),
        'blockchain_valid': blockchain.is_chain_valid()
    }), 200


# ============================================================
# RUTAS: INICIALIZACIÓN
# ============================================================

@app.route('/api/init', methods=['POST'])
def initialize():
    """
    Endpoint para inicializar la base de datos con datos de prueba.
    En producción: proteger con autenticación.
    """
    seed_database()
    return jsonify({'message': 'Base de datos inicializada'}), 200


# ============================================================
# MANEJO DE ERRORES
# ============================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Ruta no encontrada'}), 404


@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Error interno del servidor'}), 500


# ============================================================
# PUNTO DE ENTRADA
# ============================================================

if __name__ == '__main__':
    with app.app_context():
        seed_database()  # Inicializar BD al arrancar
    
    print("🚀 VTB API iniciada en http://localhost:5000")
    print("📊 Base de datos: SQLite")
    print("⛓️  Blockchain: Simulada (educativa)")
    print("🔐 CORS habilitado para React")
    
    app.run(host='0.0.0.0', port=5000, debug=True)