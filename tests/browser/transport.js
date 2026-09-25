// Optional transport bridge for restricted test environments. Every request and
// WebSocket message is forwarded to the actual Supabase server, without mocks.
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
export async function liveTransport(context) {
  if (!process.env.E2E_NODE_TRANSPORT) return;
  await context.route("https://*.supabase.co/**", async (route) => {
    const request = route.request();
    const headers = { ...request.headers() };
    delete headers.host;
    delete headers["content-length"];
    const response = await fetch(request.url(), {
      method: request.method(),
      headers,
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    const outgoing = Object.fromEntries(response.headers);
    delete outgoing["content-encoding"];
    delete outgoing["content-length"];
    delete outgoing["transfer-encoding"];
    await route.fulfill({
      status: response.status,
      headers: outgoing,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  await context.routeWebSocket(/wss:\/\/.*\.supabase\.co\//, (socket) => {
    const remote = new WebSocket(
      socket.url(),
      process.env.HTTPS_PROXY
        ? { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
        : {},
    );
    const queue = [];
    socket.onMessage((message) => {
      if (remote.readyState === WebSocket.OPEN) remote.send(message);
      else queue.push(message);
    });
    remote.on("open", () =>
      queue.splice(0).forEach((message) => remote.send(message)),
    );
    remote.on("message", (message, binary) =>
      socket.send(binary ? message : message.toString()),
    );
    remote.on("close", () => socket.close());
    remote.on("error", () => socket.close());
    socket.onClose(() => remote.close());
  });
}
