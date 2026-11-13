import { requireAdmin } from "@/lib/auth";
import { addBrokerEvent, setBrokerStatus, testBrokerConnection } from "@/lib/broker";
import { ApiError } from "@/lib/errors";
import { one } from "@/lib/db";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { brokerStatusSchema } from "@/lib/validation";

function assertBroker(id: string): void {
  if (!one<{ id: string }>("SELECT id FROM broker_connections WHERE id = ?", [id])) {
    throw new ApiError(404, "Broker connection not found.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    assertBroker(id);
    const broker = testBrokerConnection(id);
    return ok({ broker, message: "Handshake passed." });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    assertBroker(id);
    const body = brokerStatusSchema.parse(await readJson(request));
    setBrokerStatus(id, body.status);
    return ok({ message: body.status === "connected" ? "Bridge resumed." : "Bridge paused." });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    assertBroker(id);
    setBrokerStatus(id, "disconnected");
    addBrokerEvent(id, "disconnect", "Bridge retired from active routing");
    return ok({ message: "Bridge disconnected." });
  } catch (error) {
    return fail(error);
  }
}
