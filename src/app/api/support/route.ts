import { requireUser } from "@/lib/auth";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { createSupportTicket, listSupportTickets } from "@/lib/support";
import { supportTicketSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ tickets: listSupportTickets(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = supportTicketSchema.parse(await readJson(request));
    return ok({ ticket: createSupportTicket(user.id, input) }, 201);
  } catch (error) {
    return fail(error);
  }
}
