# Fix invited teammates’ approval access

## Confirmed findings
- Invitation acceptance adds company membership but does not grant platform approval; an unapproved invitee is then sent to Pending Approval.
- Access-check failures are treated as rejection rather than a temporary error.
- The preview’s denial redirect was reproduced with simulated approval responses, without accepting a real invitation or changing account records.
- All five current Blount Capital members are approved. The broad claim that existing Blount users are locked out is not supported by current data.

## Proposed access rule
- A valid invitation from an approved teammate counts as approval to join that teammate’s company. It is not a platform-admin role grant.
- Ordinary Google sign-in and self-service signup still require approval. Creating a company or merely having a membership must not bypass that requirement.
- Preserve existing approved users and explicit administrator revocations; do not bulk-approve existing members or rewrite their records.

## Changes
1. Accept invitations through a single trusted operation that checks the signed-in user, invitation token, expiry, recipient email (or the existing link-invitation format), inviter approval and membership, and company availability.
2. Complete company membership, invitation acceptance, and user approval together. Support retrying a partially completed invitation without changing an existing member’s role. A consumed invitation must not approve a different user.
3. Refresh approval and company information after acceptance so a cached rejection cannot strand the teammate. Keep the existing profile-completion and deal-migration screens.
4. Show a temporary access-check error with a retry button instead of Pending Approval when the check fails; never grant access on an error.
5. Audit historical invitation-based lockouts read-only. Any ambiguous old membership or revoked approval stays unchanged and requires individual review.

## Technical details
- Add an authenticated, transactional invitation-acceptance database function with server-side checks. Do not infer approval from arbitrary `company_members` rows or client storage, and do not broaden table access policies.
- Keep `is_user_approved` as the approval authority; distinguish its errors from an explicit `false` response in the approval hook and affected screens.
- Record the trusted acceptance boundary in `AGENTS.md`.

## Verification
- Add regression tests for invited-user acceptance and refreshed access, unapproved self-signups, email mismatch, expired/invalid tokens, unauthorized inviters, cross-company access, repeat acceptance, explicit revocation, and temporary approval-check failure/recovery.
- Run affected tests and the broader available authentication suite, plus targeted lint; inspect automatic build results.
- Check preview interactions on desktop and mobile with intercepted test responses, including retry and save/reopen behavior. No real invitations, emails, or production-record changes during testing.
- Real invitation persistence remains unverified until approved test records or an isolated test environment are available. Publishing is a separate action.