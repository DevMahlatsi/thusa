import { ActionButton } from "./action-button";

// Sends only which parent and which due date. The server works out the amount from the schedule.
export function SendRequestButton({ payerId, dueDate, parentName }: { payerId: string; dueDate: string; parentName: string }) {
  return (
    <ActionButton
      url="/api/collections"
      body={{ payerId, dueDate }}
      label="Send request"
      busyLabel="Sending…"
      ariaLabel={`Send payment request to ${parentName}`}
    />
  );
}

// No amount: the server requests what's still owed (amount − paid so far).
export function RequestBalanceButton({ collectionId, parentName }: { collectionId: string; parentName: string }) {
  return (
    <ActionButton
      url={`/api/collections/${collectionId}/balance`}
      body={{}}
      label="Request balance"
      busyLabel="Sending…"
      ariaLabel={`Send ${parentName} a payment link for the balance`}
    />
  );
}

export function RemindButton({ collectionId, parentName }: { collectionId: string; parentName: string }) {
  return (
    <ActionButton
      url={`/api/collections/${collectionId}/reminders`}
      body={{}}
      label="Remind"
      busyLabel="Sending…"
      ariaLabel={`Send ${parentName} a reminder`}
      secondary
    />
  );
}
