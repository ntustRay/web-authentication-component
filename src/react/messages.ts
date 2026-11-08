import type { AuthErrorCode, PasswordIssue } from "../types.js";
export interface AuthMessages {
  signIn: string;
  signUp: string;
  signOut: string;
  forgot: string;
  reset: string;
  verify: string;
  resend: string;
  email: string;
  password: string;
  confirmation: string;
  name: string;
  code: string;
  showPassword: string;
  hidePassword: string;
  capsLock: string;
  waiting: string;
  settling: string;
  checking: string;
  signedIn: string;
  signedOut: string;
  sent: string;
  verificationSent: string;
  passwordUpdated: string;
  verified: string;
  redirected: string;
  redirectHelp: string;
  cancelRedirect: string;
  back: string;
  other: string;
  unavailable: string;
  retry: string;
  mismatch: string;
  invalidEmail: string;
  policyTitle: string;
  passwordLength: string;
  passwordMax: string;
  byteLimit: string;
  cooldown: string;
  provider: string;
  separator: string;
  notice: string;
  success: string;
  error: string;
  errors: Record<AuthErrorCode, string>;
  issues: Record<PasswordIssue, string>;
}
export const zhTW: AuthMessages = {
  signIn: "登入",
  signUp: "建立帳號",
  signOut: "登出",
  forgot: "忘記密碼",
  reset: "設定新密碼",
  verify: "驗證 Email",
  resend: "重新寄送驗證信",
  email: "Email",
  password: "密碼",
  confirmation: "再次輸入密碼",
  name: "顯示名稱（選填）",
  code: "驗證碼",
  showPassword: "顯示密碼",
  hidePassword: "隱藏密碼",
  capsLock: "Caps Lock 已開啟。",
  waiting: "處理中…",
  settling: "前次請求尚未結束，請等待完成。",
  checking: "正在確認登入狀態…",
  signedIn: "已登入",
  signedOut: "尚未登入",
  sent: "如果此信箱已註冊，將收到重設密碼的連結或驗證碼。請檢查收件匣與垃圾郵件。",
  verificationSent:
    "如果此信箱需要驗證，將收到驗證信。請使用最新一封信中的連結或驗證碼。",
  passwordUpdated: "密碼已更新，請重新登入。",
  verified: "Email 已驗證，請登入。",
  redirected: "正在前往登入服務…",
  redirectHelp: "沒有開啟登入頁面，或已關閉登入視窗？",
  cancelRedirect: "重新確認登入狀態",
  back: "返回登入",
  other: "其他登入方式",
  unavailable: "暫時無法確認登入狀態。請重新確認後再操作。",
  retry: "重新確認",
  mismatch: "兩次輸入的密碼不一致。",
  invalidEmail: "請輸入有效的 Email。",
  policyTitle: "新密碼要求",
  passwordLength: "至少 {min} 個字元",
  passwordMax: "最多 {max} 個字元",
  byteLimit: "UTF-8 長度最多 {bytes} bytes",
  cooldown: "{seconds} 秒後可重新寄送",
  provider: "使用 {provider} 登入",
  separator: "或使用 Email",
  notice: "操作提示",
  success: "操作完成",
  error: "操作未完成",
  errors: {
    "invalid-input": "請檢查輸入欄位。",
    "invalid-credentials": "Email 或密碼不正確，請確認後再試。",
    "verification-required": "請先驗證 Email，再登入。",
    "rate-limited": "操作過於頻繁，請稍候再試。",
    unavailable: "目前無法連接登入服務，請稍後再試。",
    unsupported: "目前不支援這個登入方式。",
    expired: "驗證碼或連結已失效，請重新申請。",
    "weak-password": "密碼不符合安全要求，請查看下方條件。",
    cancelled: "操作已取消，可以重新嘗試。",
    timeout: "等待登入服務逾時，請先重新確認登入狀態。",
    unknown: "操作未完成，請稍後再試。",
  },
  issues: {
    "too-short": "密碼長度不足",
    "too-long": "密碼過長",
    "too-many-bytes": "密碼 UTF-8 長度超過限制",
    uppercase: "包含大寫字母",
    lowercase: "包含小寫字母",
    number: "包含數字",
    symbol: "包含符號",
    blocked: "請避免常見或已封鎖的密碼",
  },
};
export const en: AuthMessages = {
  signIn: "Sign in",
  signUp: "Create account",
  signOut: "Sign out",
  forgot: "Forgot password",
  reset: "Set new password",
  verify: "Verify email",
  resend: "Resend verification",
  email: "Email",
  password: "Password",
  confirmation: "Confirm password",
  name: "Display name (optional)",
  code: "Verification code",
  showPassword: "Show password",
  hidePassword: "Hide password",
  capsLock: "Caps Lock is on.",
  waiting: "Working…",
  settling: "Waiting for the previous request to finish…",
  checking: "Checking your session…",
  signedIn: "Signed in",
  signedOut: "Signed out",
  sent: "If this email is registered, a reset link or code will arrive. Check your inbox and spam folder.",
  verificationSent:
    "If this email needs verification, a message will arrive. Use the latest link or code.",
  passwordUpdated: "Password updated. Please sign in again.",
  verified: "Email verified. Please sign in.",
  redirected: "Opening the sign-in service…",
  redirectHelp: "The sign-in page did not open, or you closed the popup?",
  cancelRedirect: "Check session again",
  back: "Back to sign in",
  other: "Other sign-in methods",
  unavailable:
    "We could not verify your session. Check again before continuing.",
  retry: "Check again",
  mismatch: "The passwords do not match.",
  invalidEmail: "Enter a valid email address.",
  policyTitle: "New password requirements",
  passwordLength: "At least {min} characters",
  passwordMax: "At most {max} characters",
  byteLimit: "At most {bytes} UTF-8 bytes",
  cooldown: "Resend in {seconds}s",
  provider: "Continue with {provider}",
  separator: "Or use email",
  notice: "Notice",
  success: "Completed",
  error: "Could not complete",
  errors: {
    "invalid-input": "Check the fields below.",
    "invalid-credentials": "The email or password is incorrect.",
    "verification-required": "Verify your email before signing in.",
    "rate-limited": "Too many attempts. Please wait before trying again.",
    unavailable: "The sign-in service is unavailable. Try again later.",
    unsupported: "This sign-in method is unavailable.",
    expired: "This code or link has expired. Request a new one.",
    "weak-password": "Your password does not meet the requirements below.",
    cancelled: "Cancelled. You can try again.",
    timeout:
      "The sign-in service timed out. Check your session before retrying.",
    unknown: "Could not complete. Try again later.",
  },
  issues: {
    "too-short": "Password is too short",
    "too-long": "Password is too long",
    "too-many-bytes": "Password exceeds the UTF-8 byte limit",
    uppercase: "Include an uppercase letter",
    lowercase: "Include a lowercase letter",
    number: "Include a number",
    symbol: "Include a symbol",
    blocked: "Avoid common or blocked passwords",
  },
};
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    String(values[key] ?? match),
  );
}
