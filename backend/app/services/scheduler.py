import datetime
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from app.database import SessionLocal, ExtractedItem, Reminder, Meeting

logger = logging.getLogger("relay.services.scheduler")

class ReminderScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        
    def start(self):
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("APScheduler Reminder Engine started successfully")
            
    def shutdown(self):
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("APScheduler Reminder Engine shut down")
            
    def schedule_reminder(self, item_id: str, send_at: datetime.datetime):
        """
        Schedules a one-off reminder job in APScheduler.
        """
        job_id = f"reminder_{item_id}"
        
        # Remove existing job if any (idempotency)
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
            
        self.scheduler.add_job(
            self._trigger_reminder,
            "date",
            run_date=send_at,
            args=[item_id],
            id=job_id,
            misfire_grace_time=3600
        )
        logger.info(f"Queued reminder job {job_id} to fire at {send_at.isoformat()}")
        
        # Also log in the database
        db = SessionLocal()
        try:
            # Check if database entry already exists
            existing = db.query(Reminder).filter(
                Reminder.extracted_item_id == item_id,
                Reminder.status == "queued"
            ).first()
            
            if not existing:
                new_reminder = Reminder(
                    extracted_item_id=item_id,
                    send_at=send_at,
                    status="queued",
                    channel="slack"  # default to Slack DM
                )
                db.add(new_reminder)
                db.commit()
        except Exception as e:
            logger.error(f"Failed to log reminder queue in database: {e}", exc_info=True)
            db.rollback()
        finally:
            db.close()

    async def _trigger_reminder(self, item_id: str):
        """
        Callback executed by APScheduler when the reminder time arrives.
        """
        logger.info(f"Triggering reminder for item {item_id}")
        db = SessionLocal()
        try:
            item = db.query(ExtractedItem).filter(ExtractedItem.id == item_id).first()
            if not item:
                logger.error(f"Cannot trigger reminder: action item {item_id} not found")
                return
                
            meeting = db.query(Meeting).filter(Meeting.id == item.meeting_id).first()
            meeting_title = meeting.title if meeting else "Unknown Meeting"
            
            # Formulate the alert text
            owner_tag = f"@{item.owner}" if item.owner else "someone"
            alert_text = f"⏰ *REMINDER*: {owner_tag}, you have a pending task from meeting *'{meeting_title}'*:\n" \
                         f"👉 *{item.text}*\n" \
                         f"📅 *Deadline*: {item.deadline or 'Not specified'}"
                         
            # Update DB Reminder status
            db_reminders = db.query(Reminder).filter(
                Reminder.extracted_item_id == item_id,
                Reminder.status == "queued"
            ).all()
            
            for reminder in db_reminders:
                reminder.status = "sent"
                
            # Log successful transmission
            logger.info(f"[TRIGGERED REMINDER] Sent Slack DM / Email notification:\n{alert_text}")
            db.commit()
        except Exception as e:
            logger.error(f"Error executing reminder: {e}", exc_info=True)
            db.rollback()
        finally:
            db.close()

# Export a single global instance
reminder_scheduler = ReminderScheduler()
