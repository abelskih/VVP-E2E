export type ProductRegistrationResult = { code: string; created: boolean };
export type ProductReconciliationResult = {
  created: string[];
  existing: string[];
  rejected: Array<{ code: string; error: string }>;
};

export function validateProductCode(code: unknown): string;
export function registerProduct(input: {
  rootDir: string;
  productCode: unknown;
}): Promise<ProductRegistrationResult>;
export function reconcileProducts(input: {
  rootDir: string;
  productCodes: unknown[];
}): Promise<ProductReconciliationResult>;
