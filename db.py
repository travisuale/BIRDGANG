from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import psycopg


DB_ENV_VAR = "SPRING_BALL_DATABASE_URL"
STATE_KEY = "default"


def get_database_url(explicit_url: str | None = None) -> str | None:
    return explicit_url or os.environ.get(DB_ENV_VAR)


def ensure_database_ready(database_url: str) -> None:
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS spring_ball_state (
                    state_key TEXT PRIMARY KEY,
                    schedule JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        connection.commit()


def fetch_schedule(database_url: str) -> list[dict[str, Any]] | None:
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT schedule
                FROM spring_ball_state
                WHERE state_key = %s
                """,
                (STATE_KEY,),
            )
            row = cursor.fetchone()

    if not row:
        return None

    schedule = row[0]
    if isinstance(schedule, str):
        schedule = json.loads(schedule)
    return schedule


def save_schedule(database_url: str, schedule: list[dict[str, Any]]) -> None:
    payload = json.dumps(schedule)
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO spring_ball_state (state_key, schedule, updated_at)
                VALUES (%s, %s::jsonb, NOW())
                ON CONFLICT (state_key)
                DO UPDATE SET schedule = EXCLUDED.schedule, updated_at = NOW()
                """,
                (STATE_KEY, payload),
            )
        connection.commit()


def seed_database_if_empty(database_url: str, schedule: list[dict[str, Any]]) -> bool:
    existing_schedule = fetch_schedule(database_url)
    if existing_schedule is not None:
        return False
    save_schedule(database_url, schedule)
    return True


def reset_database(database_url: str, schedule: list[dict[str, Any]]) -> None:
    with psycopg.connect(database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA public CASCADE")
            cursor.execute("CREATE SCHEMA public")
            cursor.execute("GRANT ALL ON SCHEMA public TO CURRENT_USER")
            cursor.execute("GRANT ALL ON SCHEMA public TO PUBLIC")

    ensure_database_ready(database_url)
    save_schedule(database_url, schedule)


def load_seed_schedule(seed_path: Path | None = None) -> list[dict[str, Any]]:
    script_path = Path(seed_path or Path(__file__).with_name("schedule-data.js")).resolve()
    node_script = """
const fs = require("fs");
const vm = require("vm");

const filePath = process.argv[1];
const source = fs.readFileSync(filePath, "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: filePath });
process.stdout.write(JSON.stringify(context.window.springScheduleSeed || []));
"""
    result = subprocess.run(
        ["node", "-e", node_script, str(script_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    if not isinstance(payload, list):
        raise ValueError("Seed schedule did not evaluate to a list.")
    return payload
