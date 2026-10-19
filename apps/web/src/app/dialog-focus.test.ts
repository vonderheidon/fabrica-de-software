import { describe, expect, it } from 'vitest';
import { wrapDialogTabFocus } from './dialog-focus.js';

function target(name: string, calls: string[]) {
  return { focus: () => calls.push(name) };
}

describe('dialog tab focus boundary', () => {
  it('wraps forward from the last control to the first', () => {
    const calls: string[] = [];
    let prevented = false;
    const first = target('first', calls);
    const last = target('last', calls);
    const dialog = target('dialog', calls);
    const handled = wrapDialogTabFocus({ shiftKey: false, activeElement: last, dialog, focusables: [first, last], activeOutsideDialog: false, preventDefault: () => { prevented = true; } });
    expect(handled).toBe(true);
    expect(prevented).toBe(true);
    expect(calls).toEqual(['first']);
  });

  it('wraps backward from the first control to the last', () => {
    const calls: string[] = [];
    const first = target('first', calls);
    const last = target('last', calls);
    const dialog = target('dialog', calls);
    const handled = wrapDialogTabFocus({ shiftKey: true, activeElement: first, dialog, focusables: [first, last], activeOutsideDialog: false, preventDefault: () => undefined });
    expect(handled).toBe(true);
    expect(calls).toEqual(['last']);
  });

  it('leaves interior Tab movement to the browser', () => {
    const calls: string[] = [];
    const first = target('first', calls);
    const middle = target('middle', calls);
    const last = target('last', calls);
    const dialog = target('dialog', calls);
    const handled = wrapDialogTabFocus({ shiftKey: false, activeElement: middle, dialog, focusables: [first, middle, last], activeOutsideDialog: false, preventDefault: () => undefined });
    expect(handled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('keeps focus on the dialog root when it contains no controls', () => {
    const calls: string[] = [];
    let prevented = false;
    const dialog = target('dialog', calls);
    const handled = wrapDialogTabFocus({ shiftKey: false, activeElement: dialog, dialog, focusables: [], activeOutsideDialog: false, preventDefault: () => { prevented = true; } });
    expect(handled).toBe(true);
    expect(prevented).toBe(true);
    expect(calls).toEqual(['dialog']);
  });
});
