import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { SiteFooter, SiteHeader } from "@/components/landing"
import { ShopHeader, ShopMenu } from "@/components/shop-view"
import { buttonVariants } from "@/components/ui/button"
import { meQuery } from "@/lib/me"
import { usePage } from "@/lib/page"

// A shop's page for visitors from the homepage: the same page customers see
// in the app, with the site's header instead of the app's. Someone signed in
// gets the app's own page.
export const Route = createFileRoute("/shop/$id")({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me) throw redirect({ to: "/shops/$id", params, replace: true })
  },
  component: PublicShop,
})

function PublicShop() {
  const id = Number(Route.useParams().id)
  const { data, isError } = useQuery({ queryKey: ["public_shop", id], queryFn: () => api.publicShopPage(id), meta: { handlesErrors: true }, retry: false })
  usePage(data?.shop.name)

  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pt-6 pb-20 sm:px-8 sm:pt-10">
        <a href="/#shops" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> All shops
        </a>
        {isError ? (
          <div className="rounded-2xl border bg-card px-5 py-12 text-center">
            <h1 className="text-lg font-semibold">That shop is not on Bangkee</h1>
            <p className="mt-1 text-muted-foreground">It may have closed its page. Have a look at the other shops.</p>
          </div>
        ) : !data ? (
          <Loading />
        ) : (
          <div className="grid gap-6">
            {/* A desktop keeps who the shop is in view beside what it sells. */}
            <div className="mx-auto grid w-full max-w-2xl gap-4 xl:max-w-none xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start xl:gap-6">
              <div className="xl:sticky xl:top-24">
                <ShopHeader shop={data.shop} mine={false} />
              </div>
              <ShopMenu data={data} />
            </div>
            <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-3xl border bg-card px-6 py-8 text-center xl:max-w-3xl">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Buy here on credit?</h2>
                <p className="mt-1 text-muted-foreground">Ask {data.shop.name} to add you on Bangkee. You will see your balance and every entry on your own phone — free.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link to="/session/new" className={buttonVariants({ variant: "outline" })}>
                  Sign in
                </Link>
                <Link to="/registration/new" className={buttonVariants()}>
                  Run a shop? Start free <ArrowRightIcon />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
