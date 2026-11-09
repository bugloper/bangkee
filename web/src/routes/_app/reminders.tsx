import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CrownIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { ReminderSettings } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { Field, FormActions, Loading } from "@/components/form"
import { Note, Panel } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { flashNotice } from "@/lib/flash"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"

export const Route = createFileRoute("/_app/reminders")({ component: ReminderSettingsScreen })

const hourLabel = (hour: number) => `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`

// The shop's automatic reminders: on or off, how often, and at what hour.
function ReminderSettingsScreen() {
  usePage("Reminders", "/settings", { narrow: true })
  const { data } = useQuery({ queryKey: ["reminder-settings"], queryFn: api.reminderSettings })
  if (!data) return <Loading />
  return <SettingsForm settings={data} />
}

function SettingsForm({ settings }: { settings: ReminderSettings }) {
  const [enabled, setEnabled] = useState(settings.enabled && settings.plan_allows)
  const [everyDays, setEveryDays] = useState(settings.every_days)
  const [hour, setHour] = useState(settings.hour)
  const save = useMutation({
    mutationFn: () => api.updateReminderSettings({ enabled, every_days: everyDays, hour }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })
  const hours = Array.from({ length: settings.last_hour - settings.first_hour + 1 }, (_, i) => settings.first_hour + i)

  return (
    <Panel title="Automatic reminders" description={`Bangkee reminds customers whose balance has had no entry for ${settings.credit_due_days} days.`}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        {!settings.plan_allows && (
          <Note icon={CrownIcon}>
            Automatic reminders come with the Pro and Business plans.{" "}
            <AppLink href="/subscription" className="font-medium text-primary hover:underline">
              See plans
            </AppLink>
          </Note>
        )}
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Remind overdue customers</span>
            <span className="block text-[0.8125rem] text-muted-foreground">A notification on their phone. You get one note after each round.</span>
          </span>
          <Switch checked={enabled} disabled={!settings.plan_allows} onCheckedChange={setEnabled} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How often" htmlFor="every">
            <NativeSelect id="every" value={String(everyDays)} disabled={!enabled} onChange={(event) => setEveryDays(Number(event.target.value))}>
              {settings.every_days_options.map((days) => (
                <NativeSelectOption key={days} value={days}>
                  {days === 1 ? "Every day" : `Every ${days} days`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="At" htmlFor="hour">
            <NativeSelect id="hour" value={String(hour)} disabled={!enabled} onChange={(event) => setHour(Number(event.target.value))}>
              {hours.map((h) => (
                <NativeSelectOption key={h} value={h}>
                  {hourLabel(h)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">
          Nobody is reminded more than once a day, and Bangkee skips customers who turned reminders off, those you paused, and anyone with an entry they have flagged.
        </p>
        <FormActions>
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}
