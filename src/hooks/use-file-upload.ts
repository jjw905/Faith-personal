"use client";

import { useCallback, useState } from "react";

import {
  addVaultFile,
  listVaultItems,
  nextDuplicateFileName,
  renameFile,
} from "@/lib/vault";

const ACCEPTED_FORMATS = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"];

export function useFileUpload(options?: { persist?: boolean }) {
  const persist = options?.persist !== false;
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [storedId, setStoredId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [duplicateNextName, setDuplicateNextName] = useState<string | null>(
    null,
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setPendingFile(null);
      setDuplicateNextName(null);
      setUploadStatus("uploading");
      setUploadError(null);
      setStoredId(null);
      try {
        if (!persist) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          setStoredId(`ux-upload-${Date.now()}`);
          setSelectedFile(file);
          setUploadStatus("done");
          return;
        }
        const saved = await addVaultFile(file, "MEETING");
        setStoredId(saved.id);
        setSelectedFile(file);
        setUploadStatus("done");
      } catch (err) {
        setUploadStatus("error");
        setUploadError(
          err instanceof Error ? err.message : "업로드에 실패했습니다.",
        );
      }
    },
    [persist],
  );

  const processFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setStoredId(null);
      if (!persist) {
        await uploadFile(file);
        return;
      }
      try {
        const items = await listVaultItems();
        const names = items.map((i) => i.name);
        if (names.includes(file.name)) {
          setPendingFile(file);
          setSelectedFile(file);
          setDuplicateNextName(nextDuplicateFileName(file.name, names));
          setUploadStatus("idle");
          return;
        }
      } catch {
        // 목록 조회 실패 시 원본 이름으로 진행
      }
      await uploadFile(file);
    },
    [persist, uploadFile],
  );

  const confirmDuplicateUpload = useCallback(() => {
    if (!pendingFile || !duplicateNextName) return;
    const next = renameFile(pendingFile, duplicateNextName);
    void uploadFile(next);
  }, [pendingFile, duplicateNextName, uploadFile]);

  const cancelDuplicateUpload = useCallback(() => {
    setPendingFile(null);
    setDuplicateNextName(null);
    setSelectedFile(null);
    setUploadStatus("idle");
    setUploadError(null);
    setStoredId(null);
  }, []);

  /** 보관함에서 고른 파일, 재업로드 없이 연결 */
  const attachExistingFile = useCallback((file: File, id: string) => {
    setPendingFile(null);
    setDuplicateNextName(null);
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
      e.target.value = "";
      if (file) void processFile(file);
    },
    [processFile],
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setUploadStatus("idle");
    setUploadError(null);
    setStoredId(null);
    setPendingFile(null);
    setDuplicateNextName(null);
  }, []);

  return {
    isDragging,
    selectedFile,
    uploadStatus,
    uploadError,
    storedId,
    pendingDuplicate: Boolean(pendingFile && duplicateNextName),
    duplicateOriginalName: pendingFile?.name ?? null,
    duplicateNextName,
    acceptedFormats: ACCEPTED_FORMATS,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    selectFile: (file: File) => {
      void processFile(file);
    },
    confirmDuplicateUpload,
    cancelDuplicateUpload,
    attachExistingFile,
    clearFile,
  };
}
