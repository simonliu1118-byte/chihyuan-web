-- CY Web temporary browser-session projection for the shared Identity bridge.
--
-- The credential authority remains external. This table stores only CY Web's
-- short-lived session projection and never stores password/OTP/recovery material.
-- Later Shared Identity extraction may replace the provider/session transport,
-- but business modules continue to consume the provider-neutral IdentityAdapter.

CREATE TABLE web_sessions (
    session_hash TEXT PRIMARY KEY CHECK (length(session_hash) = 64),
    identity_employee_id TEXT NOT NULL CHECK (length(trim(identity_employee_id)) > 0),
    employee_no TEXT,
    employee_name TEXT NOT NULL CHECK (length(trim(employee_name)) > 0),
    role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'ADMIN', 'SUPER_ADMIN')),
    workspace_id TEXT,
    credential_version INTEGER NOT NULL DEFAULT 0 CHECK (credential_version >= 0),
    employee_revision INTEGER NOT NULL DEFAULT 0 CHECK (employee_revision >= 0),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    CHECK (expires_at > created_at),
    FOREIGN KEY (identity_employee_id)
        REFERENCES app_members(identity_employee_id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE
);

CREATE INDEX idx_web_sessions_employee
    ON web_sessions(identity_employee_id, expires_at);

CREATE INDEX idx_web_sessions_expiry
    ON web_sessions(expires_at);
