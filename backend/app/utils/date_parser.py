import datetime
import re
from typing import Optional

def parse_relative_date(text: str, anchor_date: Optional[datetime.datetime] = None) -> datetime.datetime:
    """
    Parses natural language relative dates into absolute datetime objects.
    e.g., 'by Friday', 'tomorrow morning', 'in 3 days', 'end of week'.
    """
    if not anchor_date:
        anchor_date = datetime.datetime.now()
        
    text = text.lower().strip()
    
    # Defaults to end of work day (6:00 PM) for the resolved date
    default_time = {"hour": 18, "minute": 0, "second": 0, "microsecond": 0}
    
    # Helper to wrap datetime with default time
    def with_default_time(dt: datetime.datetime) -> datetime.datetime:
        return dt.replace(**default_time)

    # 1. "today", "end of day", "by eod"
    if "today" in text or "end of day" in text or "eod" in text:
        return with_default_time(anchor_date)
        
    # 2. "tomorrow"
    if "tomorrow" in text:
        target = anchor_date + datetime.timedelta(days=1)
        if "morning" in text:
            return target.replace(hour=9, minute=0, second=0, microsecond=0)
        if "afternoon" in text:
            return target.replace(hour=14, minute=0, second=0, microsecond=0)
        return with_default_time(target)
        
    # 3. "in X days" or "in X weeks"
    match = re.search(r"in\s+(\d+)\s+(day|week|s)", text)
    if match:
        amount = int(match.group(1))
        unit = match.group(2)
        if "week" in unit:
            return with_default_time(anchor_date + datetime.timedelta(weeks=amount))
        else:
            return with_default_time(anchor_date + datetime.timedelta(days=amount))
            
    # 4. "by next monday", "by friday", "on wednesday"
    days_of_week = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6
    }
    
    for day_str, day_num in days_of_week.items():
        if day_str in text:
            current_day = anchor_date.weekday()
            days_ahead = day_num - current_day
            if "next" in text:
                days_ahead += 7
            elif days_ahead <= 0:  # Already passed this week, refer to next week's day
                days_ahead += 7
            return with_default_time(anchor_date + datetime.timedelta(days=days_ahead))
            
    # 5. "end of the week", "end of week"
    if "end of the week" in text or "end of week" in text:
        # Resolve to Friday of current week
        current_day = anchor_date.weekday()
        days_ahead = 4 - current_day  # Friday is index 4
        if days_ahead < 0:  # If it's already weekend, resolve to next Friday
            days_ahead += 7
        return with_default_time(anchor_date + datetime.timedelta(days=days_ahead))

    # 6. "end of sprint"
    if "end of sprint" in text or "end of the sprint" in text:
        # Default to 2 weeks from now (on a Friday)
        current_day = anchor_date.weekday()
        days_ahead = 4 - current_day + 7  # Next Friday
        return with_default_time(anchor_date + datetime.timedelta(days=days_ahead))

    # Fallback: Default to 3 days from anchor_date
    return with_default_time(anchor_date + datetime.timedelta(days=3))
