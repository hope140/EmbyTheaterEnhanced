// SPDX-License-Identifier: MIT
// Only a test seam; real net462 compile references the already selected Model metadata.
using System.IO;
namespace MediaBrowser.Model.IO
{
    public interface IFileSystem { Stream OpenRead(string path); }
    public interface IZipClient
    {
        void ExtractAll(string sourceFile, string targetPath, bool overwriteExistingFiles);
        void ExtractAll(Stream source, string targetPath, bool overwriteExistingFiles);
        void ExtractAllFromZip(Stream source, string targetPath, bool overwriteExistingFiles);
        void ExtractAllFrom7z(string sourceFile, string targetPath, bool overwriteExistingFiles);
        void ExtractAllFrom7z(Stream source, string targetPath, bool overwriteExistingFiles);
        void ExtractAllFromTar(string sourceFile, string targetPath, bool overwriteExistingFiles);
        void ExtractAllFromTar(Stream source, string targetPath, bool overwriteExistingFiles);
        void ExtractAllFromRar(string sourceFile, string targetPath, bool overwriteExistingFiles);
        void ExtractAllFromRar(Stream source, string targetPath, bool overwriteExistingFiles);
    }
}
