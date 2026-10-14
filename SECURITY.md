# Security policy

- Never commit .env files, API keys, service-role keys, customer exports or raw Altis data.
- The repository is public; assume source and workflows can be viewed by anyone.
- Use a dedicated ephemeral/preauthorized Tailscale auth key with a restricted ACL/tag. Do not publish ERP ports to the internet.
- Raw Altis records may contain costs and confidential flags. Only backend code using the service-role key accesses altis_product_raw. Never pass its payload to an LLM.
- Inventory remains unreported unless a stock field is explicitly configured and validated.
- Configure Evolution custom header x-rgb-webhook-token; rotate if exposed.
- Existing private schema tables were reported with RLS disabled: private.product_costs, private.integration_settings, private.rate_limits, private.integration_events and private.conversation_audit. Review them separately before hardening; this migration only secures newly created tables.
- This project relies on an authorized JSON export endpoint. It does not connect directly to the Altis database or infer undocumented ERP protocol.
