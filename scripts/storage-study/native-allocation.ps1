# Measure ordinary public fixture files using the volume's reported allocation size.
$ErrorActionPreference = 'Stop'
$paths = @(ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd()))
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class StorageQualification {
    [StructLayout(LayoutKind.Sequential)]
    struct FileStandardInfo {
        public long AllocationSize, EndOfFile;
        public uint NumberOfLinks;
        public byte DeletePending, Directory;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetFileInformationByHandleEx(
        SafeFileHandle file, int infoClass, out FileStandardInfo info, uint size);
    public static long Allocated(SafeFileHandle handle) {
        FileStandardInfo info;
        if (!GetFileInformationByHandleEx(handle, 1, out info, (uint)Marshal.SizeOf<FileStandardInfo>()))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        return info.AllocationSize;
    }
}
'@
$bytes = foreach ($path in $paths) {
    $stream = [System.IO.File]::OpenRead($path)
    try { [StorageQualification]::Allocated($stream.SafeFileHandle) }
    finally { $stream.Dispose() }
}
$volume = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($paths[0])).DriveFormat
@{fileSystem=$volume; bytes=@($bytes)} | ConvertTo-Json -Compress
