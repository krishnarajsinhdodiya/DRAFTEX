export declare const FORBIDDEN: RegExp;
export declare const OWNER_NAME: string;
export declare const OWNER_EMAIL: string;
export declare function checkMessage(message: string): string[];
export declare function checkIdentity(identity: {
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
}): string[];
