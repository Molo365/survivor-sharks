import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
}

const SETTINGS_ID = 1;
const CACHE_TTL_MS = 1_000;
let cachedState: MaintenanceState | null = null;
let cacheExpiresAt = 0;

function normalizeMessage(message: string | null | undefined): string | null {
  const trimmed = message?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export async function getMaintenanceState(forceRefresh = false): Promise<MaintenanceState> {
  if (!forceRefresh && cachedState && Date.now() < cacheExpiresAt) {
    return cachedState;
  }

  const [settings] = await db
    .select({
      enabled: siteSettingsTable.maintenanceEnabled,
      message: siteSettingsTable.maintenanceMessage,
    })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.id, SETTINGS_ID))
    .limit(1);

  const state = settings ?? { enabled: false, message: null };
  cachedState = {
    enabled: state.enabled,
    message: normalizeMessage(state.message),
  };
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedState;
}

export async function updateMaintenanceState(
  enabled: boolean,
  message: string | null,
  updatedBy: number | null = null,
): Promise<MaintenanceState> {
  const normalizedMessage = normalizeMessage(message);
  const [settings] = await db
    .insert(siteSettingsTable)
    .values({
      id: SETTINGS_ID,
      maintenanceEnabled: enabled,
      maintenanceMessage: normalizedMessage,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteSettingsTable.id,
      set: {
        maintenanceEnabled: enabled,
        maintenanceMessage: normalizedMessage,
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning({
      enabled: siteSettingsTable.maintenanceEnabled,
      message: siteSettingsTable.maintenanceMessage,
    });

  cachedState = {
    enabled: settings.enabled,
    message: normalizeMessage(settings.message),
  };
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedState;
}