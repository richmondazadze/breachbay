#!/usr/bin/env python3
"""Owned loopback application with real authentication, SQLite data and durable control receipts.

This process is an isolated integration target, not a connector for arbitrary infrastructure.
"""
import argparse
import datetime as dt
import hashlib
import http.server
import json
import pathlib
import secrets
import sqlite3
import threading
import urllib.parse


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def serve(directory, port):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    configuration = directory / "connector.json"
    if configuration.exists():
        config = json.loads(configuration.read_text())
    else:
        config = {"id": "owned-local-application", "name": "Owned local application", "host": "local-app", "endpoint": f"http://127.0.0.1:{port}", "controlToken": secrets.token_urlsafe(48), "probePassword": secrets.token_urlsafe(48), "signingKey": secrets.token_hex(32)}
        configuration.write_text(json.dumps(config, indent=2))
        configuration.chmod(0o600)
    if config["endpoint"] != f"http://127.0.0.1:{port}":
        raise RuntimeError("Restart must use the registered loopback port")
    db = sqlite3.connect(directory / "application.sqlite", check_same_thread=False)
    db.execute("CREATE TABLE IF NOT EXISTS configuration (id INTEGER PRIMARY KEY CHECK(id=1), instance_id TEXT NOT NULL, version INTEGER NOT NULL, login_enabled INTEGER NOT NULL)")
    db.execute("INSERT OR IGNORE INTO configuration VALUES (1, ?, 1, 1)", (secrets.token_hex(24),))
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, active INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, content TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS receipts (request_id TEXT PRIMARY KEY, request_digest TEXT NOT NULL, result_json TEXT NOT NULL)")
    db.commit()
    lock = threading.RLock()
    log_path = directory / "application.jsonl"

    def event(kind, outcome, **fields):
        record = {"schema": "breachbay.event.v1", "timestamp": timestamp(), "host": config["host"], "eventType": kind, "outcome": outcome, **fields}
        with lock, log_path.open("a") as file:
            file.write(json.dumps(record, separators=(",", ":")) + "\n")
        log_path.chmod(0o600)

    def observation():
        instance, version, enabled = db.execute("SELECT instance_id, version, login_enabled FROM configuration WHERE id=1").fetchone()
        return {"instanceId": instance, "version": version, "loginEnabled": bool(enabled), "observedAt": timestamp()}

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def answer(self, status, value, record=True):
            data = json.dumps(value, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # A lost reply never reverses an already committed database operation.
            if record:
                event("http.request", "success" if status < 400 else "failure", sourceHost="127.0.0.1", destinationHost=config["host"], destinationPort=port, protocol="http", httpStatus=status, httpMethod=self.command, bytes=len(data))

        def control(self):
            return secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + config["controlToken"])

        def authenticated(self):
            token = self.headers.get("Authorization", "").removeprefix("Bearer ")
            digest = hashlib.sha256(token.encode()).hexdigest()
            with lock:
                return observation()["loginEnabled"] and bool(db.execute("SELECT active FROM sessions WHERE token_hash=?", (digest,)).fetchone())

        def do_GET(self):
            if self.path == "/health":
                with lock:
                    db.execute("SELECT 1").fetchone()
                event("database.query", "success", sourceHost=config["host"], destinationHost="local-database", protocol="sqlite")
                return self.answer(200, {"status": "ready"})
            if self.path == "/control/status":
                if not self.control():
                    return self.answer(401, {"error": "control authentication required"}, False)
                with lock:
                    return self.answer(200, observation(), False)
            if self.path.startswith("/control/receipt/"):
                if not self.control():
                    return self.answer(401, {"error": "control authentication required"}, False)
                request_id = urllib.parse.unquote(self.path.removeprefix("/control/receipt/"))
                with lock:
                    row = db.execute("SELECT result_json FROM receipts WHERE request_id=?", (request_id,)).fetchone()
                return self.answer(200 if row else 404, json.loads(row[0]) if row else {"error": "receipt not found"}, False)
            if self.path == "/notes":
                if not self.authenticated():
                    return self.answer(403, {"error": "application access denied"})
                with lock:
                    notes = db.execute("SELECT id,content FROM notes ORDER BY id").fetchall()
                event("database.query", "success", sourceHost=config["host"], destinationHost="local-database", protocol="sqlite")
                return self.answer(200, {"notes": notes})
            return self.answer(404, {"error": "not found"})

        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 4096:
                    raise ValueError()
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError()
            except (ValueError, UnicodeDecodeError):
                return self.answer(400, {"error": "invalid request"}, False)
            if self.path == "/login":
                with lock:
                    enabled = observation()["loginEnabled"]
                    valid = isinstance(body.get("password"), str) and secrets.compare_digest(body["password"], config["probePassword"])
                    if valid and enabled:
                        token = secrets.token_urlsafe(48)
                        db.execute("INSERT INTO sessions VALUES (?,1)", (hashlib.sha256(token.encode()).hexdigest(),))
                        db.commit()
                event("auth.login", "success" if valid and enabled else "failure", sourceHost="127.0.0.1", destinationHost=config["host"])
                return self.answer(200 if valid and enabled else 403 if not enabled else 401, {"session": token} if valid and enabled else {"error": "application access denied"})
            if self.path == "/notes":
                if not self.authenticated():
                    return self.answer(403, {"error": "application access denied"})
                if not isinstance(body.get("content"), str) or not 0 < len(body["content"]) <= 200:
                    return self.answer(400, {"error": "invalid content"})
                with lock:
                    cursor = db.execute("INSERT INTO notes(content) VALUES (?)", (body["content"],))
                    db.commit()
                event("database.query", "success", sourceHost=config["host"], destinationHost="local-database", protocol="sqlite")
                return self.answer(201, {"id": cursor.lastrowid})
            if self.path != "/control/access" or not self.control():
                return self.answer(403, {"error": "control authentication required"}, False)
            request_id, operation, expected = body.get("requestId"), body.get("operation"), body.get("expectedVersion")
            if not isinstance(request_id, str) or not 1 <= len(request_id) <= 160 or not all(c.isalnum() or c in "_-:" for c in request_id) or operation not in ["DISABLE_APPLICATION_LOGIN", "ENABLE_APPLICATION_LOGIN"] or type(expected) is not int or expected < 1 or not isinstance(body.get("instanceId"), str):
                return self.answer(400, {"error": "invalid control request"}, False)
            request_digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            with lock:
                old = db.execute("SELECT request_digest,result_json FROM receipts WHERE request_id=?", (request_id,)).fetchone()
                if old:
                    return self.answer(200 if old[0] == request_digest else 409, json.loads(old[1]) if old[0] == request_digest else {"error": "idempotency conflict"}, False)
                current = observation()
                desired = operation == "ENABLE_APPLICATION_LOGIN"
                applied = current["version"] == expected and current["instanceId"] == body["instanceId"] and current["loginEnabled"] != desired
                if applied:
                    db.execute("UPDATE configuration SET version=version+1,login_enabled=? WHERE id=1", (int(desired),))
                    if not desired:
                        db.execute("DELETE FROM sessions")
                after = observation()
                receipt = {"requestId": request_id, "requestDigest": request_digest, "applied": applied, "code": "APPLIED" if applied else "VERSION_CONFLICT", "beforeVersion": current["version"], "afterVersion": after["version"], "instanceId": after["instanceId"], "loginEnabled": after["loginEnabled"], "recordedAt": timestamp()}
                db.execute("INSERT INTO receipts VALUES (?,?,?)", (request_id, request_digest, json.dumps(receipt, separators=(",", ":"))))
                db.commit()  # Account change and idempotency receipt commit atomically.
            return self.answer(200, receipt, False)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(json.dumps({"status": "LISTENING", "endpoint": config["endpoint"], "logFile": str(log_path), "credentialFile": str(configuration)}), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        db.close()
        (directory / "application.sqlite").chmod(0o600)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=pathlib.Path, required=True)
    parser.add_argument("--port", type=int, default=3222)
    args = parser.parse_args()
    serve(args.directory.resolve(), args.port)
