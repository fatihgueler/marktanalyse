import type { TokenStore } from "@/sources/types";
import { getDb } from "./db";

/** Speichert rotierende Refresh-Tokens in der Tabelle `ApiToken`. */
export function createDbTokenStore(): TokenStore {
  return {
    async load(provider) {
      const row = await getDb().apiToken.findUnique({ where: { provider } });
      return row ? { refreshToken: row.refreshToken, expiresAt: row.expiresAt } : null;
    },
    async save(provider, refreshToken, expiresAt) {
      await getDb().apiToken.upsert({
        where: { provider },
        create: { provider, refreshToken, expiresAt },
        update: { refreshToken, expiresAt },
      });
    },
  };
}
