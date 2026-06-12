import datetime
import uuid
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

from app.config import settings

Base = declarative_base()

class Meeting(Base):
    __tablename__ = "meetings"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    url = Column(String(512), nullable=False)
    status = Column(String(50), default="scheduled")  # scheduled, active, completed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    recall_bot_id = Column(String(100), nullable=True)
    
    transcripts = relationship("Transcript", back_populates="meeting", cascade="all, delete-orphan")
    extracted_items = relationship("ExtractedItem", back_populates="meeting", cascade="all, delete-orphan")
    integrations_logs = relationship("IntegrationLog", back_populates="meeting", cascade="all, delete-orphan")

class Transcript(Base):
    __tablename__ = "transcripts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False)
    speaker = Column(String(100), nullable=False)
    text = Column(Text, nullable=False)
    timestamp = Column(String(50), nullable=False)  # e.g., "00:14:32"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    meeting = relationship("Meeting", back_populates="transcripts")

class ExtractedItem(Base):
    __tablename__ = "extracted_items"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False)
    category = Column(String(50), nullable=False)  # action_item, decision, question, key_point
    text = Column(Text, nullable=False)
    owner = Column(String(100), nullable=True)
    deadline = Column(String(100), nullable=True)  # Raw deadline, e.g. "Friday"
    resolved_deadline = Column(DateTime, nullable=True)  # Absolute datetime resolved
    confidence_score = Column(Float, default=1.0)
    status = Column(String(50), default="approved")  # pending_clarification, approved, ignored
    clarification_question = Column(Text, nullable=True)
    user_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    meeting = relationship("Meeting", back_populates="extracted_items")
    reminders = relationship("Reminder", back_populates="extracted_item", cascade="all, delete-orphan")

class IntegrationLog(Base):
    __tablename__ = "integrations_log"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False)
    service = Column(String(50), nullable=False)  # gmail, slack, notion, reminder
    status = Column(String(50), nullable=False)  # pending, success, failed
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    meeting = relationship("Meeting", back_populates="integrations_logs")

class Reminder(Base):
    __tablename__ = "reminders"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    extracted_item_id = Column(String(36), ForeignKey("extracted_items.id"), nullable=False)
    send_at = Column(DateTime, nullable=False)
    status = Column(String(50), default="queued")  # queued, sent, failed
    channel = Column(String(50), nullable=False)  # slack, email
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    extracted_item = relationship("ExtractedItem", back_populates="reminders")

# Create engine and sessionmaker for PostgreSQL
# If connection fails or URL is empty, we handle it in main.py
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
