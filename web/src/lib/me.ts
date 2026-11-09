import { queryOptions, useQuery } from "@tanstack/react-query"

import { api, ApiError } from "@/api/client"
import type { Feature, Me, Permission } from "@/api/types"

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

/** Owner or staff: the person works on the shop's side of the book. */
export function onShopSide(me: Me | null | undefined): boolean {
  return !!me?.shop && (me.user.role === "shop_owner" || me.user.role === "staff")
}

/** Whether the signed-in person may do this on the shop's side. The server checks again on every request. */
export function useCan(permission: Permission): boolean {
  return useMe()?.permissions.includes(permission) ?? false
}
