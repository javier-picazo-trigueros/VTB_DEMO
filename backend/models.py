"""
VTB (Vote Through Blockchain) - Modelos de Base de Datos SQL
============================================================
Define los modelos SQLAlchemy para gestionar usuarios y elecciones.
Esta capa Web2 es responsable de:
- Autenticación y autorización de usuarios
- Censo electoral (quién puede votar)
- Datos de elecciones
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from enum import Enum

db = SQLAlchemy()


class UserRole(Enum):
    """
    Enumeración de roles de usuario.
    """
    ADMIN = "admin"
    VOTANTE = "votante"


class User(db.Model):
    """
    Modelo de Usuario.
    Representa los usuarios registrados en el sistema.
    
    Atributos:
        id: Identificador único
        email: Email único del usuario
        password: Contraseña (en producción debería estar hasheada)
        role: Rol del usuario (admin o votante)
        created_at: Timestamp de creación
    """
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.Enum(UserRole), default=UserRole.VOTANTE, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relación con votos
    votes = db.relationship('Vote', backref='voter', lazy=True)
    
    def to_dict(self):
        """Serializa el usuario a diccionario."""
        return {
            'id': self.id,
            'email': self.email,
            'role': self.role.value,
            'created_at': self.created_at.isoformat()
        }


class Election(db.Model):
    """
    Modelo de Elección.
    Representa una elección que se puede realizar (e.g., "Delegado de curso").
    
    Atributos:
        id: Identificador único
        title: Título de la elección
        description: Descripción detallada
        is_active: Si la elección está activa para votar
        candidates: Lista de candidatos (JSON string)
        created_at: Timestamp de creación
        closed_at: Timestamp de cierre
    """
    __tablename__ = 'elections'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    candidates = db.Column(db.JSON, default=list)  # Lista de candidatos
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    closed_at = db.Column(db.DateTime, nullable=True)
    
    # Relación con votos
    votes = db.relationship('Vote', backref='election', lazy=True)
    
    def to_dict(self):
        """Serializa la elección a diccionario."""
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'is_active': self.is_active,
            'candidates': self.candidates,
            'created_at': self.created_at.isoformat(),
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'vote_count': len(self.votes)
        }


class Vote(db.Model):
    """
    Modelo de Voto.
    Registra la relación entre usuario e elección, pero NO el candidato
    (eso está en la Blockchain para mantener anonimato).
    
    Atributos:
        id: Identificador único
        user_id: FK a User (verificación de censo)
        election_id: FK a Election
        blockchain_tx_hash: Hash de la transacción en blockchain
        created_at: Timestamp del voto
    """
    __tablename__ = 'votes'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    election_id = db.Column(db.Integer, db.ForeignKey('elections.id'), nullable=False)
    blockchain_tx_hash = db.Column(db.String(256), nullable=False)  # Hash SHA-256 del voto
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        """Serializa el registro de voto a diccionario."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'election_id': self.election_id,
            'blockchain_tx_hash': self.blockchain_tx_hash,
            'created_at': self.created_at.isoformat()
        }
