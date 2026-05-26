// SSE connection registry and broadcaster

type SseClient = {
  controller: ReadableStreamDefaultController;
};

const connections = new Map<number, Set<SseClient>>();

export function registerSseClient(userId: number, controller: ReadableStreamDefaultController) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  const client: SseClient = { controller };
  connections.get(userId)!.add(client);
  return () => {
    connections.get(userId)?.delete(client);
    if (connections.get(userId)?.size === 0) connections.delete(userId);
  };
}

export function broadcastToUser(userId: number, event: object) {
  const clients = connections.get(userId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoder = new TextEncoder();
  const dead: SseClient[] = [];
  for (const client of clients) {
    try {
      client.controller.enqueue(encoder.encode(data));
    } catch {
      dead.push(client);
    }
  }
  for (const c of dead) clients.delete(c);
}

export function createSseResponse(userId: number): Response {
  let unregister: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      unregister = registerSseClient(userId, controller);
      // Send a keepalive comment immediately
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      unregister?.();
    },
  });

  // Keepalive ping every 25s
  const interval = setInterval(() => {
    const clients = connections.get(userId);
    if (!clients || clients.size === 0) {
      clearInterval(interval);
      return;
    }
    const encoder = new TextEncoder();
    const ping = encoder.encode(": ping\n\n");
    const dead: SseClient[] = [];
    for (const client of clients) {
      try {
        client.controller.enqueue(ping);
      } catch {
        dead.push(client);
      }
    }
    for (const c of dead) clients.delete(c);
  }, 25000);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
