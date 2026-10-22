using System;
using System.Runtime.InteropServices;
public static class ProjectsFolderPicker {
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr filters);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem folder);
    void SetFolder(IShellItem folder);
    void GetFolder(out IShellItem folder);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName(out IntPtr name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem other, uint hint, out int order);
  }
  [STAThread]
  public static int Main(string[] args) {
    try {
      Console.OutputEncoding = new System.Text.UTF8Encoding(false);
      string selected;
      if (args.Length == 1 && args[0] == "github") {
        using (var dialog = new System.Windows.Forms.OpenFileDialog()) {
          dialog.Title = "Localize o GitHub CLI (gh.exe)";
          dialog.Filter = "GitHub CLI (gh.exe)|gh.exe";
          dialog.FileName = "gh.exe";
          dialog.CheckFileExists = true;
          dialog.CheckPathExists = true;
          dialog.Multiselect = false;
          selected = dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK ? dialog.FileName : null;
        }
      } else if (args.Length == 1 && args[0] == "folder") {
        selected = Select();
      } else { return 1; }
      if (selected == null) return 3;
      Console.WriteLine(selected);
      return 0;
    } catch { return 1; }
  }
  public static string Select() {
    var dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("dc1c5a9c-e88a-4dde-a5a1-60f82a20aef7")));
    try {
      uint options;
      dialog.GetOptions(out options);
      // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST.
      dialog.SetOptions(options | 0x20u | 0x40u | 0x800u);
      dialog.SetTitle("Selecione uma pasta");
      dialog.SetOkButtonLabel("Selecionar pasta");
      int result = dialog.Show(IntPtr.Zero);
      if (result == unchecked((int)0x800704c7)) return null;
      Marshal.ThrowExceptionForHR(result);
      IShellItem item;
      dialog.GetResult(out item);
      try {
        IntPtr path;
        item.GetDisplayName(0x80058000u, out path);
        try { return Marshal.PtrToStringUni(path); }
        finally { Marshal.FreeCoTaskMem(path); }
      } finally { Marshal.ReleaseComObject(item); }
    } finally { Marshal.ReleaseComObject(dialog); }
  }
}
