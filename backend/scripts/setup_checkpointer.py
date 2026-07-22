"""One-time LangGraph checkpoint-table setup. Run BEFORE starting uvicorn, not inside the app's
lifespan: with multiple uvicorn workers each running their own lifespan, concurrent calls to
AsyncPostgresSaver.setup() race on internal DDL (its migration table creation isn't safe under
concurrent execution) and one worker's startup fails. See entrypoint.sh.
"""

import asyncio

from app.agents.checkpointer import setup_checkpointer_tables


def main() -> None:
    asyncio.run(setup_checkpointer_tables())


if __name__ == "__main__":
    main()
