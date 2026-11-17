CREATE TABLE IF NOT EXISTS tujenge_app_state (id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tujenge_users (id TEXT PRIMARY KEY,phone TEXT UNIQUE,email TEXT UNIQUE,role TEXT NOT NULL CHECK(role IN ('admin','member')),display_name TEXT,secret_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tujenge_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES tujenge_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON tujenge_sessions(expires_at);
CREATE TABLE IF NOT EXISTS tujenge_auth_limits (id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
