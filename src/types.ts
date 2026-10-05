export type Matcher =
  | { readonly kind: "all" }
  | { readonly kind: "match"; readonly pattern: string };

export type HookSpec = {
  readonly event: string;
  readonly matcher: Matcher;
  readonly command: string;
  readonly statusMessage: string;
  readonly timeoutSeconds?: number;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject;

export type JsonObject = { readonly [key: string]: JsonValue };

export type Existing =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly text: string };

export type Moved = {
  readonly event: string;
  readonly command: string;
  readonly was: string;
  readonly now: string;
};

export type Wired = {
  readonly text: string;
  readonly wired: readonly string[];
  readonly rewired: readonly string[];
  readonly moved: readonly Moved[];
  readonly added: readonly string[];
  readonly folded: readonly string[];
};

export type Merge =
  | ({ readonly kind: "created" } & Wired)
  | ({ readonly kind: "merged" } & Wired)
  | { readonly kind: "unchanged" };
