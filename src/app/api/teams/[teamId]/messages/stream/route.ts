import { prisma } from "@/lib/prisma";
import {
  listTeamChatMessages,
  TEAM_CHAT_CHANNEL_GENERAL,
  type PublicTeamChatMessage,
} from "@/lib/team-chat";
import {
  subscribeTeamChat,
  type TeamChatBusEvent,
} from "@/lib/team-chat-bus";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ teamId: string }> };

/**
 * 팀 채팅 SSE.
 * - 같은 인스턴스: EventEmitter 즉시 푸시
 * - 다중 인스턴스: 1.5초 DB 커서 폴링으로 누락 보완
 */
export async function GET(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { teamId } = await context.params;
  const member = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: { teamId, userId: gate.session.user.id },
    },
  });
  if (!member) {
    return new Response(JSON.stringify({ ok: false, message: "팀을 찾을 수 없습니다." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const channelRaw = (url.searchParams.get("channel") || TEAM_CHAT_CHANNEL_GENERAL)
    .trim()
    .slice(0, 32);
  if (channelRaw !== TEAM_CHAT_CHANNEL_GENERAL) {
    return new Response(
      JSON.stringify({ ok: false, message: "지원하지 않는 채널입니다." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const channel = channelRaw;
  const encoder = new TextEncoder();

  let closed = false;
  let lastCreatedAt: Date | null = null;
  let lastId: string | null = url.searchParams.get("after");
  if (lastId) {
    const pivot = await prisma.teamChatMessage.findFirst({
      where: { id: lastId, teamId, channel },
      select: { id: true, createdAt: true },
    });
    if (pivot) {
      lastCreatedAt = pivot.createdAt;
      lastId = pivot.id;
    } else {
      lastId = null;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const pushMessages = async (messages: PublicTeamChatMessage[]) => {
        for (const message of messages) {
          send("message", message);
          lastCreatedAt = new Date(message.createdAt);
          lastId = message.id;
        }
      };

      const onBus = (event: TeamChatBusEvent) => {
        if (event.type !== "message") return;
        void (async () => {
          try {
            const messages = await listTeamChatMessages({
              teamId,
              channel,
              afterCreatedAt: lastCreatedAt,
              afterId: lastId,
              limit: 20,
            });
            await pushMessages(messages);
          } catch {
            /* ignore transient */
          }
        })();
      };

      const unsubscribe = subscribeTeamChat(teamId, channel, onBus);

      const poll = async () => {
        if (closed) return;
        try {
          const messages = await listTeamChatMessages({
            teamId,
            channel,
            afterCreatedAt: lastCreatedAt,
            afterId: lastId,
            limit: 30,
          });
          await pushMessages(messages);
        } catch {
          /* ignore */
        }
      };

      send("ready", { teamId, channel, after: lastId });
      void poll();

      const pollTimer = setInterval(() => void poll(), 1500);
      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      const onAbort = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
