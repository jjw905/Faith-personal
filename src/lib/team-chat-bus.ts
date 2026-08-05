import "server-only";

import { EventEmitter } from "node:events";

export type TeamChatBusEvent = {
  type: "message" | "deleted";
  teamId: string;
  channel: string;
  messageId: string;
  createdAt: string;
};

const globalForChat = globalThis as typeof globalThis & {
  __faithTeamChatBus?: EventEmitter;
};

function bus() {
  if (!globalForChat.__faithTeamChatBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    globalForChat.__faithTeamChatBus = emitter;
  }
  return globalForChat.__faithTeamChatBus;
}

function topic(teamId: string, channel: string) {
  return `team-chat:${teamId}:${channel}`;
}

/** 같은 인스턴스 SSE 구독자에게 즉시 푸시. */
export function publishTeamChatEvent(event: TeamChatBusEvent) {
  bus().emit(topic(event.teamId, event.channel), event);
  bus().emit(topic(event.teamId, "*"), event);
}

export function subscribeTeamChat(
  teamId: string,
  channel: string,
  listener: (event: TeamChatBusEvent) => void,
) {
  const key = topic(teamId, channel);
  bus().on(key, listener);
  return () => {
    bus().off(key, listener);
  };
}
