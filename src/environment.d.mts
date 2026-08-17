export interface E2eEnvironment {
  productCode: string;
  testDir: string;
  baseUrl: string;
}

export function resolveE2eEnvironment(input: {
  rootDir: string;
  env?: Record<string, string | undefined>;
}): E2eEnvironment;
