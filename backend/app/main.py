import os
import logging
import asyncio
import datetime
from typing import List, Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("relay.main")

from app.config import settings
from app import database
from app.database import get_db, Meeting, Transcript, ExtractedItem, IntegrationLog, Reminder
from app.services.recall_service import RecallService
from app.services.scheduler import reminder_scheduler
from app.utils.date_parser import parse_relative_date

app = FastAPI(title="Relay - Real-Time Meeting Intelligence Agent")

# Allow CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, meeting_id: str, websocket: WebSocket):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)
        logger.info(f"WebSocket client connected to meeting {meeting_id}")

    def disconnect(self, meeting_id: str, websocket: WebSocket):
        if meeting_id in self.active_connections:
            self.active_connections[meeting_id].remove(websocket)
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]
        logger.info(f"WebSocket client disconnected from meeting {meeting_id}")

    async def broadcast(self, meeting_id: str, message: Dict[str, Any]):
        if meeting_id in self.active_connections:
            for connection in self.active_connections[meeting_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.debug(f"Failed to send websocket message: {e}")

manager = ConnectionManager()

# Graceful DB Setup on Startup
@app.on_event("startup")
def startup_event():
    # Start APScheduler
    reminder_scheduler.start()
    
    # Try connecting to Supabase PostgreSQL, fallback to SQLite if offline/empty
    try:
        logger.info(f"Connecting to database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}")
        database.init_db()
        logger.info("Successfully connected to Supabase/PostgreSQL database.")
    except Exception as e:
        logger.warning(f"Could not connect to primary PostgreSQL database: {e}")
        logger.warning("Supabase URL offline or unconfigured. Falling back to local SQLite 'relay.db' for development...")
        
        import sqlalchemy
        database.engine = sqlalchemy.create_engine("sqlite:///./relay.db", connect_args={"check_same_thread": False})
        database.SessionLocal = sqlalchemy.orm.sessionmaker(autocommit=False, autoflush=False, bind=database.engine)
        database.init_db()
        logger.info("Successfully initialized offline SQLite database fallback.")

@app.on_event("shutdown")
def shutdown_event():
    # Stop APScheduler
    reminder_scheduler.shutdown()

# --- Post-Meeting Execution Callback ---
async def on_meeting_completed(meeting_id: str):
    logger.info(f"Starting post-meeting pipeline callback for meeting {meeting_id}")
    
    db = database.SessionLocal()
    try:
        # Broadcast that integrations are running
        await manager.broadcast(meeting_id, {
            "type": "status_update",
            "data": {"message": "Meeting ended. Running final agent compilation & integrations..."}
        })
        
        # 1. Run final LangGraph pipeline to merge & deduplicate all items
        from app.agents.graph import run_agent_pipeline_for_meeting
        await run_agent_pipeline_for_meeting(meeting_id, db)
        
        # 2. Execute integrations autonomously (Gmail, Slack, Notion, Reminders)
        from app.services.integrations import IntegrationService
        await IntegrationService.execute_all_followups(meeting_id, db)
        
        # 3. Pull integration logs and broadcast to UI
        logs = db.query(IntegrationLog).filter(IntegrationLog.meeting_id == meeting_id).all()
        logs_data = [
            {"service": l.service, "status": l.status, "details": l.details}
            for l in logs
        ]
        await manager.broadcast(meeting_id, {
            "type": "integrations",
            "data": logs_data
        })
        
        # Update meeting status to completed in database
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting:
            meeting.status = "completed"
            meeting.finished_at = datetime.datetime.utcnow()
            db.commit()
            
        await manager.broadcast(meeting_id, {
            "type": "meeting_completed",
            "data": {"status": "completed"}
        })
        
        await manager.broadcast(meeting_id, {
            "type": "status_update",
            "data": {"message": "All post-meeting tasks completed autonomously!"}
        })
        
    except Exception as e:
        logger.error(f"Error in on_meeting_completed execution: {e}", exc_info=True)
    finally:
        db.close()

# --- HTTP Endpoints ---

@app.post("/api/meetings")
def create_meeting(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Creates a new meeting workspace and launches a bot (or simulator).
    """
    url = payload.get("url")
    title = payload.get("title", "Sync Meeting")
    simulate = payload.get("simulate", True)
    
    if not url:
        raise HTTPException(status_code=400, detail="Meeting URL is required")
        
    # Create database entry
    meeting = Meeting(
        title=title,
        url=url,
        status="active" if simulate else "scheduled",
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    
    # Trigger bot
    bot_id = RecallService.create_bot(url, title)
    meeting.recall_bot_id = bot_id
    db.commit()
    
    # If simulation, launch background task
    if simulate:
        RecallService.start_simulation(
            meeting.id,
            lambda: database.SessionLocal(),
            manager.broadcast,
            on_meeting_completed
        )
        
    return {
        "id": meeting.id,
        "title": meeting.title,
        "url": meeting.url,
        "status": meeting.status,
        "recall_bot_id": meeting.recall_bot_id
    }

@app.get("/api/meetings")
def list_meetings(db: Session = Depends(get_db)):
    meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "url": m.url,
            "status": m.status,
            "created_at": m.created_at.isoformat(),
            "finished_at": m.finished_at.isoformat() if m.finished_at else None
        } for m in meetings
    ]

@app.get("/api/meetings/{id}")
def get_meeting(id: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    transcripts = db.query(Transcript).filter(Transcript.meeting_id == id).order_by(Transcript.created_at.asc()).all()
    extractions = db.query(ExtractedItem).filter(ExtractedItem.meeting_id == id).all()
    logs = db.query(IntegrationLog).filter(IntegrationLog.meeting_id == id).all()
    
    return {
        "id": meeting.id,
        "title": meeting.title,
        "url": meeting.url,
        "status": meeting.status,
        "created_at": meeting.created_at.isoformat(),
        "finished_at": meeting.finished_at.isoformat() if meeting.finished_at else None,
        "transcripts": [
            {"speaker": t.speaker, "text": t.text, "timestamp": t.timestamp, "created_at": t.created_at.isoformat()}
            for t in transcripts
        ],
        "extracted_items": [
            {
                "id": e.id,
                "category": e.category,
                "text": e.text,
                "owner": e.owner,
                "deadline": e.deadline,
                "confidence_score": e.confidence_score,
                "status": e.status,
                "clarification_question": e.clarification_question,
                "user_response": e.user_response
            } for e in extractions
        ],
        "integrations_logs": [
            {"service": l.service, "status": l.status, "details": l.details}
            for l in logs
        ]
    }

@app.delete("/api/meetings/{id}")
def delete_meeting(id: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    db.delete(meeting)
    db.commit()
    return {"status": "success", "message": "Meeting deleted"}

@app.post("/api/meetings/{id}/clarify")
async def resolve_clarification(
    id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    User resolves a low-confidence action item clarification prompt.
    """
    item_id = payload.get("item_id")
    response_text = payload.get("response")  # E.g. "Use the staging account"
    edited_text = payload.get("edited_text")  # E.g. "Set up staging pipeline on AWS dev/staging account"
    edited_owner = payload.get("edited_owner")
    edited_deadline = payload.get("edited_deadline")
    
    item = db.query(ExtractedItem).filter(ExtractedItem.id == item_id, ExtractedItem.meeting_id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Extracted item not found")
        
    item.user_response = response_text
    item.status = "approved"
    item.confidence_score = 1.0  # Promoted to high confidence since resolved by user
    
    if edited_text:
        item.text = edited_text
    if edited_owner:
        item.owner = edited_owner
    if edited_deadline:
        item.deadline = edited_deadline
        item.resolved_deadline = parse_relative_date(edited_deadline, datetime.datetime.now())
        
    db.commit()
    db.refresh(item)
    
    # Broadcast updated items to clients
    extractions = db.query(ExtractedItem).filter(ExtractedItem.meeting_id == id).all()
    extractions_data = [
        {
            "id": e.id,
            "category": e.category,
            "text": e.text,
            "owner": e.owner,
            "deadline": e.deadline,
            "confidence_score": e.confidence_score,
            "status": e.status,
            "clarification_question": e.clarification_question,
            "user_response": e.user_response
        } for e in extractions
    ]
    
    await manager.broadcast(id, {
        "type": "extractions",
        "data": extractions_data
    })
    
    await manager.broadcast(id, {
        "type": "status_update",
        "data": {"message": f"Clarified item: '{item.text}' assigned to {item.owner}"}
    })
    
    return {"status": "success", "item": {"id": item.id, "status": item.status}}

@app.post("/api/meetings/{id}/approve")
async def approve_or_edit_item(
    id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Allows user to directly edit or toggle/approve/ignore any extraction on the fly.
    """
    item_id = payload.get("item_id")
    action = payload.get("action", "approve")  # approve, ignore, edit
    edited_text = payload.get("text")
    edited_owner = payload.get("owner")
    edited_deadline = payload.get("deadline")
    
    item = db.query(ExtractedItem).filter(ExtractedItem.id == item_id, ExtractedItem.meeting_id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Extracted item not found")
        
    if action == "ignore":
        item.status = "ignored"
    else:
        item.status = "approved"
        item.confidence_score = 1.0
        if edited_text:
            item.text = edited_text
        if edited_owner:
            item.owner = edited_owner
        if edited_deadline:
            item.deadline = edited_deadline
            item.resolved_deadline = parse_relative_date(edited_deadline, datetime.datetime.now())
            
    db.commit()
    db.refresh(item)
    
    # Broadcast update
    extractions = db.query(ExtractedItem).filter(ExtractedItem.meeting_id == id).all()
    extractions_data = [
        {
            "id": e.id,
            "category": e.category,
            "text": e.text,
            "owner": e.owner,
            "deadline": e.deadline,
            "confidence_score": e.confidence_score,
            "status": e.status,
            "clarification_question": e.clarification_question,
            "user_response": e.user_response
        } for e in extractions
    ]
    
    await manager.broadcast(id, {
        "type": "extractions",
        "data": extractions_data
    })
    
    return {"status": "success"}

# --- Webhooks for MeetingBaas ---

@app.post("/api/webhooks/meetingbaas")
async def meetingbaas_webhook(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """
    Handles live webhook integrations from MeetingBaas.
    When a meeting completes, downloads the transcript JSON and triggers post-meeting tasks.
    """
    event = payload.get("event")
    data = payload.get("data", {})
    bot_id = payload.get("bot_id") or data.get("bot_id")
    
    logger.info(f"MeetingBaas webhook received: {event} for bot {bot_id}")
    
    # Find matching meeting
    meeting = db.query(Meeting).filter(Meeting.recall_bot_id == bot_id).first()
    if not meeting:
        logger.warning(f"No meeting found matching MeetingBaas bot id: {bot_id}")
        return {"status": "ignored"}
        
    status_str = str(payload.get("status", "")).lower()
    
    if event in ["joined", "bot.joined", "meeting.started"] or (event == "bot.status_change" and any(s in status_str for s in ["in_call", "recording", "active"])):
        meeting.status = "active"
        db.commit()
        await manager.broadcast(meeting.id, {
            "type": "meeting_active",
            "data": {"status": "active"}
        })
        await manager.broadcast(meeting.id, {
            "type": "status_update",
            "data": {"message": "Relay bot successfully entered the meeting call."}
        })
        logger.info(f"MeetingBaas bot {bot_id} joined meeting {meeting.id}. Status updated to active.")
        
    elif event in ["complete", "bot.completed", "meeting.completed"]:
        transcript_url = (
            data.get("transcription") or
            data.get("transcript_url") or
            payload.get("transcription") or
            payload.get("transcript_url")
        )
        if transcript_url:
            import urllib.request
            import json
            try:
                logger.info(f"Downloading MeetingBaas transcript from: {transcript_url}")
                with urllib.request.urlopen(transcript_url) as response:
                    transcript_json = json.loads(response.read().decode("utf-8"))
                    
                    utterances = []
                    if isinstance(transcript_json, list):
                        utterances = transcript_json
                    elif isinstance(transcript_json, dict):
                        utterances = transcript_json.get("transcript") or transcript_json.get("utterances") or []
                    
                    for utterance in utterances:
                        speaker = utterance.get("speaker") or utterance.get("speaker_id") or utterance.get("name") or "Unknown Speaker"
                        if not isinstance(speaker, str):
                            speaker = f"Speaker {speaker}"
                        text = utterance.get("text", "")
                        start_sec = utterance.get("start", 0)
                        try:
                            start_sec = float(start_sec)
                        except (TypeError, ValueError):
                            start_sec = 0.0
                        minutes = int(start_sec // 60)
                        secs = int(start_sec % 60)
                        timestamp = f"{minutes:02d}:{secs:02d}"
                        
                        db_transcript = Transcript(
                            meeting_id=meeting.id,
                            speaker=speaker,
                            text=text,
                            timestamp=timestamp
                        )
                        db.add(db_transcript)
                        
                        await manager.broadcast(meeting.id, {
                            "type": "transcript",
                            "data": {
                                "speaker": speaker,
                                "text": text,
                                "timestamp": timestamp,
                                "created_at": db_transcript.created_at.isoformat() if hasattr(db_transcript, "created_at") else datetime.datetime.utcnow().isoformat()
                            }
                        })
                    db.commit()
            except Exception as e:
                logger.error(f"Error fetching MeetingBaas transcript: {e}", exc_info=True)
                
        # Set meeting status to processing
        meeting.status = "processing"
        db.commit()
        
        await manager.broadcast(meeting.id, {
            "type": "meeting_processing",
            "data": {"status": "processing"}
        })
        
        # Trigger post-meeting integrations and analysis
        asyncio.create_task(on_meeting_completed(meeting.id))
        
    elif event == "bot.status_change" and any(s in status_str for s in ["ended", "completed", "failed", "leave", "exit"]):
        meeting.status = "processing"
        db.commit()
        await manager.broadcast(meeting.id, {
            "type": "meeting_processing",
            "data": {"status": "processing"}
        })
        await manager.broadcast(meeting.id, {
            "type": "status_update",
            "data": {"message": "Relay bot has left the call. Processing transcript..."}
        })
        logger.info(f"MeetingBaas bot {bot_id} status changed to {status_str}. Status updated to processing.")
        
    return {"status": "processed"}

# --- Webhooks for Recall.ai ---

@app.post("/api/webhooks/recall")
async def recall_webhook(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """
    Handles live webhook integrations from Recall.ai.
    """
    event = payload.get("event")
    bot_id = payload.get("data", {}).get("bot_id")
    
    logger.info(f"Recall.ai webhook received: {event} for bot {bot_id}")
    
    # Find matching meeting
    meeting = db.query(Meeting).filter(Meeting.recall_bot_id == bot_id).first()
    if not meeting:
        logger.warning(f"No meeting found matching Recall bot id: {bot_id}")
        return {"status": "ignored"}
        
    if event == "bot.done":
        # Meeting has concluded! Trigger execution
        meeting.status = "processing"
        db.commit()
        
        await manager.broadcast(meeting.id, {
            "type": "meeting_processing",
            "data": {"status": "processing"}
        })
        
        # Trigger followups asynchronously
        asyncio.create_task(on_meeting_completed(meeting.id))
        
    elif event == "bot.transcript_chunk":
        # Real-time transcript segment has arrived
        chunk = payload.get("data", {}).get("transcript", {})
        speaker = chunk.get("speaker", "Participant")
        text = chunk.get("text", "")
        timestamp = chunk.get("timestamp", "00:00")
        
        # Save transcript to DB
        db_transcript = Transcript(
            meeting_id=meeting.id,
            speaker=speaker,
            text=text,
            timestamp=timestamp
        )
        db.add(db_transcript)
        db.commit()
        
        # Broadcast to client dashboard
        await manager.broadcast(meeting.id, {
            "type": "transcript",
            "data": {
                "speaker": speaker,
                "text": text,
                "timestamp": timestamp,
                "created_at": db_transcript.created_at.isoformat()
            }
        })
        
        # Trigger incremental analysis (e.g. check buffer size and execute agent)
        try:
            from app.agents.graph import run_agent_pipeline_for_meeting
            await run_agent_pipeline_for_meeting(meeting.id, db)
            
            # Load and broadcast updated extractions to UI
            extractions = db.query(ExtractedItem).filter(ExtractedItem.meeting_id == meeting.id).all()
            extractions_data = [
                {
                    "id": e.id,
                    "category": e.category,
                    "text": e.text,
                    "owner": e.owner,
                    "deadline": e.deadline,
                    "confidence_score": e.confidence_score,
                    "status": e.status,
                    "clarification_question": e.clarification_question,
                    "user_response": e.user_response
                } for e in extractions
            ]
            await manager.broadcast(meeting.id, {
                "type": "extractions",
                "data": extractions_data
            })
        except Exception as err:
            logger.error(f"Error in webhook real-time agent execution: {err}")
            
    return {"status": "processed"}

# --- WebSocket server ---

@app.websocket("/api/ws/{meeting_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str):
    await manager.connect(meeting_id, websocket)
    try:
        while True:
            # Maintain active connection
            data = await websocket.receive_text()
            # Can receive user ping or heartbeat
            logger.debug(f"Received websocket ping: {data}")
    except WebSocketDisconnect:
        manager.disconnect(meeting_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error for meeting {meeting_id}: {e}")
        manager.disconnect(meeting_id, websocket)

if __name__ == "__main__":
    import uvicorn
    # Start FastAPI server
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
