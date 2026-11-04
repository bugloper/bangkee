import { Link } from "@tanstack/react-router"

import { splitHref } from "@/lib/go"
import { cn } from "@/lib/utils"

/**
 * A link to an app path built at runtime ("/accounts/12?mode=itemized"). The
 * router's typed `to` wants route templates; screens here mostly have ids in
 * hand.
 */
export function AppLink({ href, className, children, ...props }: Omit<React.ComponentProps<"a">, "href"> & { href: string }) {
  const { to, search } = splitHref(href)
  return (
    <Link to={to as never} search={search as never} className={cn(className)} {...(props as object)}>
      {children}
    </Link>
  )
}
