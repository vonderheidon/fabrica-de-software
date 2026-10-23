using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

internal static class TerminalJob {
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long User, Kernel, PeriodUser, PeriodKernel;
        public uint Faults, Total, Active, Terminated;
    }
    [StructLayout(LayoutKind.Sequential)] struct Limits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr Minimum, Maximum;
        public uint Active;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public Limits Basic;
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, int size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting value, int size, IntPtr length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static void Require(bool value) { if (!value) throw new InvalidOperationException(); }
    static Accounting Read(IntPtr job) {
        Accounting value;
        Require(QueryInformationJobObject(job, 1, out value, Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
        return value;
    }
    public static int Main(string[] args) {
        try {
            Guid id;
            if (args.Length < 2 || !Guid.TryParseExact(args[1], "D", out id)) return 2;
            string name = "Local\\FactoryTerminal-" + id.ToString("D");
            if (args[0] == "hold" && args.Length == 2) {
                using (var gate = new Mutex(false, name + "-gate"))
                using (var sealedJob = new EventWaitHandle(false, EventResetMode.ManualReset, name + "-sealed")) {
                    IntPtr job = CreateJobObject(IntPtr.Zero, name);
                    Require(job != IntPtr.Zero);
                    try {
                        Require(Marshal.GetLastWin32Error() != 183);
                        var limits = new ExtendedLimits();
                        limits.Basic.Flags = 0x2000; // Last owner closes: stop only this job's tree.
                        Require(SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf(typeof(ExtendedLimits))));
                        Console.WriteLine("ready"); Console.Out.Flush();
                        string command;
                        while ((command = Console.ReadLine()) != null) {
                            gate.WaitOne();
                            try {
                                if (command == "stop") {
                                    sealedJob.Set();
                                    Require(TerminateJobObject(job, 1));
                                } else if (command != "check") return 2;
                                var value = Read(job);
                                // An empty job before attachment never proves a stopped launch.
                                Console.WriteLine(value.Total > 0 && value.Active == 0 ? "stopped" : "unconfirmed");
                                Console.Out.Flush();
                            } finally { gate.ReleaseMutex(); }
                        }
                    } finally { sealedJob.Set(); CloseHandle(job); }
                }
                return 0;
            }
            if (args[0] == "attach" && args.Length == 3) {
                int pid; if (!int.TryParse(args[2], out pid) || pid <= 0) return 2;
                using (var gate = Mutex.OpenExisting(name + "-gate"))
                using (var sealedJob = EventWaitHandle.OpenExisting(name + "-sealed")) {
                    gate.WaitOne();
                    try {
                        Require(!sealedJob.WaitOne(0));
                        IntPtr job = OpenJobObject(1, false, name);
                        Require(job != IntPtr.Zero);
                        try {
                            using (var parent = Process.GetProcessById(pid)) Require(AssignProcessToJobObject(job, parent.Handle));
                        } finally { CloseHandle(job); }
                    } finally { gate.ReleaseMutex(); }
                }
                return 0;
            }
            return 2;
        } catch { Console.Error.WriteLine("TERMINAL_JOB_FAILED"); return 1; }
    }
}
