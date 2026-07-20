"use client";

import { useCallback, useState } from "react";

import { addVaultFile } from "@/lib/vault";

const ACCEPTED_FORMATS = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"];

export function useFileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [storedId, setStoredId] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = useCallback(async (file: File) => {
    setSelectedFile(file);
    setUploadStatus("uploading");
    setUploadError(null);
    setStoredId(null);
    try {
      const saved = await addVaultFile(file, "MEETING");
      setStoredId(saved.id);
      setUploadStatus("done");
    } catch (err) {
      setUploadStatus("error");
      setUploadError(
        err instanceof Error ? err.message : "업로드에 실패했습니다.",
      );
    }
  }, []);

  /** 보관함에서 고른 파일, 재업로드 없이 연결 */
  const attachExistingFile = useCallback((file: File, id: string) => {
    setSelectedFile(file);
    setStoredId(id);
    setUploadStatus("done");
    setUploadError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setUploadStatus("idle");
    setUploadError(null);
    setStoredId(null);
  }, []);

  return {
    isDragging,
    selectedFile,
    uploadStatus,
    uploadError,
    storedId,
    acceptedFormats: ACCEPTED_FORMATS,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    selectFile: (file: File) => {
      void processFile(file);
    },
    attachExistingFile,
    clearFile,
  };
}
