type FocusTarget = Pick<HTMLElement, 'focus'>;

type DialogTabFocusInput = {
  shiftKey: boolean;
  activeElement: FocusTarget | null;
  dialog: FocusTarget;
  focusables: readonly FocusTarget[];
  activeOutsideDialog: boolean;
  preventDefault: () => void;
};

export function wrapDialogTabFocus(input: DialogTabFocusInput): boolean {
  const first = input.focusables[0];
  const last = input.focusables[input.focusables.length - 1];
  if (!first || !last) {
    input.preventDefault();
    input.dialog.focus();
    return true;
  }

  const isAtBoundary = input.activeElement === input.dialog || input.activeOutsideDialog;
  if (input.shiftKey && (input.activeElement === first || isAtBoundary)) {
    input.preventDefault();
    last.focus();
    return true;
  }
  if (!input.shiftKey && (input.activeElement === last || isAtBoundary)) {
    input.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
