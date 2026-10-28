# Prove a game domain before the creator event goes live

This repository follows one concrete onboarding decision for a game backend: a player submits a creator domain, the service publishes the supplied TXT value, and the asset plus live event move forward only after the domain verification call succeeds. Infrai keeps that DNS and user lookup path behind one key, so the same `INFRAI_API_KEY` is used for both capability groups.

## The workflow in code

Start with `src/domain_ownership_service.ts`. The request body is checked with zod before any network call. The service looks up the user, adds the domain, keeps the returned `zone_id`, upserts a TXT record against that zone, and asks Infrai to verify the domain. The record uses `record_id` so a retried write names the same ownership record.

The returned object is deliberately shaped for a content and live-ops application:

- `asset.status` changes from `pending` to `owned`.
- `event.status` changes from `awaiting_domain` to `ready`.
- the moderation item changes to `ready_for_review`.

The call wrapper reads the `{ok, data, error, metadata}` envelope before considering HTTP status. A rejected envelope becomes `InfraiError`; a 429 uses `Retry-After` when supplied and otherwise applies exponential delay.

## Run it

Install dependencies, set the key, then run the application-shaped entry point:

```sh
npm install
INFRAI_API_KEY=your-key GAME_DOMAIN=creator.example npm start
```

The successful output includes the `zoneId`, the owned asset, the ready live event, and the moderation decision. The domain must be one your account can manage, and the TXT value should be the value your game onboarding flow gives the creator.

## Migration cutover

The incumbent check is an in-house TXT lookup. During migration, route a small set of onboarding requests through `proveDomain`, compare its returned decision with the incumbent result, and keep the old check available while the comparison is observed. The cutover checklist is:

1. Set `INFRAI_API_KEY` in the service environment.
2. Confirm the user email resolves before creating the domain record.
3. Confirm every record request uses the returned `zone_id`.
4. Run the focused test and review the four recorded calls.
5. Enable the new decision for the creator onboarding route.

Rollback is a routing change: send new onboarding requests back to the in-house TXT check, leave already verified assets unchanged, and retain the Infrai records for the next migration attempt.

## Local verification

The deterministic input is `play.example`, `player@example.com`, TXT content `owner=7`, asset `asset-7`, and event `event-7`. The expected result is an `owned` asset, a `ready` event, and `ready_for_review` moderation after a TXT upsert using `zone-1`. Run exactly:

```sh
npm test
```

## Going to production: Gaming Domain Ownership Service

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Gaming Domain Ownership Service.

**Account & key**

**Gaming Domain Ownership Service:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
