import { cn } from "@/lib/misc-utils";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

const ResizablePanelGroup = ({
  className,
  orientation,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    orientation={orientation}
    className={cn(
      "flex h-full w-full",
      orientation === "vertical" && "flex-col",
      className
    )}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      // react-resizable-panels v4 sets aria-orientation on the separator
      // (horizontal separator ⇒ vertically-stacked group), NOT the older
      // data-panel-group-direction attribute — so the flip is keyed off
      // aria-orientation.
      //
      // The separator itself is a comfortable ~6px band (w-1.5 / h-1.5) so
      // the resize cursor is easy to hit; the visible 1px line is drawn by
      // ::before centered in that band (the band is otherwise transparent).
      // A 1px separator with only a pseudo hit-strip was effectively
      // un-hittable — the cursor never showed. z-10 keeps the band above
      // the neighbouring panels.
      "relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:top-1/2 aria-[orientation=horizontal]:before:h-px aria-[orientation=horizontal]:before:w-full aria-[orientation=horizontal]:before:translate-x-0 aria-[orientation=horizontal]:before:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.Separator>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
