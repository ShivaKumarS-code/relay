import datetime
import pytest
from app.utils.date_parser import parse_relative_date

def test_parse_today_and_eod():
    # Thursday, June 11, 2026
    anchor = datetime.datetime(2026, 6, 11, 12, 0, 0)
    
    # "today" -> same day at 18:00 (default EOD)
    res = parse_relative_date("today", anchor)
    assert res.year == 2026
    assert res.month == 6
    assert res.day == 11
    assert res.hour == 18
    assert res.minute == 0
    
    # "end of day"
    res = parse_relative_date("end of day", anchor)
    assert res.day == 11
    assert res.hour == 18

def test_parse_tomorrow():
    anchor = datetime.datetime(2026, 6, 11, 12, 0, 0)
    
    # "tomorrow" -> June 12, 18:00
    res = parse_relative_date("tomorrow", anchor)
    assert res.day == 12
    assert res.hour == 18
    
    # "tomorrow morning" -> June 12, 9:00
    res = parse_relative_date("tomorrow morning", anchor)
    assert res.day == 12
    assert res.hour == 9

def test_parse_offsets():
    anchor = datetime.datetime(2026, 6, 11, 12, 0, 0)
    
    # "in 3 days" -> June 14, 18:00
    res = parse_relative_date("in 3 days", anchor)
    assert res.day == 14
    assert res.hour == 18
    
    # "in 1 week" -> June 18, 18:00
    res = parse_relative_date("in 1 week", anchor)
    assert res.day == 18
    assert res.hour == 18

def test_parse_day_names():
    # June 11, 2026 is Thursday
    anchor = datetime.datetime(2026, 6, 11, 12, 0, 0)
    
    # "by Friday" -> June 12, 18:00 (tomorrow)
    res = parse_relative_date("by Friday", anchor)
    assert res.day == 12
    assert res.hour == 18
    
    # "by Wednesday" -> already passed this week (Wed index 2 < Thu index 3), should resolve to next Wednesday: June 17
    res = parse_relative_date("by Wednesday", anchor)
    assert res.day == 17
    assert res.hour == 18
    
    # "by next Monday" -> Monday of next week: June 15
    res = parse_relative_date("by next Monday", anchor)
    assert res.day == 15
    assert res.hour == 18

def test_parse_sprint_and_week():
    anchor = datetime.datetime(2026, 6, 11, 12, 0, 0)
    
    # "end of the week" -> Friday of current week: June 12
    res = parse_relative_date("end of the week", anchor)
    assert res.day == 12
    
    # "end of sprint" -> Friday of next week: June 19
    res = parse_relative_date("end of sprint", anchor)
    assert res.day == 19
