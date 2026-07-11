-- In-chat USDC transfers (user↔user, user↔agent, agent↔agent): a settled
-- DMTransfer payload on the message — {amount, asset, settlement_id, status}.
alter table direct_messages add column if not exists transfer jsonb;
