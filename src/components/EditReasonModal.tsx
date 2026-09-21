import { Button, Modal } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The candidate reconnected/refreshed and this is actually a disconnection -- discards the pending edit and opens the Disconnection form instead. */
  onDisconnection: () => void;
  /** The previous answer or timestamp was just wrong -- applies the pending edit as a correction. */
  onCorrection: () => void;
}

/** Gates any change to a step that already has a saved outcome or timestamp
 *  -- re-picking an outcome, unchecking one, or editing the saved time --
 *  behind a reason, so the record shows whether that happened because the
 *  candidate disconnected and reconnected (which should be logged as a
 *  Disconnection, not silently overwritten) or because the original entry
 *  was simply a mistake. */
export default function EditReasonModal({ open, onClose, onDisconnection, onCorrection }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Why is this changing?">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-text-2 leading-relaxed">
          This step already has a saved answer. Let us know why it's changing so the record stays accurate.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={onDisconnection}>Disconnection happened — log it</Button>
          <Button variant="secondary" onClick={onCorrection}>
            Just correcting a mistake
          </Button>
        </div>
        <Button variant="ghost" onClick={onClose} className="self-start">
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
