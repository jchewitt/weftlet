import type { Status } from '@public/contracts';
declare global {
  namespace JSX {
    interface IntrinsicElements { span: { children?: unknown } }
    interface Element {}
  }
}
export function StatusCard(props: { status: Status }): JSX.Element {
  return <span>{props.status.state}</span>;
}
export function screen(status: Status): JSX.Element {
  return <StatusCard status={status} />;
}
