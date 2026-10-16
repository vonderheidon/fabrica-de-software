using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static partial class WindowsJobProbe {
    const uint Suspended = 4, NoWindow = 0x08000000, Detached = 8, KillOnClose = 0x2000;
    const uint WaitTimeout = 258, CancelCode = 197, SentinelStopCode = 198;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static string Self { get { return Assembly.GetExecutingAssembly().Location; } }
    static string Now { get { return DateTime.UtcNow.ToString("o"); } }

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct Startup { public uint cb; public string reserved, desktop, title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show, reservedSize; public IntPtr reservedPointer,input,output,error; }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimit { public long processTime, jobTime; public uint flags; public UIntPtr minWorking,maxWorking; public uint activeLimit; public UIntPtr affinity; public uint priority,scheduling; }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimit { public BasicLimit basic; public IoCounters io; public UIntPtr processMemory,jobMemory,peakProcessMemory,peakJobMemory; }
    [StructLayout(LayoutKind.Sequential)]
    struct Accounting { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }

    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimit info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, uint size, IntPtr length);
    [DllImport("kernel32.dll", SetLastError=true, EntryPoint="QueryInformationJobObject")] static extern bool QueryLimits(IntPtr job, int kind, out ExtendedLimit info, uint size, IntPtr length);
    [DllImport("kernel32.dll", SetLastError=true, EntryPoint="QueryInformationJobObject")] static extern bool QueryIds(IntPtr job, int kind, IntPtr info, uint size, IntPtr length);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder image, ref uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool member);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd, ref Startup startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);

    static void Require(bool ok, string action) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), action); }
    static void Check(bool ok, string message) { if (!ok) throw new InvalidOperationException(message); }
    static void Write(string path, object value) {
        using (var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
        using (var writer = new StreamWriter(file, new UTF8Encoding(false))) writer.Write(Json.Serialize(value));
    }
    static Dictionary<string,object> Read(string path) { return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(path)); }
    static void WaitFile(string path) {
        var deadline = DateTime.UtcNow.AddSeconds(12);
        while (!File.Exists(path) && DateTime.UtcNow < deadline) Thread.Sleep(20);
        Check(File.Exists(path), "Readiness deadline: " + Path.GetFileName(path));
    }
    static string Quote(string text) {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in text) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append(c); }
            else { result.Append('\\', slashes); result.Append(c); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
    }
    static long Creation(IntPtr process) {
        long creation,exit,kernel,user; Require(GetProcessTimes(process, out creation,out exit,out kernel,out user), "GetProcessTimes"); return creation;
    }
    static bool Member(IntPtr process, IntPtr job) { bool member; Require(IsProcessInJob(process,job,out member), "IsProcessInJob"); return member; }
    static Accounting Count(IntPtr job) {
        Accounting info; Require(QueryInformationJobObject(job,1,out info,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero), "QueryInformationJobObject"); return info;
    }
    static Accounting WaitZero(IntPtr job) {
        var deadline = DateTime.UtcNow.AddSeconds(10); Accounting info;
        do { info = Count(job); if (info.active == 0) return info; Thread.Sleep(20); } while (DateTime.UtcNow < deadline);
        throw new TimeoutException("Job still has active processes: " + info.active);
    }
    sealed class OwnedProcess : IDisposable {
        public IntPtr Handle, ThreadHandle; public uint Pid; public long Created; public string Role;
        public object Identity { get { return new { pid=Pid, creationFileTime=Created, creationUtc=DateTime.FromFileTimeUtc(Created).ToString("o"), role=Role }; } }
        public void Resume() { Check(ResumeThread(ThreadHandle) != UInt32.MaxValue,"ResumeThread failed"); Require(CloseHandle(ThreadHandle),"Close thread handle"); ThreadHandle=IntPtr.Zero; }
        public object Receipt() {
            Check(WaitForSingleObject(Handle,10000)==0,"Process did not terminate: " + Role);
            uint code; Require(GetExitCodeProcess(Handle,out code),"GetExitCodeProcess");
            return new { identity=Identity, observedAt=Now, signaled=true, exitCode=code };
        }
        public uint ExitCode { get { uint code; Require(GetExitCodeProcess(Handle,out code),"GetExitCodeProcess"); return code; } }
        public void Dispose() { if(ThreadHandle!=IntPtr.Zero){CloseHandle(ThreadHandle);ThreadHandle=IntPtr.Zero;} if(Handle!=IntPtr.Zero){CloseHandle(Handle);Handle=IntPtr.Zero;} }
    }
    static OwnedProcess Launch(string dir, string role, string mode, IntPtr job, bool detached) {
        var startup = new Startup(); startup.cb=(uint)Marshal.SizeOf(typeof(Startup)); ProcessInfo pi;
        var command = new StringBuilder(Quote(Self)+" worker "+Quote(dir)+" "+Quote(role)+" "+Quote(mode));
        Require(CreateProcessW(Self,command,IntPtr.Zero,IntPtr.Zero,false,Suspended|(detached?Detached:NoWindow),IntPtr.Zero,dir,ref startup,out pi),"CreateProcessW");
        var process = new OwnedProcess { Handle=pi.process,ThreadHandle=pi.thread,Pid=pi.pid,Role=role };
        try {
            process.Created=Creation(process.Handle);
            if(job!=IntPtr.Zero) { Require(AssignProcessToJobObject(job,process.Handle),"AssignProcessToJobObject"); Check(Member(process.Handle,job),"Job membership missing"); }
            Write(Path.Combine(dir,"resource-"+role+".json"),new { at=Now,identity=process.Identity,createdSuspended=true,explicitlyAssignedToProvidedJob=(job!=IntPtr.Zero),creationFlags=Suspended|(detached?Detached:NoWindow),inheritHandles=false });
            return process;
        } catch { TerminateProcess(process.Handle,CancelCode); WaitForSingleObject(process.Handle,5000); process.Dispose(); throw; }
    }
    static OwnedProcess Adopt(string dir, string role, IntPtr job) {
        var record = Read(Path.Combine(dir,"resource-"+role+".json"));
        var identity = (Dictionary<string,object>)record["identity"];
        uint pid = Convert.ToUInt32(identity["pid"]); long created=Convert.ToInt64(identity["creationFileTime"]);
        IntPtr handle=OpenProcess(0x00100000|0x1000,false,pid); Require(handle!=IntPtr.Zero,"OpenProcess owned descendant");
        try { Check(Creation(handle)==created,"Descendant identity changed"); Check(Member(handle,job),"Descendant not in owned Job"); return new OwnedProcess { Handle=handle,Pid=pid,Created=created,Role=role }; }
        catch { CloseHandle(handle); throw; }
    }
    static void IncludeAllActiveMembers(IntPtr job, List<OwnedProcess> owned, string dir, string fileName="active-job-process-list.json") {
        const int bytes=8+8*128; IntPtr buffer=Marshal.AllocHGlobal(bytes);
        try {
            Require(QueryIds(job,3,buffer,bytes,IntPtr.Zero),"Query Job process list");
            int count=Marshal.ReadInt32(buffer,4); Check(count==Marshal.ReadInt32(buffer,0),"Incomplete Job process list"); var snapshot=new List<object>();
            for(int i=0;i<count;i++) {
                uint pid=(uint)Marshal.ReadIntPtr(buffer,8+i*IntPtr.Size).ToInt64();
                var existing=owned.Find(p=>p.Pid==pid);
                if(existing!=null) { snapshot.Add(new { identity=existing.Identity,source="retained-worker-handle" }); continue; }
                IntPtr handle=OpenProcess(0x00100000|0x1000,false,pid); Require(handle!=IntPtr.Zero,"Open Job member");
                try {
                    Check(Member(handle,job),"Queried process no longer in owned Job");
                    var process=new OwnedProcess { Handle=handle,Pid=pid,Created=Creation(handle),Role="kernel-member-"+pid };
                    var image=new StringBuilder(32768); uint length=32768;
                    Require(QueryFullProcessImageNameW(handle,0,image,ref length),"Query process image");
                    owned.Add(process); handle=IntPtr.Zero;
                    snapshot.Add(new { identity=process.Identity,source="owned-job-process-list",image=image.ToString() });
                } finally { if(handle!=IntPtr.Zero) CloseHandle(handle); }
            }
            Write(Path.Combine(dir,fileName),new { at=Now,assigned=Marshal.ReadInt32(buffer,0),listed=count,members=snapshot });
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    static IntPtr NewJob() {
        IntPtr job=CreateJobObjectW(IntPtr.Zero,null); Require(job!=IntPtr.Zero,"CreateJobObjectW");
        try {
            var limits=new ExtendedLimit(); limits.basic.flags=KillOnClose;
            Require(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimit))),"SetInformationJobObject");
            ExtendedLimit actual; Require(QueryLimits(job,9,out actual,(uint)Marshal.SizeOf(typeof(ExtendedLimit)),IntPtr.Zero),"Query Job limits");
            Check(actual.basic.flags==KillOnClose,"Unexpected Job flags"); return job;
        } catch { CloseHandle(job); throw; }
    }
    static int Worker(string dir, string role, string mode) {
        Write(Path.Combine(dir,"ready-"+role+".json"),new { at=Now,pid=Process.GetCurrentProcess().Id,role=role,mode=mode });
        if(mode=="normal") { Thread.Sleep(150); return 0; }
        if(mode=="nonzero") return 23;
        if(mode=="orphan-parent") {
            using(var orphan=Launch(dir,"orphan","leaf",IntPtr.Zero,true)) { orphan.Resume(); WaitFile(Path.Combine(dir,"ready-orphan.json")); }
            return 0;
        }
        if(mode=="tree" || mode=="tree-exit") {
            using(var normal=Launch(dir,"normal","leaf",IntPtr.Zero,false)) normal.Resume();
            using(var detached=Launch(dir,"detached","leaf",IntPtr.Zero,true)) detached.Resume();
            using(var parent=Launch(dir,"orphan-parent","orphan-parent",IntPtr.Zero,false)) {
                parent.Resume(); var receipt=parent.Receipt(); Check(parent.ExitCode==0,"Orphan parent failed");
                Write(Path.Combine(dir,"orphan-parent-receipt.json"),receipt);
            }
            WaitFile(Path.Combine(dir,"ready-normal.json")); WaitFile(Path.Combine(dir,"ready-detached.json")); WaitFile(Path.Combine(dir,"ready-orphan.json"));
            Write(Path.Combine(dir,"tree-ready.json"),new { at=Now,pid=Process.GetCurrentProcess().Id,expectedKnownProcesses=5 });
            if(mode=="tree-exit") return 0;
        }
        Thread.Sleep(120000); return 98;
    }
    static object RunCase(string suiteDir, string name, OwnedProcess external) {
        string dir=Path.Combine(suiteDir,name); Directory.CreateDirectory(dir);
        string jobIdentity=Guid.NewGuid().ToString("N"); IntPtr job=NewJob();
        var owned=new List<OwnedProcess>(); var receipts=new List<object>();
        try {
            bool tree=name=="cancel-tree" || name=="close-handle-tree" || name=="orphan-root";
            string mode=tree?(name=="orphan-root"?"tree-exit":"tree"):(name=="normal-exit"?"normal":(name=="nonzero-exit"?"nonzero":"leaf"));
            var root=Launch(dir,"root",mode,job,false); owned.Add(root);
            Check(!File.Exists(Path.Combine(dir,"ready-root.json")),"Root ran before ResumeThread");
            Write(Path.Combine(dir,"assigned-before-resume.json"),new { at=Now,jobIdentity=jobIdentity,root=root.Identity,activeProcesses=Count(job).active,limitFlags=KillOnClose,externalInOwnedJob=Member(external.Handle,job),externalAlive=WaitForSingleObject(external.Handle,0)==WaitTimeout });
            Check(!Member(external.Handle,job),"External sentinel unexpectedly assigned");
            if(name!="cancel-suspended") root.Resume();
            Accounting before; uint? activeAfter=null; string action;
            if(tree) {
                WaitFile(Path.Combine(dir,"tree-ready.json"));
                foreach(string role in new[]{"normal","detached","orphan"}) owned.Add(Adopt(dir,role,job));
                if(name=="orphan-root") { root.Receipt(); Check(root.ExitCode==0,"Root did not exit normally"); }
                IncludeAllActiveMembers(job,owned,dir);
                before=Count(job); Check(before.active>=(name=="orphan-root"?3u:4u) && before.total>=5,"Missing expected Job members: active="+before.active+", total="+before.total);
                Write(Path.Combine(dir,"tree-membership.json"),new { at=Now,jobIdentity=jobIdentity,activeProcesses=before.active,totalProcesses=before.total,members=owned.ConvertAll(p=>new { identity=p.Identity,member=Member(p.Handle,job) }) });
                if(name=="close-handle-tree") { Require(CloseHandle(job),"Close sole Job handle"); job=IntPtr.Zero; action="last-handle-close"; }
                else { Require(TerminateJobObject(job,CancelCode),"TerminateJobObject"); activeAfter=WaitZero(job).active; action="terminate-owned-job"; }
            } else if(name=="normal-exit" || name=="nonzero-exit") {
                root.Receipt(); before=Count(job); activeAfter=WaitZero(job).active; action="natural-exit";
                Check(root.ExitCode==(name=="normal-exit"?0u:23u),"Unexpected natural exit code");
            } else {
                before=Count(job); Require(TerminateJobObject(job,CancelCode),"Cancel suspended root"); activeAfter=WaitZero(job).active; action="cancel-before-resume";
                Check(!File.Exists(Path.Combine(dir,"ready-root.json")),"Cancelled suspended worker executed");
            }
            foreach(var process in owned) {
                receipts.Add(process.Receipt());
                if(action=="terminate-owned-job" && !(name=="orphan-root" && process.Role=="root")) Check(process.ExitCode==CancelCode,"Wrong cancellation exit code for "+process.Role);
                if(action=="cancel-before-resume") Check(process.ExitCode==CancelCode,"Suspended root exit code mismatch");
            }
            bool externalAlive=WaitForSingleObject(external.Handle,0)==WaitTimeout; Check(externalAlive,"External sentinel was affected");
            var receipt=new { at=Now,scenario=name,jobIdentity=jobIdentity,jobUnnamed=true,authority="retained original handle",action=action,pass=true,taskOutcome=(name=="nonzero-exit"?"failed-known-exit-23":(name=="normal-exit"?"completed":"cancelled-or-containment-test")),activeBefore=before.active,totalProcesses=before.total,activeProcessesAfter=activeAfter,jobQueryAfterClose=(job==IntPtr.Zero?"not-available-handle-closed":"queried-owned-handle"),processReceipts=receipts,externalUnaffected=externalAlive,stdoutReaders="not-created-in-this-fixture",console="hidden native fixture, not ConPTY/TUI proof" };
            Write(Path.Combine(dir,"receipt.json"),receipt); return receipt;
        } catch(Exception ex) {
            Write(Path.Combine(dir,"failure-receipt.json"),new { at=Now,scenario=name,jobIdentity=jobIdentity,pass=false,error=ex.GetType().Name,message=ex.Message,win32Code=ex is Win32Exception?((Win32Exception)ex).NativeErrorCode:0 }); throw;
        } finally {
            if(job!=IntPtr.Zero) { TerminateJobObject(job,CancelCode); CloseHandle(job); }
            foreach(var process in owned) process.Dispose();
        }
    }
    static int Suite(string dir) {
        Directory.CreateDirectory(dir); Write(Path.Combine(dir,"suite-start.json"),new { at=Now,pid=Process.GetCurrentProcess().Id,self=Self,process64Bit=Environment.Is64BitProcess,os=Environment.OSVersion.VersionString,jobLimitBytes=Marshal.SizeOf(typeof(ExtendedLimit)),accountingBytes=Marshal.SizeOf(typeof(Accounting)) });
        string sentinelDir=Path.Combine(dir,"external-sentinel"); Directory.CreateDirectory(sentinelDir);
        var results=new List<object>();
        IntPtr sentinelJob=NewJob();
        try { using(var external=Launch(sentinelDir,"external","leaf",sentinelJob,false)) {
            try {
                external.Resume(); WaitFile(Path.Combine(sentinelDir,"ready-external.json"));
                foreach(string scenario in new[]{"normal-exit","nonzero-exit","cancel-suspended","cancel-tree","orphan-root","close-handle-tree"}) results.Add(RunCase(dir,scenario,external));
                Write(Path.Combine(dir,"result.json"),new { at=Now,status="six-native-fixture-cases-passed",cases=results,limits=new[]{"Not OMP/MCP or production supervisor integration","No console/ConPTY inheritance or protocol readers tested","External sentinel is a controlled owned process outside tested Jobs, not a manual user process","No WMI/services/broker containment or filesystem/network sandbox","Last-handle-close has known-process receipts but no Job query after close","No supervisor crash, compile/recruit/tool/check stage matrix or authenticated stop IPC tested"} });
                Console.WriteLine("WINDOWS-JOB-STUDY-COMPLETE"); return 0;
            } finally {
                Require(TerminateJobObject(sentinelJob,SentinelStopCode),"Stop separate owned sentinel Job");
                var final=WaitZero(sentinelJob);
                Write(Path.Combine(sentinelDir,"cleanup-receipt.json"),external.Receipt());
                Write(Path.Combine(sentinelDir,"job-cleanup.json"),new { at=Now,activeProcesses=final.active,totalProcesses=final.total,scope="Separate sentinel Job, outside all tested Jobs" });
            }
        }} finally { CloseHandle(sentinelJob); }
    }
    public static int Main(string[] args) {
        try {
#if RUNTIME_STUDY
            if(args.Length==7 && args[0]=="runtime") return Runtime(args[1],args[2],args[3],args[4],args[5],args[6]);
            if(args.Length==2 && args[0]=="observe-runtime-crash") return ObserveRuntimeCrash(args[1]);
#endif
            if(args.Length==4 && args[0]=="worker") return Worker(args[1],args[2],args[3]);
            if(args.Length==2 && args[0]=="suite") return Suite(args[1]);
            throw new ArgumentException("Expected suite outputDirectory or worker directory role mode");
        } catch(Exception ex) { Console.Error.WriteLine(ex.GetType().Name+": "+ex.Message); return 1; }
    }
}
