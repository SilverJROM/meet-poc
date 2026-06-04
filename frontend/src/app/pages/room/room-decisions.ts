export type ChatSubmitKeyEvent = {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

export function shouldSubmitChat(event: ChatSubmitKeyEvent): boolean {
  if (event.key !== 'Enter') return false;
  if (event.shiftKey) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  return true;
}

export type GuestPasswordPromptInput = {
  passwordRequired: boolean;
  isOwner: boolean;
  verifiedPassword: string | null;
};

export function shouldPromptGuestPassword(input: GuestPasswordPromptInput): boolean {
  return input.passwordRequired && !input.isOwner && !input.verifiedPassword;
}
