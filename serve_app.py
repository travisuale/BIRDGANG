#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import socketserver
import threading
import time
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

from db import (
    DB_ENV_VAR,
    ensure_database_ready,
    fetch_schedule,
    get_database_url,
    load_seed_schedule,
    save_schedule,
    seed_database_if_empty,
)


HOST = "127.0.0.1"
PORT = 8000
APP_FILE = "index.html"
API_PATH = "/api/spring-ball"

DATABASE_URL = None


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class SpringBallHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        if urlparse(self.path).path == API_PATH:
            self.handle_get_schedule()
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path == API_PATH:
            self.handle_post_schedule()
            return
        self.send_error(404, "Not Found")

    def handle_get_schedule(self) -> None:
        if not DATABASE_URL:
            self.send_json(
                503,
                {
                    "error": f"Database is not configured. Set {DB_ENV_VAR} before starting the app.",
                },
            )
            return

        try:
            schedule = fetch_schedule(DATABASE_URL) or []
        except Exception as error:
            self.send_json(500, {"error": f"Failed to load schedule: {error}"})
            return

        self.send_json(200, {"schedule": schedule})

    def handle_post_schedule(self) -> None:
        if not DATABASE_URL:
            self.send_json(
                503,
                {
                    "error": f"Database is not configured. Set {DB_ENV_VAR} before starting the app.",
                },
            )
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Invalid Content-Length header."})
            return

        raw_body = self.rfile.read(content_length) if content_length > 0 else b""
        try:
            payload = json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Request body must be valid JSON."})
            return

        schedule = payload.get("schedule")
        if not isinstance(schedule, list):
            self.send_json(400, {"error": "Payload must include a schedule array."})
            return

        try:
            save_schedule(DATABASE_URL, schedule)
        except Exception as error:
            self.send_json(500, {"error": f"Failed to save schedule: {error}"})
            return

        self.send_json(200, {"ok": True})

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)


def configure_database() -> str | None:
    database_url = get_database_url()
    if not database_url:
        return None

    ensure_database_ready(database_url)

    # Seed from the local hand-maintained schedule when the remote table is empty.
    seed_database_if_empty(database_url, load_seed_schedule())
    return database_url


def main() -> None:
    global DATABASE_URL

    root = Path(__file__).resolve().parent
    os.chdir(root)
    DATABASE_URL = configure_database()

    with ReusableTCPServer((HOST, PORT), SpringBallHandler) as server:
        url = f"http://{HOST}:{PORT}/{APP_FILE}"

        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        print(f"Serving Timpview Spring Ball Schedule at {url}")
        if DATABASE_URL:
            print("Neon sync is enabled for /api/spring-ball.")
        else:
            print(f"Neon sync is disabled. Set {DB_ENV_VAR} to enable it.")
        print("Press Ctrl+C to stop the server.")

        time.sleep(0.2)
        webbrowser.open(url)

        try:
            thread.join()
        except KeyboardInterrupt:
            print("\nStopping server.")
            server.shutdown()


if __name__ == "__main__":
    main()
