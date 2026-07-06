export function Chart(props: { data: number[] }) {
  return <div>{props.data.join(', ')}</div>
}
