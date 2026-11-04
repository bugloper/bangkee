import { cn } from "@/lib/utils"

/** The heading and card each signed-out screen sits in. */
export function AuthFrame({ title, description, children, footer, className }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full max-w-sm", className)}>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}
