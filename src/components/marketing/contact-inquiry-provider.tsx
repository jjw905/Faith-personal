"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ContactInquiryDialog } from "@/components/marketing/contact-inquiry-dialog";

type OpenOptions = { subject?: string };

type ContactInquiryContextValue = {
  openContact: (options?: OpenOptions) => void;
};

const ContactInquiryContext =
  createContext<ContactInquiryContextValue | null>(null);

export function ContactInquiryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("Faith 문의");

  const openContact = useCallback((options?: OpenOptions) => {
    setSubject(options?.subject?.trim() || "Faith 문의");
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openContact }), [openContact]);

  return (
    <ContactInquiryContext.Provider value={value}>
      {children}
      <ContactInquiryDialog open={open} onClose={close} subject={subject} />
    </ContactInquiryContext.Provider>
  );
}

export function useContactInquiry() {
  const ctx = useContext(ContactInquiryContext);
  if (!ctx) {
    throw new Error("useContactInquiry must be used within ContactInquiryProvider");
  }
  return ctx;
}
