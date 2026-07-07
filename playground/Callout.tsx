import type { ReactNode } from "react";

export function Callout(props: { kind: "note" | "warning"; children?: ReactNode }) {
  return <div className={`callout callout-${props.kind}`}>{props.children}</div>;
}
