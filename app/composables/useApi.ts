export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, unknown>
}

/**
 * Plainly typed wrapper around `$fetch` for mutations. Reads should keep using
 * the route-typed `useFetch`; pages that fire many distinct mutations exceed
 * TypeScript's instantiation depth with the fully route-typed `$fetch`
 * signature, so writes go through this alias and declare their result type.
 */
export function useApi() {
  return $fetch as unknown as <T = unknown>(url: string, opts?: ApiOptions) => Promise<T>
}
