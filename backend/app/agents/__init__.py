"""LangGraph agent layer. Graph state stays thin (identifiers, control flags); nodes write
heavy artifacts (facts, plans, drafts) to Postgres directly as they run — see app/db.py."""
