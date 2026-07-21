"""Onboard a new firm with its first admin user.

Run: python -m scripts.create_firm --name "..." --email ... --password ...

Part of the deploy sequence in the implementation plan (§11): after `alembic upgrade head`
and `seed_knowledge`, this is how a firm's first login gets created.
"""

import argparse
import asyncio

from app.db import session_scope
from app.models.tenant import Firm, User
from app.services.security import hash_password


async def create_firm(name: str, email: str, password: str, full_name: str | None) -> None:
    async with session_scope() as db:
        firm = Firm(name=name)
        db.add(firm)
        await db.flush()

        admin = User(
            firm_id=firm.id,
            email=email,
            hashed_password=hash_password(password),
            role="admin",
            full_name=full_name,
        )
        db.add(admin)
        await db.flush()

        print(f"Created firm {firm.id} ({firm.name}) with admin user {admin.email}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a firm and its first admin user.")
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", default=None)
    args = parser.parse_args()

    asyncio.run(create_firm(args.name, args.email, args.password, args.full_name))


if __name__ == "__main__":
    main()
