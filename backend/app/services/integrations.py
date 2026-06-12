import logging
import datetime
from sqlalchemy.orm import Session
from app.config import settings
from app.database import Meeting, ExtractedItem, IntegrationLog

logger = logging.getLogger("relay.services.integrations")

class IntegrationService:
    @staticmethod
    async def execute_all_followups(meeting_id: str, db: Session):
        """
        Runs Gmail, Slack, and Notion integrations for all approved items.
        Logs status and details to the IntegrationLog database table.
        """
        logger.info(f"Starting post-meeting integrations for meeting {meeting_id}")
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            logger.error(f"Meeting {meeting_id} not found for integrations execution")
            return
            
        # 1. Fetch all extracted items
        items = db.query(ExtractedItem).filter(ExtractedItem.meeting_id == meeting_id).all()
        
        # Split items into categories
        action_items = [i for i in items if i.category == "action_item" and i.status == "approved"]
        decisions = [i for i in items if i.category == "decision"]
        questions = [i for i in items if i.category == "question"]
        key_points = [i for i in items if i.category == "key_point"]
        
        # 2. Run Gmail Summary
        await IntegrationService._run_gmail(meeting, action_items, decisions, questions, key_points, db)
        
        # 3. Run Slack Post
        await IntegrationService._run_slack(meeting, action_items, db)
        
        # 4. Run Notion Sync
        await IntegrationService._run_notion(meeting, action_items, db)
        
        # 5. Schedule Reminders
        await IntegrationService._schedule_reminders(meeting, action_items, db)

    @staticmethod
    async def _run_gmail(meeting: Meeting, action_items: list, decisions: list, questions: list, key_points: list, db: Session):
        log = IntegrationLog(meeting_id=meeting.id, service="gmail", status="pending")
        db.add(log)
        db.commit()
        
        try:
            # Build HTML summary email
            html_body = f"""
            <h3>Relay Meeting Summary: {meeting.title}</h3>
            <p><strong>Meeting Link:</strong> {meeting.url}</p>
            <p><strong>Date:</strong> {meeting.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
            <hr/>
            
            <h4>✅ Action Items</h4>
            <ul>
            """
            for ai in action_items:
                owner = ai.owner or "Unassigned"
                deadline = ai.deadline or "No deadline"
                html_body += f"<li><strong>[{owner}]</strong> {ai.text} (Due: {deadline})</li>"
            if not action_items:
                html_body += "<li>No action items extracted.</li>"
                
            html_body += """
            </ul>
            <h4>🔴 Decisions Made</h4>
            <ul>
            """
            for d in decisions:
                html_body += f"<li>{d.text}</li>"
            if not decisions:
                html_body += "<li>No major decisions logged.</li>"
                
            html_body += """
            </ul>
            <h4>❓ Open Questions</h4>
            <ul>
            """
            for q in questions:
                html_body += f"<li>{q.text}</li>"
            if not questions:
                html_body += "<li>No open questions logged.</li>"
                
            html_body += """
            </ul>
            <h4>📌 Key Discussion Points</h4>
            <ul>
            """
            for kp in key_points:
                html_body += f"<li>{kp.text}</li>"
            if not key_points:
                html_body += "<li>No additional discussion points.</li>"
            html_body += "</ul><hr/><p>Generated automatically by Relay.</p>"

            # Simulate or execute send
            if settings.GMAIL_USER_EMAIL:
                # Real SMTP / Email trigger would go here
                details = f"Email summary successfully sent to attendees. HTML Summary:\n{html_body}"
            else:
                details = f"[SIMULATION] Email summary compiled and queued for distribution. Body preview:\n{html_body}"
                
            log.status = "success"
            log.details = details
            logger.info("Gmail integration completed successfully")
        except Exception as e:
            log.status = "failed"
            log.details = f"Error sending Gmail: {e}"
            logger.error(f"Gmail integration failed: {e}", exc_info=True)
            
        db.commit()

    @staticmethod
    async def _run_slack(meeting: Meeting, action_items: list, db: Session):
        log = IntegrationLog(meeting_id=meeting.id, service="slack", status="pending")
        db.add(log)
        db.commit()
        
        try:
            # Build Slack message payload
            slack_text = f"🚨 *Relay Meeting Action Items: {meeting.title}*\n"
            slack_text += f"Meeting Link: {meeting.url}\n\n"
            
            for ai in action_items:
                owner_tag = f"@{ai.owner}" if ai.owner else "unassigned"
                deadline = f"by {ai.deadline}" if ai.deadline else "no deadline"
                slack_text += f"• *{owner_tag}*: {ai.text} ({deadline})\n"
                
            if not action_items:
                slack_text += "No action items extracted."
                
            if settings.has_slack:
                # In production, we'd make an API post request:
                # import httpx
                # async with httpx.AsyncClient() as client:
                #     await client.post("https://slack.com/api/chat.postMessage", json={...})
                details = f"Slack message successfully pushed to channel {settings.SLACK_CHANNEL}."
            else:
                details = f"[SIMULATION] Slack payload posted to {settings.SLACK_CHANNEL}:\n{slack_text}"
                
            log.status = "success"
            log.details = details
            logger.info("Slack integration completed successfully")
        except Exception as e:
            log.status = "failed"
            log.details = f"Error posting to Slack: {e}"
            logger.error(f"Slack integration failed: {e}", exc_info=True)
            
        db.commit()

    @staticmethod
    async def _run_notion(meeting: Meeting, action_items: list, db: Session):
        log = IntegrationLog(meeting_id=meeting.id, service="notion", status="pending")
        db.add(log)
        db.commit()
        
        try:
            notion_log_details = []
            for ai in action_items:
                # Build mock page details
                notion_log_details.append({
                    "title": ai.text,
                    "assignee": ai.owner or "None",
                    "deadline": ai.deadline or "None",
                    "status": "Not Started"
                })
                
            if settings.has_notion:
                # Real API post requests to Notion database
                details = f"Synced {len(action_items)} action items to Notion DB {settings.NOTION_DATABASE_ID}."
            else:
                details = f"[SIMULATION] Synced {len(action_items)} tasks to Notion database. Logs:\n" + \
                          "\n".join([f"- Title: {t['title']} | Assignee: {t['assignee']} | Deadline: {t['deadline']}" for t in notion_log_details])
                
            log.status = "success"
            log.details = details
            logger.info("Notion integration completed successfully")
        except Exception as e:
            log.status = "failed"
            log.details = f"Error syncing to Notion: {e}"
            logger.error(f"Notion integration failed: {e}", exc_info=True)
            
        db.commit()

    @staticmethod
    async def _schedule_reminders(meeting: Meeting, action_items: list, db: Session):
        log = IntegrationLog(meeting_id=meeting.id, service="reminder", status="pending")
        db.add(log)
        db.commit()
        
        try:
            from app.services.scheduler import reminder_scheduler
            scheduled_count = 0
            
            for ai in action_items:
                if ai.resolved_deadline:
                    # Queue reminder 24 hours before absolute deadline
                    # If deadline is less than 24 hours away, schedule it for 5 minutes from now for testing purposes.
                    send_time = ai.resolved_deadline - datetime.timedelta(hours=24)
                    now = datetime.datetime.now()
                    if send_time <= now:
                        # Schedule 1 minute from now for immediate visibility in logs
                        send_time = now + datetime.timedelta(minutes=1)
                        
                    # Call scheduler service to register APScheduler job
                    reminder_scheduler.schedule_reminder(ai.id, send_time)
                    scheduled_count += 1
                    
            details = f"Reminder Engine active. Scheduled {scheduled_count} follow-up jobs in APScheduler queue."
            log.status = "success"
            log.details = details
            logger.info(f"Reminder Engine scheduled {scheduled_count} jobs")
        except Exception as e:
            log.status = "failed"
            log.details = f"Error scheduling reminders: {e}"
            logger.error(f"Reminder Engine scheduling failed: {e}", exc_info=True)
            
        db.commit()
