export { MAIL_BRAND, MAIL_GLOBAL_CSS } from "@/lib/mail/styles";
export { appUrl, escapeHtml, isMailAppUrlSafe, renderMailShell } from "@/lib/mail/shell";
export {
  emailChangeOtpEmailHtml,
  emailChangedNoticeEmailHtml,
  otpEmailHtml,
  resetPasswordEmailHtml,
  signupOtpEmailHtml,
  signupRequestNoticeEmailHtml,
  welcomeEmailHtml,
} from "@/lib/mail/bodies";
export {
  MAIL_TEMPLATE_CATALOG,
  type MailTemplateEntry,
  type MailTemplateId,
} from "@/lib/mail/catalog";
