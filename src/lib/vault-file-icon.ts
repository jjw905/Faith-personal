/** 보관함 파일 종류 → Material Symbols Outlined 이름 (M3). */

export type VaultFileSymbol =
  | "audio_file"
  | "video_file"
  | "image"
  | "picture_as_pdf"
  | "description"
  | "table_chart"
  | "slideshow"
  | "text_snippet"
  | "draft";

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
}

/** 확장자만으로 mime을 추정 (미리보기 픽스처·레거시 항목용). */
export function guessVaultMime(name: string): string {
  const ext = extensionOf(name);
  switch (ext) {
    case "mp3":
    case "wav":
    case "m4a":
    case "ogg":
    case "flac":
      return `audio/${ext === "m4a" ? "mp4" : ext}`;
    case "mp4":
    case "mov":
    case "webm":
      return ext === "webm" && /영상|video|데모|movie/i.test(name)
        ? "video/webm"
        : ext === "webm"
          ? "audio/webm"
          : `video/${ext === "mov" ? "quicktime" : ext}`;
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
    case "webp":
    case "gif":
    case "heic":
      return `image/${ext}`;
    case "pdf":
      return "application/pdf";
    case "doc":
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "hwp":
    case "hwpx":
      return "application/x-hwp";
    case "xls":
    case "xlsx":
    case "csv":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "txt":
    case "md":
      return "text/plain";
    case "zip":
    case "7z":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

export function vaultFileSymbol(
  name: string,
  mime = "application/octet-stream",
): VaultFileSymbol {
  const type = (mime && mime !== "application/octet-stream"
    ? mime
    : guessVaultMime(name)
  ).toLowerCase();

  if (type.startsWith("audio/")) return "audio_file";
  if (type.startsWith("video/")) return "video_file";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || type.includes("pdf")) return "picture_as_pdf";
  if (type.startsWith("text/")) return "text_snippet";

  if (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type === "text/csv" ||
    type.includes("csv")
  ) {
    return "table_chart";
  }
  if (type.includes("presentation") || type.includes("powerpoint")) {
    return "slideshow";
  }
  if (
    type.includes("word") ||
    type.includes("document") ||
    type.includes("hwp") ||
    type.includes("msword")
  ) {
    return "description";
  }

  const ext = extensionOf(name);
  switch (ext) {
    case "mp3":
    case "wav":
    case "m4a":
    case "ogg":
    case "flac":
      return "audio_file";
    case "mp4":
    case "mov":
      return "video_file";
    case "webm":
      return /영상|video|데모|movie/i.test(name) ? "video_file" : "audio_file";
    case "jpg":
    case "jpeg":
    case "png":
    case "webp":
    case "gif":
    case "heic":
      return "image";
    case "pdf":
      return "picture_as_pdf";
    case "doc":
    case "docx":
    case "hwp":
    case "hwpx":
      return "description";
    case "xls":
    case "xlsx":
    case "csv":
      return "table_chart";
    case "ppt":
    case "pptx":
      return "slideshow";
    case "txt":
    case "md":
      return "text_snippet";
    default:
      return "draft";
  }
}
