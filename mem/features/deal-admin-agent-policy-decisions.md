---
name: Deal Admin Agent policy decisions
description: Product policy answers governing AQ correction capture, KB ownership, cross-firm pooling, AQ threshold posture, and pass-reason UX
type: feature
---
- AQ correction capture lives inside naitive (not an external Sheet/Airtable). Store structured corrections in-app so they feed the agent's learning loop directly.
- Knowledge base update ownership: any workspace admin can propose/apply rule changes — not James-only. Non-admin Deal Managers cannot edit KB rules.
- Cross-firm learning is POOLED for awareness only: anonymized patterns can inform other firms' agents as background context, but MUST NOT overwrite or mutate another firm's rules of operation. Rule-of-operation edits stay firm-isolated.
- Auto vs. AQ threshold: start conservative — every agent action goes through the Approval Queue. Loosen to auto-execute per action type over time as trust is earned; do not define risk tiers up front.
- Pass reason dropdown: agent pre-selects the closest-match category from the taxonomy; the manager confirms or overrides. Never leave the dropdown blank for the manager to fill manually.