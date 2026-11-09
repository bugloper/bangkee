import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, CrownIcon, MessageCircleIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { StaffRole } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { ErrorBox, Field, FormActions, Loading } from "@/components/form"
import { Empty, Initial, Note, Panel } from "@/components/kit"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { confirm } from "@/lib/confirm"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { useMe } from "@/lib/me"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { longDate } from "@/lib/time"

export const Route = createFileRoute("/_app/staff")({ component: StaffScreen })

const ROLES: [StaffRole, string, string][] = [
  ["cashier", "Cashier", "Adds customers, records credits and payments"],
  ["manager", "Manager", "Also corrects entries, and looks after plans, reminders, items and suppliers"],
  ["viewer", "Read only", "Sees the book, changes nothing"],
]

// The people who work in the shop. Each signs in as themselves, so every
// entry says who recorded it. Billing, bank details, the shop's settings and
// the staff stay the owner's.
function StaffScreen() {
  usePage("Staff", "/settings", { narrow: true })
  const { data } = useQuery({ queryKey: ["staff"], queryFn: api.staff })
  const done = async (result: { notice?: string }) => {
    flashNotice(result.notice)
    await refreshAll()
  }
  const role = useMutation({ mutationFn: ({ id, value }: { id: number; value: StaffRole }) => api.changeStaffRole(id, value), onSuccess: done })
  const remove = useMutation({ mutationFn: (id: number) => api.removeStaff(id), onSuccess: done })
  const withdraw = useMutation({ mutationFn: (id: number) => api.withdrawStaffInvitation(id), onSuccess: done })
  if (!data) return <Loading />
  const used = data.members.length + data.invitations.length

  return (
    <div className="grid gap-5">
      {!data.plan_allows ? (
        <Note icon={CrownIcon}>
          Staff accounts come with the Business plan.{" "}
          <AppLink href="/subscription" className="font-medium text-primary hover:underline">
            See plans
          </AppLink>
        </Note>
      ) : used < data.max_staff ? (
        <InviteForm />
      ) : (
        <Note>All {data.max_staff} places on your plan are taken. Remove someone, or withdraw an invitation, to invite another.</Note>
      )}

      <Panel flush title="Your staff" description={`${used} of ${data.max_staff} places used`}>
        {data.members.length > 0 ? (
          <div className="divide-y">
            {data.members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3.5 sm:px-5">
                <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
                  <Initial text={member.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{member.name}</div>
                    <div className="truncate text-[0.8125rem] text-muted-foreground">
                      {member.email_address} · since {longDate(member.since)}
                    </div>
                  </div>
                </div>
                <NativeSelect
                  aria-label={`${member.name}'s role`}
                  value={member.role}
                  disabled={role.isPending}
                  onChange={(event) => role.mutate({ id: member.id, value: event.target.value as StaffRole })}
                  className="w-36 max-sm:ml-12"
                >
                  {ROLES.map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={async () => {
                    if (await confirm(`Remove ${member.name}?|They are signed out at once and can no longer open the shop's book. What they recorded stays, under their name.`, { danger: true }))
                      remove.mutate(member.id)
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={UsersIcon} title="Nobody yet">
            Invite the people who work at the counter, so each entry shows who recorded it.
          </Empty>
        )}
      </Panel>

      {data.invitations.length > 0 && (
        <Panel flush title="Invitations not yet used">
          <div className="divide-y">
            {data.invitations.map((invitation) => (
              <div key={invitation.id} className="grid gap-2 px-4 py-3.5 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {invitation.name} · {invitation.role_name}
                    </div>
                    <div className="truncate text-[0.8125rem] text-muted-foreground">
                      {invitation.email_address} · until {longDate(invitation.expires_at)}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" disabled={withdraw.isPending} onClick={() => withdraw.mutate(invitation.id)}>
                    Withdraw
                  </Button>
                </div>
                <ShareLink path={invitation.join_path} name={invitation.name} />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function InviteForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<StaffRole>("cashier")
  const invite = useMutation({
    mutationFn: () => api.inviteStaff({ name, email_address: email, role }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      setName("")
      setEmail("")
      await refreshAll()
    },
  })
  return (
    <Panel title="Invite someone" description="They get a link to choose a password and join. Send it to them only.">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          invite.mutate()
        }}
      >
        <ErrorBox errors={validationErrors(invite.error)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="staff-name">
            <Input id="staff-name" required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Email" htmlFor="staff-email" hint="Their own; new to Bangkee">
            <Input id="staff-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
        <Field label="Role" htmlFor="staff-role">
          <NativeSelect id="staff-role" value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>
            {ROLES.map(([value, label, line]) => (
              <NativeSelectOption key={value} value={value} title={line}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <p className="-mt-2 text-[0.8125rem] text-muted-foreground">{ROLES.find(([value]) => value === role)?.[2]}.</p>
        <FormActions>
          <Button type="submit" disabled={invite.isPending}>
            <UserPlusIcon /> Make an invitation
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}

function ShareLink({ path, name }: { path: string; name: string }) {
  const me = useMe()
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${path}`
  const message = `${me?.shop?.name ?? "Our shop"} has added you to its Bangkee book. Open this link to choose a password and join: ${url}`
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} aria-label={`${name}'s invitation link`} className="font-mono text-[0.8125rem]" onFocus={(event) => event.target.select()} />
      <Button
        variant="outline"
        aria-label="Copy link"
        onClick={async () => {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" aria-label="Send on WhatsApp" className={buttonVariants({ variant: "outline" })}>
        <MessageCircleIcon />
      </a>
    </div>
  )
}
