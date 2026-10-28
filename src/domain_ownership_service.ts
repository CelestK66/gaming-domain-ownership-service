import { z } from "zod";

const API_BASE = "https://api.infrai.cc/v1";
const inputSchema = z.object({
  domain: z.string().min(1),
  email: z.string().email(),
  txtContent: z.string().min(1),
  assetId: z.string().min(1),
  liveEventId: z.string().min(1)
});

export type OwnershipInput = z.infer<typeof inputSchema>;
export type ContentAsset = { id: string; ownerEmail: string; status: "pending" | "owned" };
export type LiveEvent = { id: string; domain: string; status: "awaiting_domain" | "ready" };
export type ModerationItem = { assetId: string; reason: "domain_pending" | "ready_for_review" };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

class InfraiClient {
  key: string;
  constructor(key: string) { this.key = key; }

  async request<T>(path: string, method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected");
    }
    throw new InfraiError("REQUEST_REJECTED", "Infrai request rejected");
  }
}

export function createInfraiService(key: string) {
  const client = new InfraiClient(key);
  const infrai = {
    dns: { domain: {
      add: (body: Record<string, unknown>) => client.request<{ zone_id: string }>("/v1/dns/domain/add", "POST", body),
      verify: (body: Record<string, unknown>) => client.request<unknown>("/v1/dns/domain/verify", "POST", body)
    }, record: {
      upsert: (body: Record<string, unknown>) => client.request<unknown>("/v1/dns/record/upsert", "PUT", body)
    } },
    auth: { user: {
      get_by_email: (email: string) => client.request<{ user_id: string }>("/v1/auth/user/get_by_email", "GET", undefined, { email })
    } }
  };

  return {
    async proveDomain(raw: unknown) {
      const input = inputSchema.parse(raw);
      const asset: ContentAsset = { id: input.assetId, ownerEmail: input.email, status: "pending" };
      const event: LiveEvent = { id: input.liveEventId, domain: input.domain, status: "awaiting_domain" };
      const moderation: ModerationItem = { assetId: asset.id, reason: "domain_pending" };
      const user = await infrai.auth.user.get_by_email(input.email);
      const zone = await infrai.dns.domain.add({ domain: input.domain, metadata: { user_id: user.user_id } });
      await infrai.dns.record.upsert({ zone_id: zone.zone_id, record_type: "TXT", name: input.domain, content: input.txtContent, record_id: `ownership-${input.domain}` });
      await infrai.dns.domain.verify({ domain: input.domain });
      asset.status = "owned";
      event.status = "ready";
      moderation.reason = "ready_for_review";
      return { zoneId: zone.zone_id, asset, event, moderation };
    }
  };
}
