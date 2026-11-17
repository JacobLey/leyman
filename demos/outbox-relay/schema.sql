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
    -- EventBridge refuses a PutEvents request over 1 MiB as a whole, failing every entry in it, and a whole-request
    -- failure records nothing, so a batch that can't fit would fail every lease forever. These caps keep any batch of
    -- 10 under it: 10 x (100 000 detail + 256 source + 512 for 128 characters of detail type + Time's 14 +
    -- `outboxId`) is about 1 008 000 bytes, leaving room for the bus names. An entry's size counts Source, DetailType and Detail:
    -- https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevent-size.html
    -- A detail type over 128 characters is refused anyway (`InvalidArgument`):
    -- https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEventsRequestEntry.html
    source text NOT NULL CHECK (octet_length(source) <= 256),
    detail_type text NOT NULL CHECK (char_length(detail_type) <= 128),
    detail jsonb NOT NULL CHECK (octet_length(detail::text) <= 100000),
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
