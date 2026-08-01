import { resolve } from "node:path";

/**
 * 여러 Node 프로세스가 같은 파일 서버를 사용할 때 공통으로 지정하는
 * Faith 데이터 루트. 로컬에서는 기존 .data 동작을 그대로 유지한다.
 */
export function faithDataPath(...parts: string[]) {
  const configured = process.env.FAITH_DATA_DIR?.trim();
  // 문자열 조합을 사용해 Next/Turbopack이 로컬 데이터 디렉터리를
  // 정적 asset 디렉터리로 추적하지 않게 한다. 실제 파일 접근은
  // 호출부에서 수행하며, 운영에서는 FAITH_DATA_DIR을 절대 경로로 준다.
  const root = configured ? resolve(configured) : `${process.cwd()}/.data`;
  return [root, ...parts].join("/");
}
