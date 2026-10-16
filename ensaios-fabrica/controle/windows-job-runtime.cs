using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static partial class WindowsJobProbe {
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint GetFileType(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetConsoleMode(IntPtr handle, out uint mode);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetHandleInformation(IntPtr handle, out uint flags);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);

    static OwnedProcess LaunchTui(string dir,string cwd,string bun,string script,string runId,IntPtr job) {
        var std=new List<IntPtr>(); var info=new List<object>();
        try {
            foreach(int kind in new[]{-10,-11,-12}) {
                IntPtr original=GetStdHandle(kind); Check(original!=IntPtr.Zero && original!=new IntPtr(-1),"Missing standard handle");
                IntPtr copy; Require(DuplicateHandle(GetCurrentProcess(),original,GetCurrentProcess(),out copy,0,true,2),"Duplicate standard handle");
                std.Add(copy); uint mode; bool console=GetConsoleMode(copy,out mode);
                info.Add(new { kind=kind,fileType=GetFileType(copy),consoleModeAvailable=console,consoleMode=console?(uint?)mode:null });
            }
            uint jobHandleFlags; Require(GetHandleInformation(job,out jobHandleFlags),"Get Job handle flags");
            Check((jobHandleFlags & 1)==0,"Job handle must not be inherited");
            Write(Path.Combine(dir,"console-inheritance.json"),new { at=Now,stdHandles=info,startupUseStdHandles=true,jobHandleInheritable=false,creationFlags=Suspended,newConsole=false,detached=false,noWindow=false,scope="Standard handles duplicated inheritable; no explicit all-handle allowlist in this harness" });
            var startup=new Startup(); startup.cb=(uint)Marshal.SizeOf(typeof(Startup)); startup.flags=0x100; startup.input=std[0]; startup.output=std[1]; startup.error=std[2];
            ProcessInfo pi;
            Require(CreateProcessW(bun,new StringBuilder(Quote(bun)+" "+Quote(script)+" "+Quote(runId)),IntPtr.Zero,IntPtr.Zero,true,Suspended,IntPtr.Zero,cwd,ref startup,out pi),"CreateProcessW TUI");
            var root=new OwnedProcess { Handle=pi.process,ThreadHandle=pi.thread,Pid=pi.pid,Role="omp" };
            try {
                root.Created=Creation(root.Handle); Require(AssignProcessToJobObject(job,root.Handle),"Assign OMP before resume");
                Check(Member(root.Handle,job),"OMP membership missing");
                Write(Path.Combine(dir,"omp-assigned-before-resume.json"),new { at=Now,identity=root.Identity,suspended=true,inOwnedJob=true,activeProcesses=Count(job).active });
                root.Resume(); return root;
            } catch { TerminateProcess(root.Handle,CancelCode); WaitForSingleObject(root.Handle,5000); root.Dispose(); throw; }
        } finally { foreach(IntPtr handle in std) Require(CloseHandle(handle),"Close duplicated standard handle"); }
    }
    static void RuntimeWait(string path,OwnedProcess root,DateTime deadline) {
        while(!File.Exists(path) && DateTime.UtcNow<deadline) {
            if(WaitForSingleObject(root.Handle,0)==0) throw new InvalidOperationException("OMP exited before "+Path.GetFileName(path)+", code="+root.ExitCode);
            Thread.Sleep(50);
        }
        Check(File.Exists(path),"Runtime stage deadline: "+Path.GetFileName(path));
    }
    static int Runtime(string dir,string cwd,string bun,string script,string runId,string scenario) {
        Check(scenario=="normal" || scenario=="cancel" || scenario=="crash","Unknown runtime scenario");
        Directory.CreateDirectory(dir);
        string resourceId=Guid.NewGuid().ToString("N");
        Write(Path.Combine(dir,"supervisor-start.json"),new { at=Now,resourceId=resourceId,pid=Process.GetCurrentProcess().Id,creationFileTime=Creation(GetCurrentProcess()),scenario=scenario,jobUnnamed=true,stopAuthority="retained original Job handle",control="local fixture barriers only, not authenticated product IPC" });
        IntPtr job=NewJob(); var owned=new List<OwnedProcess>();
        string tui=Path.Combine(Directory.GetParent(dir).FullName,"TUI-ENV-01");
        try {
            var root=LaunchTui(dir,cwd,bun,script,runId,job); owned.Add(root);
            RuntimeWait(Path.Combine(tui,"after-task.json"),root,DateTime.UtcNow.AddMinutes(3));
            IncludeAllActiveMembers(job,owned,dir,"initial-runtime-members.json");
            Write(Path.Combine(dir,"job-ready.json"),new { at=Now,resourceId=resourceId,scenario=scenario,activeProcesses=Count(job).active,knownProcesses=owned.ConvertAll(p=>p.Identity),modelTurnFinished=true });
            if(scenario=="normal") {
                Check(WaitForSingleObject(root.Handle,180000)==0,"Normal exit deadline");
                var rootReceipt=root.Receipt(); var final=WaitZero(job); var receipts=new List<object>();
                foreach(var process in owned) receipts.Add(process.Receipt());
                Write(Path.Combine(dir,"runtime-receipt.json"),new { at=Now,resourceId=resourceId,scenario=scenario,action="observed-native-exit",rootReceipt=rootReceipt,rootExitCode=root.ExitCode,activeProcessesAfter=final.active,processReceipts=receipts,taskOutcome=root.ExitCode==0?"completed-before-exit":"failed-known",cleanupOutcome="owned-job-active-count-zero",pass=root.ExitCode==0,limits=new[]{"Companion process exit codes retained independently","No all-handles inheritance allowlist or broker containment proof"} });
            } else {
                RuntimeWait(Path.Combine(cwd,"tool-active.json"),root,DateTime.UtcNow.AddMinutes(3));
                IncludeAllActiveMembers(job,owned,dir,"pre-stop-runtime-members.json");
                Check(!File.Exists(Path.Combine(cwd,"tool-completed.json")),"Missed active tool interval");
                if(scenario=="cancel") {
                    Write(Path.Combine(dir,"cancel-intent.json"),new { at=Now,resourceId=resourceId,reason="fixture cancellation during actual native tool",activeProcesses=Count(job).active });
                    Require(TerminateJobObject(job,CancelCode),"Cancel runtime owned Job"); var final=WaitZero(job); var receipts=new List<object>();
                    foreach(var process in owned) receipts.Add(process.Receipt());
                    Write(Path.Combine(dir,"runtime-receipt.json"),new { at=Now,resourceId=resourceId,scenario=scenario,action="terminate-owned-job-during-tool",activeProcessesAfter=final.active,rootExitCode=root.ExitCode,processReceipts=receipts,taskOutcome="cancelled",cleanupOutcome="owned-job-active-count-zero",toolCompletedMarkerPresent=File.Exists(Path.Combine(cwd,"tool-completed.json")),pass=root.ExitCode==CancelCode && !File.Exists(Path.Combine(cwd,"tool-completed.json")) });
                } else {
                    Write(Path.Combine(dir,"crash-observer-targets.json"),new { at=Now,resourceId=resourceId,processes=owned.ConvertAll(p=>p.Identity),allMembershipsVerifiedByOwner=true,activeProcesses=Count(job).active });
                    RuntimeWait(Path.Combine(dir,"observer-ready.json"),root,DateTime.UtcNow.AddMinutes(2));
                    Check(!File.Exists(Path.Combine(cwd,"tool-completed.json")),"Tool finished before supervisor fault injection");
                    Write(Path.Combine(dir,"crash-intent.json"),new { at=Now,resourceId=resourceId,fault="TerminateProcess on own current-process handle",expectedSupervisorExitCode=199,finallyWillNotRun=true });
                    Require(TerminateProcess(GetCurrentProcess(),199),"Inject supervisor death");
                    throw new InvalidOperationException("Self termination unexpectedly returned");
                }
            }
            return 0;
        } catch(Exception ex) {
            Write(Path.Combine(dir,"failure-receipt.json"),new { at=Now,resourceId=resourceId,scenario=scenario,error=ex.GetType().Name,message=ex.Message,win32Code=ex is System.ComponentModel.Win32Exception?((System.ComponentModel.Win32Exception)ex).NativeErrorCode:0,taskOutcome="failed-known-or-interrupted",cleanupConfirmed=false }); throw;
        } finally {
            TerminateJobObject(job,CancelCode); CloseHandle(job);
            foreach(var process in owned) process.Dispose();
        }
    }
    static OwnedProcess OpenRecordedIdentity(Dictionary<string,object> identity,string role) {
        uint pid=Convert.ToUInt32(identity["pid"]); long created=Convert.ToInt64(identity["creationFileTime"]);
        IntPtr handle=OpenProcess(0x00100000|0x1000,false,pid); Require(handle!=IntPtr.Zero,"Open recorded process for observation");
        try { Check(Creation(handle)==created,"Recorded identity no longer matches"); return new OwnedProcess { Handle=handle,Pid=pid,Created=created,Role=role }; }
        catch { CloseHandle(handle); throw; }
    }
    static int ObserveRuntimeCrash(string dir) {
        Check(!File.Exists(Path.Combine(dir,"observer-ready.json")),"Observer already started");
        var start=Read(Path.Combine(dir,"supervisor-start.json")); var targets=Read(Path.Combine(dir,"crash-observer-targets.json"));
        var processes=new List<OwnedProcess>();
        try {
            var supervisor=OpenRecordedIdentity(start,"supervisor"); processes.Add(supervisor);
            foreach(Dictionary<string,object> identity in (IEnumerable)targets["processes"]) processes.Add(OpenRecordedIdentity(identity,(string)identity["role"]));
            Write(Path.Combine(dir,"observer-ready.json"),new { at=Now,pid=Process.GetCurrentProcess().Id,handlesRetained=processes.ConvertAll(p=>p.Identity),scope="External observer, not holder of Job handle; no stop authority" });
            var receipts=new List<object>(); foreach(var process in processes) receipts.Add(process.Receipt());
            Check(supervisor.ExitCode==199,"Supervisor fault not observed");
            Write(Path.Combine(dir,"crash-observer-receipt.json"),new { at=Now,supervisorExitCode=supervisor.ExitCode,processReceipts=receipts,allKnownHandlesSignaled=true,activeProcessesAfter=(uint?)null,jobQuery="not-available-owner-dead",supervisorCleanupReceiptAvailable=false,taskOutcome="interrupted",pass=true,limits=new[]{"Observed retained identities only; no post-crash Job count","No authenticated production recovery IPC","No proof of broker/global resource cleanup"} });
            return 0;
        } finally { foreach(var process in processes) process.Dispose(); }
    }
}
