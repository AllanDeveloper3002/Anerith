import { requireAdmin } from "@/lib/auth";
import { createBrokerConnection, getBrokerConnections, getBrokerEvents } from "@/lib/broker";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { brokerConnectionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return ok({ brokers: getBrokerConnections(), events: getBrokerEvents() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const body = brokerConnectionSchema.parse(await readJson(request));
    const broker = createBrokerConnection(body);
    return ok({ broker, message: "Bridge connected and routing armed." }, 201);
  } catch (error) {
    return fail(error);
  }
}
