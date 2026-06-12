import asyncio
import datetime
import logging
from typing import List, Dict, Any, Callable
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Meeting, Transcript, ExtractedItem, get_db
from app.utils.date_parser import parse_relative_date

logger = logging.getLogger("relay.recall_service")

# A pre-scripted transcript simulation for a team meeting discussing server deployment.
SIMULATED_TRANSCRIPT_SCRIPT = [
    {"speaker": "Sarah", "text": "Hi everyone, let's get started on the weekly alignment. Shiva, do you want to start with the staging deployment update?", "timestamp": "00:01:05"},
    {"speaker": "Shiva", "text": "Sure. We need to deploy the staging server by Friday so the QA team can test the new payment flow.", "timestamp": "00:01:22"},
    {"speaker": "David", "text": "I can set up the staging pipeline on AWS. But wait, I'm not sure which AWS account we should use for this? Dev or staging?", "timestamp": "00:01:50"},
    # [Ambiguous Action Item / Low Confidence: David to set up staging pipeline on AWS. Clarification: Which AWS account?]
    
    {"speaker": "Sarah", "text": "Let's decide on the database schema changes first. Shiva, did we finalize the migration scripts?", "timestamp": "00:02:15"},
    {"speaker": "Shiva", "text": "Yes, we did. The migration scripts are approved and merged into the main branch yesterday.", "timestamp": "00:02:30"},
    # [Decision: Migration scripts approved and merged into main]
    
    {"speaker": "Sarah", "text": "Perfect, that's checked off then. Also, who is writing the release notes? We need them by next week Monday.", "timestamp": "00:03:02"},
    {"speaker": "Shiva", "text": "I can handle that, Sarah. I will write the release notes by Monday.", "timestamp": "00:03:15"},
    # [High Confidence Action Item: Shiva to write release notes by Monday]
    
    {"speaker": "David", "text": "Wait, do we need to migrate the user profile upload directory to S3 or are we keeping it local for this staging phase?", "timestamp": "00:03:45"},
    {"speaker": "Sarah", "text": "That is still an open question. We haven't finalized the S3 costs and bucket policies yet.", "timestamp": "00:04:05"},
    # [Open Question: Whether to migrate user profile uploads to S3 or keep local]
    
    {"speaker": "Shiva", "text": "Alright, so David, you will deploy the staging server by Friday. I'll write the release notes. And we will leave the upload directory local for now.", "timestamp": "00:04:40"},
    {"speaker": "David", "text": "Sounds good, I will make sure the staging server is deployed and fully running by Friday.", "timestamp": "00:05:00"},
    # [High Confidence Action Item: David to deploy staging server by Friday]
    
    {"speaker": "Sarah", "text": "Awesome. That covers everything. Let's wrap up this call. Thanks, team!", "timestamp": "00:05:20"}
]

# Keep track of active simulations: {meeting_id: asyncio.Task}
active_simulations: Dict[str, asyncio.Task] = {}

class RecallService:
    @staticmethod
    def create_bot(meeting_url: str, title: str) -> str:
        """
        Creates a Recall.ai or MeetingBaas bot participant (or returns a mock bot ID in simulation mode).
        """
        import uuid
        if settings.has_recall:
            import urllib.request
            import json
            
            logger.info(f"Real Recall.ai bot requested for {meeting_url}")
            try:
                url = "https://api.recall.ai/api/v1/bot/"
                headers = {
                    "Authorization": f"Token {settings.RECALL_API_KEY}",
                    "Content-Type": "application/json"
                }
                data = {
                    "meeting_url": meeting_url,
                    "bot_name": "Relay Intelligence Bot",
                    "transcription_options": {
                        "provider": "assembly_ai"
                    }
                }
                req = urllib.request.Request(
                    url, 
                    data=json.dumps(data).encode("utf-8"), 
                    headers=headers,
                    method="POST"
                )
                with urllib.request.urlopen(req) as response:
                    res_body = response.read().decode("utf-8")
                    bot_data = json.loads(res_body)
                    bot_id = bot_data["id"]
                    logger.info(f"Recall.ai bot created successfully on platform. Bot ID: {bot_id}")
                    return bot_id
            except Exception as e:
                logger.error(f"Failed to create bot on Recall.ai: {e}", exc_info=True)
                # Fall back to returning a mock bot id so app does not crash
                bot_id = f"bot_err_{uuid.uuid4().hex[:10]}"
                return bot_id
        elif settings.has_meetingbaas:
            import urllib.request
            import json
            
            logger.info(f"Real MeetingBaas bot requested for {meeting_url}")
            try:
                url = "https://api.meetingbaas.com/v2/bots"
                headers = {
                    "x-meeting-baas-api-key": settings.MEETINGBAAS_API_KEY,
                    "Content-Type": "application/json"
                }
                data = {
                    "meeting_url": meeting_url,
                    "bot_name": "Relay Intelligence Bot"
                }
                if settings.WEBHOOK_URL:
                    data["webhook_url"] = settings.WEBHOOK_URL
                req = urllib.request.Request(
                    url, 
                    data=json.dumps(data).encode("utf-8"), 
                    headers=headers,
                    method="POST"
                )
                with urllib.request.urlopen(req) as response:
                    res_body = response.read().decode("utf-8")
                    bot_data = json.loads(res_body)
                    bot_id = bot_data["data"]["bot_id"]
                    logger.info(f"MeetingBaas bot created successfully. Bot ID: {bot_id}")
                    return bot_id
            except Exception as e:
                logger.error(f"Failed to create bot on MeetingBaas: {e}", exc_info=True)
                bot_id = f"bot_err_{uuid.uuid4().hex[:10]}"
                return bot_id
        else:
            bot_id = f"mock_bot_{uuid.uuid4().hex[:10]}"
            logger.info(f"Simulation Mode: Created virtual bot {bot_id} for URL {meeting_url}")
            return bot_id

    @staticmethod
    def stop_simulation(meeting_id: str):
        if meeting_id in active_simulations:
            task = active_simulations[meeting_id]
            task.cancel()
            del active_simulations[meeting_id]
            logger.info(f"Simulation stopped for meeting {meeting_id}")

    @staticmethod
    def start_simulation(
        meeting_id: str,
        db_session_factory: Callable[[], Session],
        broadcast_callback: Callable[[str, Dict[str, Any]], Any],
        on_meeting_done: Callable[[str], Any]
    ):
        """
        Launches a background asyncio task that streams the simulated meeting script.
        """
        task = asyncio.create_task(
            RecallService._run_simulation_loop(
                meeting_id, db_session_factory, broadcast_callback, on_meeting_done
            )
        )
        active_simulations[meeting_id] = task
        return task

    @staticmethod
    async def _run_simulation_loop(
        meeting_id: str,
        db_session_factory: Callable[[], Session],
        broadcast_callback: Callable[[str, Dict[str, Any]], Any],
        on_meeting_done: Callable[[str], Any]
    ):
        logger.info(f"Simulation loop started for meeting {meeting_id}")
        
        # We process chunks in blocks to simulate periodic LLM analysis.
        # After each block, we run the agent extraction.
        # Index thresholds in script to run agent processing
        agent_trigger_turns = [3, 7, 10]
        
        try:
            for index, turn in enumerate(SIMULATED_TRANSCRIPT_SCRIPT):
                # Calculate sleep duration based on settings.SIMULATION_SPEED_MULTIPLIER.
                # Standard sleep is 4-5 seconds per turn (scaled).
                sleep_seconds = 6.0 / settings.SIMULATION_SPEED_MULTIPLIER
                await asyncio.sleep(sleep_seconds)
                
                # Write to database
                db = db_session_factory()
                try:
                    db_transcript = Transcript(
                        meeting_id=meeting_id,
                        speaker=turn["speaker"],
                        text=turn["text"],
                        timestamp=turn["timestamp"]
                    )
                    db.add(db_transcript)
                    db.commit()
                    db.refresh(db_transcript)
                    
                    # Broadcast turn to WebSocket
                    await broadcast_callback(meeting_id, {
                        "type": "transcript",
                        "data": {
                            "speaker": db_transcript.speaker,
                            "text": db_transcript.text,
                            "timestamp": db_transcript.timestamp,
                            "created_at": db_transcript.created_at.isoformat()
                        }
                    })
                    
                    # Check if we should trigger the extraction agent mid-meeting
                    if (index + 1) in agent_trigger_turns:
                        await broadcast_callback(meeting_id, {
                            "type": "status_update",
                            "data": {"message": "Agent pipeline analyzing conversation segments..."}
                        })
                        
                        # Trigger agent processing in background
                        # This will extract items, score confidence, and write to database.
                        # We will implement this in the Agent service.
                        from app.agents.graph import run_agent_pipeline_for_meeting
                        await run_agent_pipeline_for_meeting(meeting_id, db)
                        
                        # Load updated items to broadcast
                        items = db.query(ExtractedItem).filter(ExtractedItem.meeting_id == meeting_id).all()
                        items_data = []
                        for it in items:
                            items_data.append({
                                "id": it.id,
                                "category": it.category,
                                "text": it.text,
                                "owner": it.owner,
                                "deadline": it.deadline,
                                "confidence_score": it.confidence_score,
                                "status": it.status,
                                "clarification_question": it.clarification_question
                            })
                            
                        await broadcast_callback(meeting_id, {
                            "type": "extractions",
                            "data": items_data
                        })
                        
                except Exception as e:
                    logger.error(f"Error in simulation step: {e}", exc_info=True)
                finally:
                    db.close()
            
            # Meeting ended
            db = db_session_factory()
            try:
                meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
                if meeting:
                    meeting.status = "completed"
                    meeting.finished_at = datetime.datetime.utcnow()
                    db.commit()
                
                await broadcast_callback(meeting_id, {
                    "type": "meeting_completed",
                    "data": {"status": "completed"}
                })
                
                logger.info(f"Simulated meeting {meeting_id} finished. Triggering post-meeting execution.")
                # Trigger post-meeting webhook processing
                asyncio.create_task(on_meeting_done(meeting_id))
            finally:
                db.close()
                
        except asyncio.CancelledError:
            logger.info(f"Simulation loop task for meeting {meeting_id} cancelled.")
        except Exception as e:
            logger.error(f"Simulation loop crashed: {e}", exc_info=True)
        finally:
            if meeting_id in active_simulations:
                del active_simulations[meeting_id]
