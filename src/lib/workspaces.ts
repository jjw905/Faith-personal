export type WorkspaceId = "personal" | "team";

export type Workspace = {
  id: WorkspaceId;
  title: string;
  subtitle: string;
};

export const WORKSPACES: Workspace[] = [
  {
    id: "team",
    title: "팀",
    subtitle: "공유 회의·권한 공간",
  },
  {
    id: "personal",
    title: "개인",
    subtitle: "내 회의만 보는 공간",
  },
];
