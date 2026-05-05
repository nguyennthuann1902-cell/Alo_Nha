# Security Specification - Alo Nhà

## Data Invariants
1. A User must have a unique UID matching their Auth UID.
2. An Elderly user can generate exactly one active Invite Code at a time.
3. Family members can only access health/medicine data of an Elderly user IF they are in that user's `linkedUids` list.
4. `linkedUids` can only be updated by the user themselves (to prevent unauthorized linking without a code).

## The Dirty Dozen (Threat Payloads)

1. **Identity Spoofing**: Attempt to create a user profile for someone else's UID.
2. **Role Escalation**: Attempt to change role from `family` to `admin` (if admin existed).
3. **Ghost Linking**: Attempt to add myself to an elderly's `linkedUids` directly without their knowledge.
4. **Invite Code Poisoning**: Attempt to overwrite an existing link code created by someone else.
5. **PII Scraping**: Attempt to list all users to find email addresses.
6. **Medication Tampering**: User A attempts to delete User B's medicine schedule.
7. **Social Engineering**: family member attempts to remove other family members from an elderly's list.
8. **Resource Exhaustion**: Attempt to create a 1MB string in `displayName`.
9. **Stale Data Attack**: Attempt to delete an elderly's activity log to hide suspicious patterns.
10. **Shadow Profile**: Attempt to create a document in `users` without a name.
11. **Bypass Verification**: Attempt to perform sensitive writes when email is not verified (if enforced).
12. **Batch Inconsistency**: Create a link code but don't update the user profile's internal record.

## Security Rules Implementation Strategy
- Use `isValidUser` helper for all writes to `/users`.
- Use `isSignedIn()` as the first line of defense.
- Store connection state in `linkedUids` on both sides for redundancy and performance.
- Subcollection access requires a `get()` call to the parent user document to verify linkage.
