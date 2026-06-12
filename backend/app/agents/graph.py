import logging
from typing import TypedDict, List, Dict, Any
from sqlalchemy.orm import Session
from langgraph.graph import StateGraph, END

from app.database import Meeting, Transcript, ExtractedItem
from app.agents.nodes import run_extraction, run_scoring_and_clarification, run_deduplication
from app.utils.date_parser import parse_relative_date

logger = logging.getLogger("relay.agents.graph")

class AgentState(TypedDict):
    meeting_id: str
    transcripts: List[Dict[str, Any]]
    existing_items: List[Dict[str, Any]]
    extracted_items: List[Dict[str, Any]]
    final_items: List[Dict[str, Any]]

# Assemble the LangGraph StateGraph
workflow = StateGraph(AgentState)

def extract_node(state: AgentState) -> Dict[str, Any]:
    logger.info(f"LangGraph: running extraction node for meeting {state['meeting_id']}")
    items = run_extraction(state["transcripts"])
    return {"extracted_items": items}

def score_and_clarify_node(state: AgentState) -> Dict[str, Any]:
    logger.info("LangGraph: running confidence score & clarification node")
    scored = run_scoring_and_clarification(state["extracted_items"])
    return {"extracted_items": scored}

def deduplicate_node(state: AgentState) -> Dict[str, Any]:
    logger.info("LangGraph: running deduplication node against existing database items")
    final = run_deduplication(state["existing_items"], state["extracted_items"])
    return {"final_items": final}

# Connect nodes
workflow.add_node("extract", extract_node)
workflow.add_node("score_and_clarify", score_and_clarify_node)
workflow.add_node("deduplicate", deduplicate_node)

workflow.set_entry_point("extract")
workflow.add_edge("extract", "score_and_clarify")
workflow.add_edge("score_and_clarify", "deduplicate")
workflow.add_edge("deduplicate", END)

# Compile the graph
agent_pipeline = workflow.compile()

async def run_agent_pipeline_for_meeting(meeting_id: str, db: Session):
    """
    Utility function to run the LangGraph pipeline for a specific meeting,
    updating the SQLite database with new extractions.
    """
    # 1. Fetch data from DB
    transcripts = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).all()
    existing_items = db.query(ExtractedItem).filter(ExtractedItem.meeting_id == meeting_id).all()
    
    # 2. Map DB models to state dicts
    transcripts_list = [
        {"speaker": t.speaker, "text": t.text, "timestamp": t.timestamp}
        for t in transcripts
    ]
    existing_list = [
        {
            "id": i.id,
            "category": i.category,
            "text": i.text,
            "owner": i.owner,
            "deadline": i.deadline,
            "confidence_score": i.confidence_score,
            "status": i.status,
            "clarification_question": i.clarification_question
        }
        for i in existing_items
    ]
    
    # 3. Invoke LangGraph
    state = {
        "meeting_id": meeting_id,
        "transcripts": transcripts_list,
        "existing_items": existing_list,
        "extracted_items": [],
        "final_items": []
    }
    
    try:
        # Run graph execution
        result = agent_pipeline.invoke(state)
        final_items = result.get("final_items", [])
        
        # 4. Save updates back to database
        # We perform an upsert based on matching categories and text.
        for item in final_items:
            # Check if this item already exists in the database
            db_item = None
            if "id" in item:
                db_item = db.query(ExtractedItem).filter(ExtractedItem.id == item["id"]).first()
            
            if not db_item:
                # Fallback to search by category and text overlap
                db_item = db.query(ExtractedItem).filter(
                    ExtractedItem.meeting_id == meeting_id,
                    ExtractedItem.category == item["category"],
                    ExtractedItem.text == item["text"]
                ).first()
                
            if db_item:
                # Update attributes
                db_item.owner = item.get("owner", db_item.owner)
                db_item.deadline = item.get("deadline", db_item.deadline)
                db_item.confidence_score = item.get("confidence_score", db_item.confidence_score)
                db_item.status = item.get("status", db_item.status)
                db_item.clarification_question = item.get("clarification_question", db_item.clarification_question)
                
                # Resolve deadline if updated and exists
                if db_item.deadline and not db_item.resolved_deadline:
                    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
                    anchor = meeting.created_at if meeting else None
                    db_item.resolved_deadline = parse_relative_date(db_item.deadline, anchor)
            else:
                # Insert new item
                meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
                anchor = meeting.created_at if meeting else None
                
                resolved_dl = None
                if item.get("deadline"):
                    resolved_dl = parse_relative_date(item["deadline"], anchor)
                    
                new_db_item = ExtractedItem(
                    meeting_id=meeting_id,
                    category=item["category"],
                    text=item["text"],
                    owner=item.get("owner"),
                    deadline=item.get("deadline"),
                    resolved_deadline=resolved_dl,
                    confidence_score=item.get("confidence_score", 1.0),
                    status=item.get("status", "approved"),
                    clarification_question=item.get("clarification_question")
                )
                db.add(new_db_item)
                
        db.commit()
        logger.info(f"LangGraph: successfully updated database for meeting {meeting_id} with {len(final_items)} items")
    except Exception as e:
        logger.error(f"LangGraph pipeline invocation failed: {e}", exc_info=True)
        db.rollback()
