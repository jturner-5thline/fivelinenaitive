- FLEx integration is permanently disconnected: FLEx edge functions are inert stubs and DB sync triggers are dropped — never re-add outbound/inbound FLEx calls (user decision).

- KB export: `kb-export-pull` (x-export-key auth, verify_jwt=false) calls three service_role-only RPCs `fn_kb_export_*` with the tenant hardcoded in SQL — why: the tenant must never be caller-controlled and no browser/user role may read the export.
