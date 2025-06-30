import { Button, styles } from "../button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "../dialog";
import { useState } from "react";

interface ConfirmDialogProps {
  onConfirm: () => void;
  triggerLabel: string | React.ReactElement;
  title: string;
  text: string;
  color: keyof typeof styles.colors;
}
export const ConfirmDialog = ({
  onConfirm,
  triggerLabel,
  title,
  text,
  color,
}: ConfirmDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button color={color} type="button" onClick={() => setIsOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={isOpen} onClose={setIsOpen}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{text}</DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setIsOpen(false);
              onConfirm();
            }}
          >
            Okay
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
