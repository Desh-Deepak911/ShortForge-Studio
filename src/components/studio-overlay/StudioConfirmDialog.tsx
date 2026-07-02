"use client";

import {
  studioDestructiveConfirmButton,
  studioSecondaryButton,
  studioShellSectionDesc,
} from "@/lib/utils/studioUi";

import StudioOverlay from "./StudioOverlay";

export interface StudioConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

/**
 * In-app confirmation dialog — replaces window.confirm for Studio flows.
 */
export default function StudioConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  destructive = false,
}: StudioConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <StudioOverlay
      open={open}
      onOpenChange={onOpenChange}
      variant="modal-center"
      title={title}
      titleId="studio-confirm-title"
      closeLabel="Close confirmation"
      maxWidthClassName="max-w-md"
      keepMounted={false}
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={`${studioSecondaryButton} w-full sm:flex-1`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`${
              destructive ? studioDestructiveConfirmButton : studioSecondaryButton
            } w-full sm:flex-1`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className={studioShellSectionDesc}>{description}</p>
    </StudioOverlay>
  );
}
