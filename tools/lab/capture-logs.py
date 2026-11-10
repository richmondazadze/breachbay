#!/usr/bin/env python3
"""Run an owned loopback application; capture events produced by actual requests and SQLite work."""
import argparse
import datetime as dt
import hashlib
import http.server
import json
import pathlib
import secrets
import sqlite3
import threading
import urllib.error
import urllib.request


def run(output):
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    log_path = output / "application.jsonl"
    database_path = output / "application.sqlite"
    lock = threading.RLock()
    database = sqlite3.connect(database_path, check_same_thread=False)
    database.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, content TEXT NOT NULL)")
    database.commit()
    password, session = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    failures = 0

    def timestamp():
        return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def emit(event_type, outcome, **fields):
        record = {"schema": "breachbay.event.v1", "timestamp": timestamp(), "eventType": event_type, "host": "local-app", "outcome": outcome, **fields}
        with lock, log_path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, separators=(",", ":")) + "\n")
        log_path.chmod(0o600)

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # The structured event writer is the sole log sink; no credentials or URLs.

        def answer(self, code, data):
            encoded = json.dumps(data).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            emit("http.request", "success" if code < 400 else "failure", sourceHost="127.0.0.1", destinationHost="local-app", protocol="http", destinationPort=self.server.server_port, httpStatus=code, httpMethod=self.command, bytes=len(encoded))

        def authorized(self):
            return secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + session)

        def do_GET(self):
            if self.path == "/health":
                with lock:
                    database.execute("SELECT 1").fetchone()
                emit("database.query", "success", sourceHost="local-app", destinationHost="local-database", protocol="sqlite")
                return self.answer(200, {"status": "ready"})
            if self.path != "/notes":
                return self.answer(404, {"error": "not found"})
            if not self.authorized():
                return self.answer(401, {"error": "authentication required"})
            with lock:
                rows = database.execute("SELECT id,created_at,content FROM notes ORDER BY id").fetchall()
            emit("database.query", "success", sourceHost="local-app", destinationHost="local-database", protocol="sqlite")
            self.answer(200, {"notes": rows})

        def do_POST(self):
            nonlocal failures
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                return self.answer(400, {"error": "invalid request"})
            try:
                body = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                return self.answer(400, {"error": "invalid JSON"})
            if self.path == "/login":
                valid = isinstance(body.get("password"), str) and secrets.compare_digest(body["password"], password)
                with lock:
                    if not valid:
                        failures += 1
                emit("auth.login", "success" if valid else "failure", sourceHost="127.0.0.1", destinationHost="local-app")
                return self.answer(200 if valid else 401, {"session": session} if valid else {"error": "invalid credentials"})
            if self.path != "/notes":
                return self.answer(404, {"error": "not found"})
            if not self.authorized():
                return self.answer(401, {"error": "authentication required"})
            content = body.get("content")
            if not isinstance(content, str) or not content or len(content) > 200:
                return self.answer(400, {"error": "invalid note"})
            with lock:
                cursor = database.execute("INSERT INTO notes(created_at,content) VALUES (?,?)", (timestamp(), content))
                database.commit()
            emit("database.query", "success", sourceHost="local-app", destinationHost="local-database", protocol="sqlite")
            self.answer(201, {"id": cursor.lastrowid})

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = "http://127.0.0.1:" + str(server.server_port)

    def request(path, expected, body=None, authenticated=False):
        req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body else None, headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + session} if authenticated else {})})
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                code, payload = response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            code, payload = error.code, json.loads(error.read())
        if code != expected:
            raise RuntimeError("Unexpected actual HTTP status: " + str(code))
        return payload

    try:
        request("/health", 200)
        request("/notes", 401)
        for _ in range(5):
            request("/login", 401, {"password": secrets.token_urlsafe(16)})
        request("/login", 200, {"password": password})
        request("/notes", 201, {"content": "Observation captured during the owned local application run."}, True)
        result = request("/notes", 200, authenticated=True)
        if len(result["notes"]) != 1:
            raise RuntimeError("Actual database read verification failed")
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)
        database.close()
        database_path.chmod(0o600)
    events = [json.loads(line) for line in log_path.read_text().splitlines()]
    manifest = {"provenance": "Actual requests to an isolated loopback HTTP application and actual SQLite operations", "classification": "INTERNAL", "environment": "owned local lab", "startedAt": events[0]["timestamp"], "endedAt": events[-1]["timestamp"], "events": len(events), "loginFailures": failures, "sha256": hashlib.sha256(log_path.read_bytes()).hexdigest(), "applicationStopped": not worker.is_alive()}
    (output / "capture.json").write_text(json.dumps(manifest, indent=2))
    (output / "capture.json").chmod(0o600)
    print(json.dumps({"logFile": str(log_path.resolve()), **manifest}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True, help="New private output directory; never overwrites an existing run")
    run(parser.parse_args().output.resolve())
