import "server-only";

import { RoomServiceClient } from "livekit-server-sdk";

import { prisma } from "@/lib/prisma";

function roomService() {
  const rawUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!rawUrl || !apiKey || !apiSecret) return null;
  const url = rawUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return new RoomServiceClient(url, apiKey, apiSecret);
}

export async function removeUserFromTeamRooms(teamId: string, userId: string) {
  const service = roomService();
  if (!service) return;
  const rooms = await prisma.teamMeeting.findMany({
    where: {
      teamId,
      mode: "ONLINE",
      state: "ACTIVE",
      livekitRoomName: { not: null },
    },
    select: { livekitRoomName: true },
  });
  await Promise.allSettled(
    rooms.map((room) =>
      service.removeParticipant(room.livekitRoomName!, userId, {
        revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
      }),
    ),
  );
}

export async function closeLiveKitRoom(roomName: string) {
  const service = roomService();
  if (!service) return;
  await service.deleteRoom(roomName);
}

export async function removeLiveKitParticipant(
  roomName: string,
  userId: string,
) {
  const service = roomService();
  if (!service) return;
  await service.removeParticipant(roomName, userId, {
    revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
  });
}

