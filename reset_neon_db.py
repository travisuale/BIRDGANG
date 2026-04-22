#!/usr/bin/env python3

from __future__ import annotations

import argparse

from db import get_database_url, load_seed_schedule, reset_database


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reset the Spring Ball Neon database and load the local schedule seed."
    )
    parser.add_argument(
        "--database-url",
        help="Postgres connection string. Defaults to SPRING_BALL_DATABASE_URL.",
    )
    args = parser.parse_args()

    database_url = get_database_url(args.database_url)
    if not database_url:
        raise SystemExit(
            "Missing database URL. Pass --database-url or set SPRING_BALL_DATABASE_URL."
        )

    schedule = load_seed_schedule()
    reset_database(database_url, schedule)
    print(f"Reset Neon database and imported {len(schedule)} Spring Ball days.")


if __name__ == "__main__":
    main()
