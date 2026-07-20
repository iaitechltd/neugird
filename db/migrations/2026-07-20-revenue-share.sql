-- THE PIVOT (2026-07-20): project tokens become a piece of real income —
-- a governable slice of every product sale streams to token holders.
alter table markets add column if not exists dividends jsonb;
alter table holdings add column if not exists div_debt numeric;
