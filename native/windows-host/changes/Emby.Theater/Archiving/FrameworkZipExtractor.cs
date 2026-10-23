// SPDX-License-Identifier: MIT
// New isolated ETE maintenance candidate. See LICENSE-MIT.txt.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace Emby.Theater.Archiving
{
    // ZIP32, unencrypted Stored/Deflate only. This is not the old multi-format factory.
    internal static class FrameworkZipExtractor
    {
        private sealed class Record
        {
            internal int Index;
            internal long Offset;
            internal string Name;
        }

        internal static void Extract(Stream source, string targetPath, bool overwrite)
        {
            if (source == null) throw new ArgumentNullException("source");
            if (targetPath == null) throw new ArgumentNullException("targetPath");
            // The caller retains ownership. Buffering also supports a non-seekable input.
            // Unlike the old forward reader, this consumes the remaining stream to EOF.
            using (var buffered = new MemoryStream())
            {
                source.CopyTo(buffered);
                buffered.Position = 0;
                var records = ReadRecords(buffered);
                var root = Path.GetFullPath(targetPath);
                var prefix = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                    + Path.DirectorySeparatorChar;
                var destinations = new List<string>();
                // Validate every destination before creating output, including Unicode overrides.
                foreach (var record in records)
                {
                    var destination = Destination(root, prefix, record.Name);
                    RejectExistingReparsePoints(destination);
                    destinations.Add(destination);
                }
                buffered.Position = 0;
                var encoding = Encoding.GetEncoding(CultureInfo.CurrentCulture.TextInfo.OEMCodePage);
                using (var archive = new ZipArchive(buffered, ZipArchiveMode.Read, true, encoding))
                {
                    if (archive.Entries.Count != records.Count)
                        throw new InvalidDataException("ZIP entry count mismatch.");
                    for (int i = 0; i < records.Count; i++)
                    {
                        var record = records[i];
                        var path = destinations[i];
                        RejectExistingReparsePoints(path);
                        // Match the old local-header reader's directory convention.
                        if (record.Name.EndsWith("/", StringComparison.Ordinal))
                        {
                            Directory.CreateDirectory(path);
                            continue;
                        }
                        Directory.CreateDirectory(Path.GetDirectoryName(path));
                        using (var input = archive.Entries[record.Index].Open())
                        using (var output = new FileStream(path, overwrite ? FileMode.Create : FileMode.CreateNew,
                            FileAccess.Write, FileShare.None))
                            input.CopyTo(output);
                    }
                }
            }
        }

        private static string Destination(string root, string prefix, string name)
        {
            // Treat both separators as Windows separators even in isolated Linux tests.
            var portable = name.Replace('\\', '/');
            if (portable.Length == 0 || portable.StartsWith("/", StringComparison.Ordinal)
                || portable.IndexOf(':') >= 0)
                throw new InvalidDataException("Unsupported rooted or empty ZIP entry path.");
            var path = Path.GetFullPath(Path.Combine(root, portable.Replace('/', Path.DirectorySeparatorChar)));
            if (!path.StartsWith(prefix, Path.DirectorySeparatorChar == '\\'
                ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
                throw new InvalidDataException("ZIP entry leaves the destination directory.");
            return path;
        }

        private static void RejectExistingReparsePoints(string path)
        {
            // Reject existing symlinks/junctions, including destination ancestors.
            // This is an observation, not a race-free filesystem transaction.
            for (string current = path; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            {
                try
                {
                    if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                        throw new InvalidDataException("ZIP destination crosses an existing reparse point.");
                }
                catch (FileNotFoundException) { }
                catch (DirectoryNotFoundException) { }
            }
        }

        private static List<Record> ReadRecords(Stream stream)
        {
            using (var reader = new BinaryReader(stream, Encoding.UTF8, true))
            {
                long end = FindEnd(reader);
                stream.Position = end + 4;
                ushort disk = reader.ReadUInt16(), centralDisk = reader.ReadUInt16();
                ushort diskCount = reader.ReadUInt16(), count = reader.ReadUInt16();
                uint size = reader.ReadUInt32(), offset = reader.ReadUInt32();
                if (disk != 0 || centralDisk != 0 || diskCount != count)
                    throw new NotSupportedException("Split ZIP archives are outside this candidate.");
                if (count == ushort.MaxValue || size == uint.MaxValue || offset == uint.MaxValue)
                    throw new NotSupportedException("ZIP64 is outside this candidate.");
                long centralEnd = (long)offset + size;
                if (centralEnd > end) throw new InvalidDataException("Invalid ZIP central directory bounds.");
                stream.Position = offset;
                var records = new List<Record>();
                var usedOffsets = new HashSet<long>();
                for (int index = 0; index < count; index++)
                {
                    Require(reader, centralEnd, 46);
                    if (reader.ReadUInt32() != 0x02014b50)
                        throw new InvalidDataException("Invalid ZIP central record.");
                    stream.Position += 4;
                    ushort flags = reader.ReadUInt16(), method = reader.ReadUInt16();
                    stream.Position += 8;
                    uint compressed = reader.ReadUInt32(), uncompressed = reader.ReadUInt32();
                    ushort nameLength = reader.ReadUInt16(), extraLength = reader.ReadUInt16();
                    ushort commentLength = reader.ReadUInt16(), startDisk = reader.ReadUInt16();
                    stream.Position += 6;
                    uint local = reader.ReadUInt32();
                    if (compressed == uint.MaxValue || uncompressed == uint.MaxValue || local == uint.MaxValue)
                        throw new NotSupportedException("ZIP64 is outside this candidate.");
                    if (startDisk != 0 || (flags & 1) != 0 || (flags & 0x40) != 0)
                        throw new NotSupportedException("Encrypted or split ZIP is outside this candidate.");
                    if (method != 0 && method != 8)
                        throw new NotSupportedException("ZIP method " + method + " is outside Stored/Deflate.");
                    Require(reader, centralEnd, (long)nameLength + extraLength + commentLength);
                    stream.Position += (long)nameLength + extraLength + commentLength;
                    long next = stream.Position;
                    if (!usedOffsets.Add(local)) throw new InvalidDataException("Duplicate ZIP local-header offset.");
                    var name = LocalName(reader, local, offset, flags, method);
                    records.Add(new Record { Index = index, Offset = local, Name = name });
                    stream.Position = next;
                }
                if (stream.Position != centralEnd)
                    throw new NotSupportedException("Extra central-directory records are outside this candidate.");
                // Sharp's forward reader visits local headers, not central-directory order.
                records.Sort((a, b) => a.Offset.CompareTo(b.Offset));
                return records;
            }
        }

        private static string LocalName(BinaryReader reader, long offset, long centralOffset,
            ushort centralFlags, ushort centralMethod)
        {
            var stream = reader.BaseStream;
            stream.Position = offset;
            Require(reader, centralOffset, 30);
            if (reader.ReadUInt32() != 0x04034b50) throw new InvalidDataException("Invalid ZIP local header.");
            stream.Position += 2;
            ushort flags = reader.ReadUInt16(), method = reader.ReadUInt16();
            if (flags != centralFlags || method != centralMethod)
                throw new InvalidDataException("Conflicting local/central ZIP flags or method.");
            stream.Position += 16;
            ushort nameLength = reader.ReadUInt16(), extraLength = reader.ReadUInt16();
            Require(reader, centralOffset, (long)nameLength + extraLength);
            byte[] name = reader.ReadBytes(nameLength), extra = reader.ReadBytes(extraLength);
            var encoding = (flags & 0x800) != 0 ? Encoding.UTF8
                : Encoding.GetEncoding(CultureInfo.CurrentCulture.TextInfo.OEMCodePage);
            string result = encoding.GetString(name);
            // Original target uses the first local 0x7075 field, without version/CRC validation.
            // This is independently written metadata glue, not copied Sharp decompression code.
            for (int i = 0; i < extra.Length;)
            {
                if (extra.Length - i < 4) throw new InvalidDataException("Truncated ZIP extra header.");
                int tag = extra[i] | extra[i + 1] << 8;
                int length = extra[i + 2] | extra[i + 3] << 8;
                i += 4;
                if (length > extra.Length - i) throw new InvalidDataException("Truncated ZIP extra body.");
                if (tag == 0x7075)
                {
                    if (length < 5) throw new InvalidDataException("Truncated Unicode ZIP path.");
                    return Encoding.UTF8.GetString(extra, i + 5, length - 5);
                }
                i += length;
            }
            return result;
        }

        private static long FindEnd(BinaryReader reader)
        {
            var stream = reader.BaseStream;
            long minimum = Math.Max(0, stream.Length - 65557);
            for (long i = stream.Length - 22; i >= minimum; i--)
            {
                stream.Position = i;
                if (reader.ReadUInt32() != 0x06054b50) continue;
                stream.Position = i + 20;
                if (i + 22 + reader.ReadUInt16() == stream.Length) return i;
            }
            throw new InvalidDataException("ZIP end record not found.");
        }

        private static void Require(BinaryReader reader, long end, long length)
        {
            if (length < 0 || reader.BaseStream.Position > end - length)
                throw new InvalidDataException("Truncated ZIP metadata.");
        }
    }
}
