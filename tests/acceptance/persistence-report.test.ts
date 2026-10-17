import { expect, it } from 'vitest';
import { assertPhysicalRecovery, extractReport } from '../../scripts/persistence-proof.mjs';

it('extracts one versioned observation without treating logs as acceptance', () => {
  expect(extractReport('test log\n AC29_REPORT {"formatVersion":1,"level":"controlled"}\n', 'AC29_REPORT'))
    .toEqual({ formatVersion: 1, level: 'controlled' });
});

it('extracts reports wrapped in Vitest terminal colors and still rejects colored duplicates', () => {
  const line = '\u001b[22m\u001b[39mAC29_REPORT {"formatVersion":1,"level":"controlled"}\u001b[0m';
  expect(extractReport(line, 'AC29_REPORT')).toEqual({ formatVersion: 1, level: 'controlled' });
  expect(() => extractReport(line + '\n' + line, 'AC29_REPORT')).toThrow('PROOF_REPORT_MISSING_OR_DUPLICATE');
});

it.each(['', 'AC29_REPORT {}', 'AC29_REPORT []', 'AC29_REPORT null', 'AC29_REPORT {"formatVersion":2}',
  'AC29_REPORT invalid', 'AC29_REPORT {"formatVersion":1}\nAC29_REPORT {"formatVersion":1}'])('refuses missing, invalid or duplicate observations: %s', output => {
  expect(() => extractReport(output, 'AC29_REPORT')).toThrow();
});

const physicalRecovery = () => ({ controller: 'distinct_processes_after_SIGKILL', controllerPids: [101, 102, 103],
  controllerStarts: [101, 102, 103].map((pid, index) => ({ pid, readyAtMs: 100 + index * 100 })),
  controllerExits: [101, 102, 103].map((pid, index) => ({ pid, signal: 'SIGKILL', closedAtMs: 190 + index * 100 })),
  physicalProcesses: { allExitsObserved: true, started: [{ pid: 201, passageId: 'implementer' }, { pid: 202, passageId: 'reviewer' }],
    stops: [201, 202].map((pid, index) => ({ pid, passageId: index === 0 ? 'implementer' : 'reviewer', exitCode: null, signal: 'SIGKILL', closeObservedAtMs: 150, receiptRecordedAtMs: 151 })) },
  recovery: { approvedRefTreeBasePreserved: true, eligibleRemoval: true, diffAfterRemovalAndRestart: true } });

it('requires physical process recovery in addition to a successful controlled cache measurement', () => {
  expect(() => assertPhysicalRecovery(physicalRecovery())).not.toThrow();
  expect(() => assertPhysicalRecovery({ controller: 'in_process_close_reopen', physicalProcesses: 'not_started' })).toThrow('PROOF_PHYSICAL_RECOVERY_MISSING');
});

it('refuses reused controller PIDs, unobserved exits and missing recovery after removal', () => {
  const samePid = physicalRecovery(); samePid.controllerPids = [101, 101, 103];
  const unconfirmed = physicalRecovery(); unconfirmed.physicalProcesses.allExitsObserved = false;
  const noStops = physicalRecovery(); noStops.physicalProcesses.stops = [];
  const noRecovery = physicalRecovery(); noRecovery.recovery.diffAfterRemovalAndRestart = false;
  const unmatched = physicalRecovery(); unmatched.physicalProcesses.stops[0]!.pid = 999;
  const earlyReceipt = physicalRecovery(); earlyReceipt.physicalProcesses.stops[0]!.receiptRecordedAtMs = 149;
  const overlapping = physicalRecovery(); overlapping.controllerStarts[1]!.readyAtMs = 180;
  const noExits = physicalRecovery(); noExits.controllerExits = [];
  for (const invalid of [samePid, unconfirmed, noStops, noRecovery, unmatched, earlyReceipt, overlapping, noExits]) {
    expect(() => assertPhysicalRecovery(invalid)).toThrow('PROOF_PHYSICAL_RECOVERY_MISSING');
  }
});
