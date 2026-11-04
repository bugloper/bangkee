import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { BellIcon, CheckCheckIcon } from "lucide-react"

import { api } from "@/api/client"
import type { NotificationKind } from "@/api/types"
import { Loading } from "@/components/form"
import { Empty, Panel } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { useT } from "@/lib/i18n"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { timeAgoInWords } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/notifications")({ component: Notifications })

const DOT: Record<NotificationKind, string> = {
  credit: "bg-primary",
  payment: "bg-paid",
  cross_out: "bg-muted-foreground",
  overdue: "bg-owed",
  sub: "bg-paid",
}

// The bell. Every push notification has a row here too, so the in-app
// centre and the device notification never disagree.
function Notifications() {
  const t = useT()
  usePage(t("notifications.title"), undefined, { narrow: true })
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications })

  const read = useMutation({
    mutationFn: (id: number) => api.readNotification(id),
    onSuccess: async (result) => {
      await refreshAll()
      go(result.path ?? "/notifications")
    },
  })
  const readAll = useMutation({
    mutationFn: api.readAllNotifications,
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })

  if (!data) return <Loading />

  return (
    <Panel
      flush
      title={t("notifications.title")}
      action={
        !!data.unread_count && (
          <Button variant="outline" size="sm" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            <CheckCheckIcon /> {t("notifications.mark_all_read")}
          </Button>
        )
      }
    >
      {data.notifications.length > 0 ? (
        <div className="divide-y">
          {data.notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              className={cn("flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5", !notification.read && "bg-accent/30")}
              onClick={() => read.mutate(notification.id)}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.read ? "bg-border" : DOT[notification.kind])} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", notification.read ? "font-medium text-muted-foreground" : "font-semibold")}>{notification.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{notification.body}</span>
                <span className="mt-1 block text-xs text-muted-foreground/80">{t("notifications.ago", { time: timeAgoInWords(notification.created_at) })}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={BellIcon} title={t("notifications.empty_title")}>
          {t("notifications.empty_body")}
        </Empty>
      )}
    </Panel>
  )
}
