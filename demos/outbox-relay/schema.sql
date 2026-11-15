-- The business table: an order and the event announcing it are written in one transaction
CREATE TABLE orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer text NOT NULL,
    total_cents integer NOT NULL CHECK (total_cents >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Events waiting to be sent. A row is pending until `sent_at` (sent) or `failed_at` (parked) is set.
-- `available_at` is both the lease a relay takes when it claims a row and the backoff before a retry.
CREATE TABLE outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source text NOT NULL,
    detail_type text NOT NULL,
    -- EventBridge refuses a request over 1 MiB as a whole, failing every entry in it: keep one row from doing that
    detail jsonb NOT NULL CHECK (octet_length(detail::text) <= 256 * 1024),
    created_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    failed_at timestamptz,
    last_error text
);

-- Only pending rows are scanned, so sent rows cost the claim nothing until they're purged
CREATE INDEX outbox_pending ON outbox (available_at, id) WHERE sent_at IS NULL AND failed_at IS NULL;

-- The doorbell. Statement-level, so a writer can't forget it and a bulk insert rings once. Postgres delivers a
-- notification only when its transaction commits: https://www.postgresql.org/docs/current/sql-notify.html
CREATE FUNCTION outbox_ring() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('outbox', '');
    RETURN NULL;
END;
$$;

CREATE TRIGGER outbox_ring AFTER INSERT ON outbox FOR EACH STATEMENT EXECUTE FUNCTION outbox_ring();
