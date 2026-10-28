import { createInfraiService } from "./domain_ownership_service.ts";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before running the example.");

const result = await createInfraiService(key).proveDomain({
  domain: process.env.GAME_DOMAIN ?? "creator.example",
  email: process.env.PLAYER_EMAIL ?? "creator@example.com",
  txtContent: process.env.DOMAIN_TXT ?? "game-owner=demo",
  assetId: "asset-demo-001",
  liveEventId: "live-demo-001"
});
console.log(JSON.stringify(result, null, 2));
