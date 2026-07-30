"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[min(var(--radius-4xl),24px)] bg-popover p-6 text-popover-foreground shadow-xl ring-1 ring-foreground/5 duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 dark:ring-foreground/10",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  icon: Icon,
  iconVariant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** Optional icon shown in a colored circle beside the title/description. */
  icon?: React.ElementType
  iconVariant?: "default" | "destructive"
}) {
  if (!Icon) {
    return (
      <div
        data-slot="alert-dialog-header"
        className={cn("flex flex-col gap-1.5", className)}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-row items-start gap-3", className)}
      {...props}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          iconVariant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1 pt-1">{children}</div>
    </div>
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("mt-6 flex justify-end gap-2", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "destructive",
  ...props
}: AlertDialogPrimitive.Close.Props & { variant?: React.ComponentProps<typeof Button>["variant"] }) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant, size: "lg" }), className)}
      {...props}
    />
  )
}

function AlertDialogCancel({ className, ...props }: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "ghost", size: "lg" }), className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
