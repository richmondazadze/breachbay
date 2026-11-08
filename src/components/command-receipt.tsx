export function CommandReceipt({ receipt }: { receipt: string }) {
  return <div className="receipt-panel">
    <p role="status">The server accepted your command. Subscribed state confirms the resulting change.</p>
    <details><summary>Inspect audit receipt</summary><p className="command-receipt">{receipt}</p></details>
  </div>;
}
