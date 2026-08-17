import { randomUUID } from "node:crypto";
import {
  link,
  open,
  readFile,
  unlink,
} from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

export type ReleaseGateRule = {
  checkType: string;
  operator: string;
  expectedValue: string | null;
  severity: string;
  blocking: boolean;
  message: string | null;
  id?: string;
};

export type ReleaseGate = {
  id: string;
  name: string;
  rules: ReleaseGateRule[];
};

export type SmokeCleanupState = {
  credentials: {
    email: string;
    password: string;
  };
  gateSnapshot?: ReleaseGate;
  gateWasMutated: boolean;
  productId?: string;
  productCode: string;
  tokenId?: string;
  tokenName: string;
};

export interface ApiResponseLike {
  status(): number;
  url(): string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface ApiRequestLike {
  get(url: string, options?: unknown): Promise<ApiResponseLike>;
  post(url: string, options?: unknown): Promise<ApiResponseLike>;
  patch(url: string, options?: unknown): Promise<ApiResponseLike>;
  delete(url: string, options?: unknown): Promise<ApiResponseLike>;
}

export type GateMutationLockOwner = {
  token: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
  port: number;
};

export type GateMutationLock = {
  lockPath: string;
  lockPort: number;
  owner: GateMutationLockOwner;
  release(options?: {
    cleanupErrors?: ReadonlyArray<Error>;
  }): Promise<void>;
};

type GateMutationLockMetadata = GateMutationLockOwner & {
  state: "active" | "poisoned";
  poisonedAt?: string;
  cleanupFailures?: string[];
};

type AcquireGateMutationLockOptions = {
  lockPath?: string;
  lockPort?: number;
  acquireTimeoutMs?: number;
  retryIntervalMs?: number;
};

type TestInfoAttachmentLike = {
  attach(
    name: string,
    options: { body: string; contentType: string },
  ): Promise<void>;
};

export const RELEASE_GATE_MUTATION_LOCK_PATH = join(
  tmpdir(),
  "vvp-test-tower-release-gate-smoke.lock",
);
export const RELEASE_GATE_MUTATION_LOCK_PORT = 47_231;

export type SmokeTimeoutBudgets = {
  fixtureMs: number;
  lockAcquireMs: number;
  requestMs: number;
  cleanupMs: number;
  disposalMs: number;
  releaseMs: number;
  attachmentsMs: number;
  marginMs: number;
};

export const SMOKE_TIMEOUT_BUDGETS: Readonly<SmokeTimeoutBudgets> =
  Object.freeze({
    fixtureMs: 300_000,
    lockAcquireMs: 30_000,
    requestMs: 10_000,
    cleanupMs: 90_000,
    disposalMs: 5_000,
    releaseMs: 5_000,
    attachmentsMs: 10_000,
    marginMs: 60_000,
  });

export function assertSmokeFixtureBudget(
  budgets: SmokeTimeoutBudgets = SMOKE_TIMEOUT_BUDGETS,
): { reservedMs: number; remainingMs: number } {
  const reservedMs =
    budgets.lockAcquireMs +
    budgets.cleanupMs +
    budgets.disposalMs +
    budgets.releaseMs +
    budgets.attachmentsMs +
    budgets.marginMs;
  if (budgets.lockAcquireMs > 30_000) {
    throw new Error(
      `Gate-lock acquisition budget must not exceed 30000ms, got ${budgets.lockAcquireMs}ms.`,
    );
  }
  if (reservedMs > budgets.fixtureMs) {
    throw new Error(
      `Fixture timeout ${budgets.fixtureMs}ms is smaller than the reserved budget ${reservedMs}ms.`,
    );
  }
  return {
    reservedMs,
    remainingMs: budgets.fixtureMs - reservedMs,
  };
}

export function assertGateMutationIsAllowed({
  optIn,
  baseUrl,
}: {
  optIn: string | undefined;
  baseUrl: string;
}): void {
  if (optIn !== "1") {
    throw new Error(
      "Release-gate smoke mutation is disabled. Set E2E_ALLOW_GLOBAL_GATE_MUTATION=1 only for an isolated local test environment.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      `Release-gate smoke mutation requires a valid loopback E2E_BASE_URL, got ${JSON.stringify(baseUrl)}.`,
    );
  }

  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname)) {
    throw new Error(
      `Release-gate smoke mutation is restricted to loopback E2E_BASE_URL values, got ${JSON.stringify(baseUrl)}.`,
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      `Release-gate smoke mutation requires an HTTP(S) E2E_BASE_URL, got ${JSON.stringify(baseUrl)}.`,
    );
  }
}

export function canonicalizeEditableRules(
  rules: ReadonlyArray<ReleaseGateRule>,
): string[] {
  return rules
    .map((rule) =>
      JSON.stringify({
        checkType: rule.checkType,
        operator: rule.operator,
        expectedValue: rule.expectedValue,
        severity: rule.severity,
        blocking: rule.blocking,
        message: rule.message,
      }),
    )
    .sort();
}

function parseLockOwner(value: string): GateMutationLockOwner | undefined {
  try {
    const owner = JSON.parse(value) as Partial<GateMutationLockOwner>;
    if (
      typeof owner.token !== "string" ||
      typeof owner.pid !== "number" ||
      typeof owner.hostname !== "string" ||
      typeof owner.acquiredAt !== "string" ||
      typeof owner.port !== "number"
    ) {
      return undefined;
    }
    return owner as GateMutationLockOwner;
  } catch {
    return undefined;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function publishLockOwner(
  lockPath: string,
  owner: GateMutationLockOwner,
): Promise<void> {
  const candidatePath = `${lockPath}.candidate-${process.pid}-${randomUUID()}`;
  const handle = await open(candidatePath, "wx");
  try {
    const metadata: GateMutationLockMetadata = {
      ...owner,
      state: "active",
    };
    await handle.writeFile(JSON.stringify(metadata), "utf8");
    await handle.sync();
    await handle.close();
    try {
      await link(candidatePath, lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      let recoveryContext = "existing metadata is stale or malformed";
      try {
        const existing = JSON.parse(
          await readFile(lockPath, "utf8"),
        ) as Partial<GateMutationLockMetadata>;
        if (existing.state === "poisoned") {
          recoveryContext =
            `metadata is poisoned after cleanup failure: ${
              existing.cleanupFailures?.join(" | ") ??
              "unknown cleanup failure"
            }`;
        }
      } catch {
        // The generic stale/malformed context remains actionable.
      }
      throw new Error(
        `Poisoned or stale lock metadata exists at ${lockPath} without a live lock lease; ${recoveryContext}. Refusing global gate mutation: manually verify and restore the Standard Product Gate, then remove this metadata file before retrying.`,
        { cause: error },
      );
    }
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(candidatePath).catch(() => undefined);
  }
}

async function poisonLockMetadata(
  lockPath: string,
  owner: GateMutationLockOwner,
  cleanupErrors: ReadonlyArray<Error>,
): Promise<void> {
  const currentOwner = parseLockOwner(await readFile(lockPath, "utf8"));
  if (currentOwner?.token !== owner.token) {
    throw new Error(
      `Refusing to poison release-gate lock owned by ${currentOwner?.token ?? "an unknown process"}.`,
    );
  }
  const metadata: GateMutationLockMetadata = {
    ...owner,
    state: "poisoned",
    poisonedAt: new Date().toISOString(),
    cleanupFailures: cleanupErrors
      .slice(0, 16)
      .map((error) => error.message.slice(0, 2_000)),
  };
  const handle = await open(lockPath, "r+");
  try {
    await handle.truncate(0);
    await handle.writeFile(JSON.stringify(metadata), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function bindLockServer(port: number): Promise<Server> {
  const server = createServer((socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      server.unref();
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port, exclusive: true });
  });
}

async function closeLockServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    (
      server as Server & {
        closeAllConnections?: () => void;
      }
    ).closeAllConnections?.();
  });
}

export async function releaseLockLease({
  metadataWork,
  closeLease,
  timeoutMs,
  closeReserveMs,
}: {
  metadataWork: () => Promise<void>;
  closeLease: () => Promise<void>;
  timeoutMs: number;
  closeReserveMs: number;
}): Promise<void> {
  const metadataTimeoutMs = timeoutMs - closeReserveMs;
  if (metadataTimeoutMs <= 0 || closeReserveMs <= 0) {
    throw new Error(
      `Lock release timeout ${timeoutMs}ms must reserve positive metadata and close phases.`,
    );
  }

  let metadataError: unknown;
  let closeError: unknown;
  try {
    await withTimeout(
      metadataWork(),
      metadataTimeoutMs,
      "lock metadata release",
    );
  } catch (error) {
    metadataError = error;
  } finally {
    try {
      await withTimeout(
        closeLease(),
        closeReserveMs,
        "lock lease closure",
      );
    } catch (error) {
      closeError = error;
    }
  }

  if (metadataError && closeError) {
    throw new AggregateError(
      [metadataError, closeError],
      "Lock metadata release and lease closure both failed",
    );
  }
  if (metadataError) {
    throw metadataError;
  }
  if (closeError) {
    throw closeError;
  }
}

export async function acquireGateMutationLock(
  options: AcquireGateMutationLockOptions = {},
): Promise<GateMutationLock> {
  const lockPath = options.lockPath ?? RELEASE_GATE_MUTATION_LOCK_PATH;
  const requestedPort =
    options.lockPort ?? RELEASE_GATE_MUTATION_LOCK_PORT;
  const acquireTimeoutMs = options.acquireTimeoutMs ?? 240_000;
  const retryIntervalMs = options.retryIntervalMs ?? 250;
  const deadline = Date.now() + acquireTimeoutMs;
  let lastOwner: GateMutationLockOwner | undefined;

  while (true) {
    let server: Server;
    try {
      server = await bindLockServer(requestedPort);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        throw error;
      }
      try {
        lastOwner = parseLockOwner(await readFile(lockPath, "utf8"));
      } catch (metadataError) {
        if ((metadataError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw metadataError;
        }
      }
      if (Date.now() >= deadline) {
        throw new Error(
          lastOwner
            ? `Release-gate mutation lock is already held by PID ${lastOwner.pid} on ${lastOwner.hostname} since ${lastOwner.acquiredAt}.`
            : "Release-gate mutation lock is already held by a live local process.",
        );
      }
      await delay(
        Math.min(retryIntervalMs, Math.max(1, deadline - Date.now())),
      );
      continue;
    }

    const address = server.address();
    const lockPort =
      typeof address === "object" && address ? address.port : requestedPort;
    const owner: GateMutationLockOwner = {
      token: randomUUID(),
      pid: process.pid,
      hostname: hostname(),
      acquiredAt: new Date().toISOString(),
      port: lockPort,
    };
    try {
      await publishLockOwner(lockPath, owner);
    } catch (error) {
      await closeLockServer(server).catch(() => undefined);
      throw error;
    }

    let released = false;
    return {
      lockPath,
      lockPort,
      owner,
      async release(options = {}): Promise<void> {
        if (released) {
          return;
        }
        const cleanupErrors = options.cleanupErrors ?? [];
        try {
          await releaseLockLease({
            metadataWork: async () => {
              if (cleanupErrors.length > 0) {
                await poisonLockMetadata(lockPath, owner, cleanupErrors);
              } else {
                const currentOwner = parseLockOwner(
                  await readFile(lockPath, "utf8"),
                );
                if (currentOwner?.token !== owner.token) {
                  throw new Error(
                    `Refusing to release release-gate lock owned by ${currentOwner?.token ?? "an unknown process"}.`,
                  );
                }
                await unlink(lockPath);
              }
            },
            closeLease: () => closeLockServer(server),
            timeoutMs: SMOKE_TIMEOUT_BUDGETS.releaseMs,
            closeReserveMs: 1_000,
          });
        } finally {
          released = true;
        }
      },
    };
  }
}

async function responseFailure(
  label: string,
  response: ApiResponseLike,
  acceptedStatuses: number[],
): Promise<Error | undefined> {
  if (acceptedStatuses.includes(response.status())) {
    return undefined;
  }
  return new Error(
    `${label}: ${response.status()} ${await response.text()}`,
  );
}

async function captureCleanupError(
  errors: Error[],
  label: string,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    errors.push(
      error instanceof Error
        ? new Error(`${label}: ${error.message}`, { cause: error })
        : new Error(`${label}: ${String(error)}`),
    );
  }
}

export async function cleanupSmokeResources(
  request: ApiRequestLike,
  state: SmokeCleanupState,
): Promise<Error[]> {
  const errors: Error[] = [];

  await captureCleanupError(errors, "cleanup login", async () => {
    const response = await request.post("/api/auth/login", {
      data: state.credentials,
    });
    const failure = await responseFailure("cleanup login", response, [200]);
    if (failure) {
      throw failure;
    }
  });

  if (state.gateWasMutated && state.gateSnapshot) {
    await captureCleanupError(errors, "gate restore", async () => {
      const response = await request.patch(
        `/api/release-gates/${state.gateSnapshot!.id}`,
        { data: { rules: state.gateSnapshot!.rules } },
      );
      const failure = await responseFailure("gate restore", response, [200]);
      if (failure) {
        throw failure;
      }
    });

    await captureCleanupError(
      errors,
      "gate restore verification",
      async () => {
        const response = await request.get(
          `/api/release-gates/${state.gateSnapshot!.id}`,
        );
        const failure = await responseFailure(
          "gate restore verification",
          response,
          [200],
        );
        if (failure) {
          throw failure;
        }
        const restored = (await response.json()) as ReleaseGate;
        const expected = canonicalizeEditableRules(
          state.gateSnapshot!.rules,
        );
        const actual = canonicalizeEditableRules(restored.rules);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(
            `editable rule multiset mismatch; expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
          );
        }
      },
    );
  }

  let productId = state.productId;
  if (!productId) {
    await captureCleanupError(errors, "product lookup", async () => {
      const response = await request.get(
        `/api/products?search=${encodeURIComponent(state.productCode)}&includeArchived=true`,
      );
      const failure = await responseFailure("product lookup", response, [200]);
      if (failure) {
        throw failure;
      }
      const products = (await response.json()) as Array<{
        id: string;
        code: string;
      }>;
      productId = products.find(
        (product) => product.code === state.productCode,
      )?.id;
    });
  }

  let tokenId = state.tokenId;
  if (productId && !tokenId) {
    await captureCleanupError(errors, "token lookup", async () => {
      const response = await request.get(
        `/api/products/${productId}/tokens`,
      );
      const failure = await responseFailure("token lookup", response, [200]);
      if (failure) {
        throw failure;
      }
      const tokens = (await response.json()) as Array<{
        id: string;
        name: string;
        revoked: boolean;
      }>;
      tokenId = tokens.find(
        (token) => token.name === state.tokenName && !token.revoked,
      )?.id;
    });
  }

  if (productId && tokenId) {
    await captureCleanupError(errors, "token revoke", async () => {
      const response = await request.delete(
        `/api/products/${productId}/tokens/${tokenId}`,
      );
      const failure = await responseFailure("token revoke", response, [200]);
      if (failure) {
        throw failure;
      }
    });
  }

  if (productId) {
    await captureCleanupError(errors, "product archive", async () => {
      const response = await request.delete(`/api/products/${productId}`);
      const failure = await responseFailure(
        "product archive",
        response,
        [200],
      );
      if (failure) {
        throw failure;
      }
      const archived = (await response.json()) as { status?: string };
      if (archived.status !== "Archived") {
        throw new Error(
          `product archive verification: expected Archived, got ${String(archived.status)}`,
        );
      }
    });
  }

  return errors;
}

export async function safelyAttachCleanupErrors(
  testInfo: TestInfoAttachmentLike,
  errors: ReadonlyArray<Error>,
): Promise<void> {
  for (const [index, error] of errors.entries()) {
    try {
      await testInfo.attach(`cleanup-error-${index + 1}`, {
        body: error.stack ?? error.message,
        contentType: "text/plain",
      });
    } catch {
      // Attachments are diagnostics and must never replace test/cleanup errors.
    }
  }
}

export function combineSmokeFailures(
  primaryError: unknown,
  cleanupErrors: ReadonlyArray<Error>,
): unknown {
  if (primaryError !== undefined && cleanupErrors.length > 0) {
    return new AggregateError(
      [primaryError, ...cleanupErrors],
      "Smoke verification and cleanup both failed",
    );
  }
  if (primaryError !== undefined) {
    return primaryError;
  }
  if (cleanupErrors.length === 1) {
    return cleanupErrors[0];
  }
  if (cleanupErrors.length > 1) {
    return new AggregateError(cleanupErrors, "Smoke cleanup failed");
  }
  return undefined;
}

export async function withTimeout<T>(
  action: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
