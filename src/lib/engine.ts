import { getDb } from "./db";
import {
  evaluateAllActiveAccounts,
  pendingOrderMonitor,
  processProtectiveExits,
  stopOutCheck,
} from "./objectives";
import { autoCompletePayouts } from "./payouts";
import { autoVerifyKyc } from "./kyc";
import { heartbeatBrokers } from "./broker";
import { refreshCompetitionLeaderboard, settleCompetitions } from "./competitions";
import { refreshAllQuotes } from "./market-data";
import { markPositionsToMarket } from "./trading";

const globalRef = globalThis as unknown as { __anerithEngineTimer?: NodeJS.Timeout };

let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await refreshAllQuotes("standard");
    markPositionsToMarket();
    pendingOrderMonitor();
    processProtectiveExits();
    stopOutCheck();
    evaluateAllActiveAccounts();
    refreshCompetitionLeaderboard();
    settleCompetitions();
    autoCompletePayouts();
    autoVerifyKyc();
    heartbeatBrokers();
  } catch (error) {
    console.error("[anerith] risk engine tick failed", error);
  } finally {
    ticking = false;
  }
}

export function engineRunning(): boolean {
  return Boolean(globalRef.__anerithEngineTimer);
}

export function ensureEngine(): void {
  getDb();
  if (globalRef.__anerithEngineTimer) return;
  void tick();
  globalRef.__anerithEngineTimer = setInterval(() => void tick(), 1000);
  if (typeof globalRef.__anerithEngineTimer.unref === "function") {
    globalRef.__anerithEngineTimer.unref();
  }
  console.log("[anerith] risk & objectives engine started");
}
