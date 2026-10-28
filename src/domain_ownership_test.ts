import test from "node:test";
import assert from "node:assert/strict";
import { createInfraiService } from "./domain_ownership_service.ts";

test("a verified domain moves the asset, event, and moderation item forward", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, method: init?.method ?? "", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const data = url.pathname.endsWith("get_by_email") ? { user_id: "user-1" } : url.pathname.endsWith("domain/add") ? { zone_id: "zone-1" } : {};
    return new Response(JSON.stringify({ ok: true, data, metadata: {} }), { status: 200 });
  };
  try {
    const result = await createInfraiService("test-key").proveDomain({ domain: "play.example", email: "player@example.com", txtContent: "owner=7", assetId: "asset-7", liveEventId: "event-7" });
    assert.equal(result.asset.status, "owned");
    assert.equal(result.event.status, "ready");
    assert.equal(result.moderation.reason, "ready_for_review");
    assert.deepEqual(calls.map((call) => [call.path, call.method]), [
      ["/v1/auth/user/get_by_email", "GET"], ["/v1/dns/domain/add", "POST"], ["/v1/dns/record/upsert", "PUT"], ["/v1/dns/domain/verify", "POST"]
    ]);
    assert.equal(result.zoneId, "zone-1");
  } finally { globalThis.fetch = originalFetch; }
});
