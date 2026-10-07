export const credentialPatterns: RegExp[];
export function containsCredential(text: string): boolean;
export function scan(): Promise<void>;
