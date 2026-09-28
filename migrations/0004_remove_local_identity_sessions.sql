-- CYCloud Identity is now the browser-session authority.
-- CY Web retains only its app-local member/tag projection and transports the
-- opaque Identity session in an HttpOnly cookie; no duplicate session row is kept.

DROP TABLE IF EXISTS web_sessions;
