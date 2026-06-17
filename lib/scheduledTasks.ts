import "server-only";

import { regenerateAllAnswerVariants } from "@/lib/triviaAnswerVariants";

declare global {
  var __hightopAnswerVariantsSchedulerStarted__: boolean | undefined;
}

function msUntilNext2AM(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return Math.max(1_000, next.getTime() - now.getTime());
}

function scheduleAnswerVariantsRegeneration(): void {
  const delayMs = msUntilNext2AM();
  console.log(
    `[ScheduledTasks] Next answer variants regeneration in ${Math.round(delayMs / 1000 / 60)} minutes`
  );

  setTimeout(async () => {
    try {
      console.log("[ScheduledTasks] Starting answer variants regeneration");
      const result = await regenerateAllAnswerVariants();
      console.log("[ScheduledTasks] Answer variants regeneration complete", result);
    } catch (error) {
      console.error("[ScheduledTasks] Error during answer variants regeneration", error);
    } finally {
      scheduleAnswerVariantsRegeneration();
    }
  }, delayMs);
}

export async function initializeScheduledTasks(): Promise<void> {
  if (globalThis.__hightopAnswerVariantsSchedulerStarted__) {
    return;
  }
  globalThis.__hightopAnswerVariantsSchedulerStarted__ = true;

  scheduleAnswerVariantsRegeneration();
}

export { regenerateAllAnswerVariants, getAnswerVariantsStats } from "@/lib/triviaAnswerVariants";
