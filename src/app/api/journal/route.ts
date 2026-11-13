import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import {
  deleteStrategy,
  deleteTag,
  getJournal,
  saveStrategy,
  saveTag,
  updateJournalEntry,
} from "@/lib/journal";
import { journalActionSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(getJournal(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = journalActionSchema.parse(await readJson(request));
    switch (input.action) {
      case "entry.update":
        return ok(updateJournalEntry(user.id, input));
      case "strategy.save":
        return ok(saveStrategy(user.id, input));
      case "strategy.delete":
        deleteStrategy(user.id, input.strategyId);
        return ok({ deleted: true });
      case "tag.save":
        return ok(saveTag(user.id, input));
      case "tag.delete":
        deleteTag(user.id, input.tagId);
        return ok({ deleted: true });
      default:
        throw new ApiError(400, "Unsupported action.");
    }
  } catch (error) {
    return fail(error);
  }
}
