import testVectors from '@leyman/idempotency-keys-test-vectors/test-vectors.json' with {
    type: 'json',
};

export interface VectorResponse {
    readonly status: number;
    readonly headers: readonly (readonly [string, string])[];
    readonly body: string;
}

export interface VectorRequest {
    readonly scope: string;
    readonly operation?: string;
    readonly key: string;
    readonly method: string;
    readonly target: string;
    readonly headers: readonly (readonly [string, string])[];
    readonly body: string;
}

export type Expectation = 'conflict' | 'mismatch' | 'replay' | 'run';

export type Step =
    | {
          readonly begin: string;
          readonly request: string;
          readonly expect: Expectation;
          readonly response?: VectorResponse;
      }
    | {
          readonly respond: string;
          readonly response: VectorResponse;
          readonly expect: 'lost' | 'released' | 'stored';
      }
    | { readonly await: string; readonly expect: Expectation; readonly response?: VectorResponse }
    | { readonly release: string; readonly expect: boolean }
    | { readonly sleep: number }
    | { readonly start: string; readonly request: string };

export interface Scenario {
    readonly description: string;
    readonly options?: {
        readonly ttlMs?: number;
        readonly leaseMs?: number;
        readonly waitMs?: number;
    };
    readonly requests: Readonly<Record<string, VectorRequest>>;
    readonly steps: readonly Step[];
}

export interface Vectors {
    readonly defaults: {
        readonly ttlMs: number;
        readonly leaseMs: number;
        readonly waitMs: number;
    };
    readonly keys: readonly {
        readonly description: string;
        readonly header: readonly string[];
        readonly key: string | null;
        readonly error?: true;
    }[];
    readonly identities: readonly {
        readonly description: string;
        readonly scope: string;
        readonly operation?: string;
        readonly key: string;
        readonly identity: string;
    }[];
    readonly fingerprints: readonly {
        readonly description: string;
        readonly method: string;
        readonly target: string;
        readonly headers: readonly (readonly [string, string])[];
        readonly named: readonly string[];
        readonly body: string;
        readonly fingerprint: string;
    }[];
    readonly valkeyScripts: {
        readonly claim: string;
        readonly complete: string;
        readonly release: string;
    };
    readonly scenarios: readonly Scenario[];
}

/**
 * The shared test vectors, typed by their README.
 */
export const vectors = testVectors as unknown as Vectors;
