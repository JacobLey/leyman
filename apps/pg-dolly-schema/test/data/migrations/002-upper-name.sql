-- A trigger, which an ORM's model of the schema wouldn't include
CREATE FUNCTION upper_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.name := upper(NEW.name);
    RETURN NEW;
END;
$$;
CREATE TRIGGER upper_name BEFORE INSERT ON item FOR EACH ROW EXECUTE FUNCTION upper_name();
