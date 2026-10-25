using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

// Local NTFS only. All names used below have a live, non-reparse ancestor
// chain held without FILE_SHARE_WRITE/DELETE. Disposition uses the very same
// handle that was inspected; there is no DeleteFile(path) fallback.
public static class WindowsReferenceDeletion
{
    [StructLayout(LayoutKind.Sequential)]
    struct Information {
        public uint attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME creation, access, write;
        public uint volume, sizeHigh, sizeLow, links, indexHigh, indexLow;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct AttributeTag { public uint attributes, tag; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
        IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Information info);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool GetVolumeInformationByHandleW(SafeFileHandle handle, StringBuilder name,
        uint nameLength, out uint serial, out uint maxComponent, out uint flags,
        StringBuilder filesystem, uint filesystemLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetFileInformationByHandle(SafeFileHandle handle, int kind, ref uint data, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out uint data, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out AttributeTag data, uint length);

    public class Ancestor {
        public string path, identity, resolvedPath;
    }
    public class Observation {
        public string path, identity, resolvedPath, kind;
        public Ancestor[] ancestors;
    }
    static Exception Failure() { return new Win32Exception(Marshal.GetLastWin32Error()); }
    static SafeFileHandle Open(string path, bool remove, bool follow, bool protectDirectory = false) {
        // Attribute-only opens do not participate in Windows share checking.
        // LIST_DIRECTORY makes the ancestor's deny-write/delete share effective.
        SafeFileHandle handle = CreateFileW(@"\\?\" + path, 0x80u | (remove ? 0x10000u : 0u) | (protectDirectory ? 1u : 0u),
            1, IntPtr.Zero, 3, 0x02000000u | (follow ? 0u : 0x00200000u), IntPtr.Zero);
        if (handle.IsInvalid) { Exception error = Failure(); handle.Dispose(); throw error; }
        return handle;
    }
    static Information Info(SafeFileHandle handle) {
        Information info;
        if (!GetFileInformationByHandle(handle, out info)) throw Failure();
        if (info.indexHigh == 0 && info.indexLow == 0) throw new IOException("IDENTITY_UNAVAILABLE");
        return info;
    }
    static string Identity(Information info) {
        ulong index = ((ulong)info.indexHigh << 32) | info.indexLow;
        ulong creation = ((ulong)(uint)info.creation.dwHighDateTime << 32) | (uint)info.creation.dwLowDateTime;
        return info.volume.ToString() + ":" + index.ToString() + ":" + creation.ToString();
    }
    static string LinkKind(SafeFileHandle handle) {
        AttributeTag info;
        if (!GetFileInformationByHandleEx(handle, 9, out info, 8)) throw Failure();
        if (info.tag == 0xA0000003u) return "junction";
        if (info.tag == 0xA000000Cu) return "symlink";
        throw new IOException("REPARSE_TAG_UNSUPPORTED");
    }
    static string Resolved(SafeFileHandle handle) {
        StringBuilder buffer = new StringBuilder(32768);
        uint size = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, 0);
        if (size == 0 || size >= buffer.Capacity) throw Failure();
        string result = buffer.ToString();
        if (!result.StartsWith(@"\\?\") || result.StartsWith(@"\\?\UNC\")) throw new IOException("UNSUPPORTED_VOLUME");
        return result.Substring(4);
    }
    static void ValidateVolume(SafeFileHandle handle) {
        StringBuilder name = new StringBuilder(256), fs = new StringBuilder(256);
        uint serial, length, flags;
        if (!GetVolumeInformationByHandleW(handle, name, 256, out serial, out length, out flags, fs, 256)) throw Failure();
        // Other drivers/volumes need their own positive adversarial proof.
        if (fs.ToString() != "NTFS") throw new IOException("UNSUPPORTED_VOLUME");
        uint sensitive;
        if (!GetFileInformationByHandleEx(handle, 23, out sensitive, 4)) throw Failure();
        if (sensitive != 0) throw new IOException("CASE_SENSITIVE_DIRECTORY_UNSUPPORTED");
    }
    static string ValidPath(string path) {
        if (path == null || path.Length > 240 || !System.Text.RegularExpressions.Regex.IsMatch(path, @"^[A-Za-z]:\\"))
            throw new IOException("PATH_UNSAFE");
        string full = Path.GetFullPath(path);
        if (!String.Equals(full, path, StringComparison.OrdinalIgnoreCase) || full.Length <= 3)
            throw new IOException("PATH_UNSAFE");
        foreach (string component in path.Substring(3).Split('\\')) {
            if (component.Length == 0 || component == "." || component == ".." || component.EndsWith(".") ||
                component.EndsWith(" ") || component.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
                System.Text.RegularExpressions.Regex.IsMatch(component, @"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase)) throw new IOException("PATH_UNSAFE");
        }
        return full;
    }
    // Dispose in reverse order so no ancestor is released before its children.
    sealed class Boundary : IDisposable {
        public List<SafeFileHandle> handles = new List<SafeFileHandle>();
        public List<Ancestor> ancestors = new List<Ancestor>();
        public SafeFileHandle leaf;
        public Observation observation;
        public Boundary(string path, bool remove) {
            try {
                path = ValidPath(path);
                List<string> chain = new List<string>();
                string parent = Path.GetDirectoryName(path);
                while (parent != null) { chain.Insert(0, parent); parent = Path.GetDirectoryName(parent); }
                foreach (string part in chain) {
                    SafeFileHandle handle;
                    try { handle = Open(part, false, false, true); }
                    catch (Win32Exception error) {
                        if (error.NativeErrorCode != 2) throw;
                        observation = new Observation { path = path, kind = "absent", ancestors = ancestors.ToArray() };
                        return;
                    }
                    handles.Add(handle);
                    Information info = Info(handle);
                    if ((info.attributes & 0x10) == 0 || (info.attributes & 0x400) != 0) throw new IOException("ANCESTOR_UNSAFE");
                    ValidateVolume(handle);
                    ancestors.Add(new Ancestor { path = part, identity = Identity(info), resolvedPath = Resolved(handle) });
                }
                try { leaf = Open(path, remove, false); handles.Add(leaf); }
                catch (Win32Exception error) {
                    // Ancestors are already locked and proven present: only
                    // ERROR_FILE_NOT_FOUND at this leaf is safe absence.
                    if (error.NativeErrorCode != 2) throw;
                    observation = new Observation { path = path, kind = "absent", ancestors = ancestors.ToArray() };
                    return;
                }
                Information entry = Info(leaf);
                bool link = (entry.attributes & 0x400) != 0;
                string resolved = Resolved(leaf);
                if (link) {
                    using (SafeFileHandle destination = Open(path, false, true)) resolved = Resolved(destination);
                }
                observation = new Observation { path = path, identity = Identity(entry), resolvedPath = resolved,
                    kind = link ? LinkKind(leaf) : (entry.attributes & 0x10) != 0 ? "directory" : "file",
                    ancestors = ancestors.ToArray() };
            } catch { Dispose(); throw; }
        }
        public void Dispose() {
            for (int i = handles.Count - 1; i >= 0; i--) handles[i].Dispose();
            handles.Clear();
        }
    }
    public static Observation Observe(string path) {
        return ObserveHeld(path, null);
    }
    public static Observation ObserveHeld(string path, Action<string> whileHeld) {
        using (Boundary boundary = new Boundary(path, false)) {
            if (whileHeld != null) whileHeld(path);
            return boundary.observation;
        }
    }
    public static Observation[] ObserveMany(string[] paths) {
        if (paths == null || paths.Length > 100) throw new IOException("PATHS_INVALID");
        List<Observation> observations = new List<Observation>(paths.Length);
        foreach (string path in paths) observations.Add(Observe(path));
        return observations.ToArray();
    }
    static bool Same(Observation actual, Observation expected) {
        if (expected == null || actual.path != expected.path || actual.ancestors.Length != expected.ancestors.Length) return false;
        for (int i = 0; i < actual.ancestors.Length; i++) {
            Ancestor a = actual.ancestors[i], b = expected.ancestors[i];
            if (a.path != b.path || a.identity != b.identity || a.resolvedPath != b.resolvedPath) return false;
        }
        return actual.kind == "absent" || (actual.kind == expected.kind && actual.identity == expected.identity &&
            actual.resolvedPath == expected.resolvedPath);
    }
    static void Adjacent(string path, Action<string> beforeEffect) {
        if (beforeEffect != null) beforeEffect(path);
    }
    static void RemoveHeld(string path, SafeFileHandle handle, Action<string> beforeEffect, int depth) {
        if (depth > 128) throw new IOException("DEPTH_UNSUPPORTED");
        Information entry = Info(handle);
        if ((entry.attributes & 0x400) != 0) LinkKind(handle);
        if ((entry.attributes & 0x400) == 0 && (entry.attributes & 0x10) != 0) {
            // The directory and every ancestor remain locked while names are
            // enumerated/opened. A child is inspected AFTER opening without
            // following reparse points; its handle remains locked until deleted.
            ValidateVolume(handle);
            foreach (string extendedChild in Directory.EnumerateFileSystemEntries(@"\\?\" + path)) {
                string child = extendedChild.Substring(4);
                if (Path.GetDirectoryName(child) != path) throw new IOException("CHILD_UNSAFE");
                using (SafeFileHandle childHandle = Open(child, true, false)) {
                    RemoveHeld(child, childHandle, beforeEffect, depth + 1);
                }
            }
        }
        Adjacent(path, beforeEffect);
        // Read metadata from the held object immediately beside the effect.
        // No writable/delete-sharing handle can coexist with this handle.
        if (Identity(Info(handle)) != Identity(entry)) throw new IOException("IDENTITY_CHANGED");
        // FileDispositionInfoEx: DELETE | IGNORE_READONLY_ATTRIBUTE. This does
        // not clear attributes on hard-linked files outside the authorized tree.
        uint disposition = 0x11;
        if (!SetFileInformationByHandle(handle, 21, ref disposition, 4)) throw Failure();
        // A concurrent addition yields DIRECTORY_NOT_EMPTY and a retryable
        // block; never treat a partially emptied directory as removed.
    }
    public static void Remove(string path, Observation expected, Action<string> beforeEffect) {
        using (Boundary boundary = new Boundary(path, true)) {
            if (!Same(boundary.observation, expected)) throw new IOException("IDENTITY_CHANGED");
            if (boundary.observation.kind != "absent") RemoveHeld(path, boundary.leaf, beforeEffect, 0);
        }
    }
}
