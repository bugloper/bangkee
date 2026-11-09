import { queryOptions, useQuery } from "@tanstack/react-query"

import { api, ApiError } from "@/api/client"
import type { Feature, Me } from "@/api/types"

/** Who is signed in — null for a visitor. The shell's one query. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    try {
      return await api.me()
    } catch (error) {
      if (error instanceof ApiError && error.unauthenticated) return null
      throw error
    }
  },
  staleTime: 15_000,
})

export function useMe() {
  return useQuery(meQuery).data ?? null
}

/** Whether the signed-in shop's plan (or its trial) includes a feature. The server checks again on every use. */
export function useFeature(feature: Feature): boolean {
  return useMe()?.subscription?.features.includes(feature) ?? false
}
