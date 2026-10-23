"""Pinned official registry acquisition, using the host's normal HTTPS trust."""
import base64
import hashlib
import json
import pathlib
import sys
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Registry redirects are forbidden")


def download(root, destination):
    root, destination = pathlib.Path(root), pathlib.Path(destination)
    manifest = json.loads((root / "native/windows-media/registry-input.json").read_text())
    lock_bytes = (root / "native/windows-media/package-lock.json").read_bytes()
    lock = json.loads(lock_bytes)
    if hashlib.sha256(lock_bytes).hexdigest() != manifest["lockSha256"]:
        raise ValueError("Lock identity mismatch")
    destination.mkdir()  # exclusive; preserve previous evidence
    opener = urllib.request.build_opener(NoRedirect)
    records = []
    for item in manifest["packages"]:
        entry = lock["packages"]["node_modules/" + item["name"]]
        if (item["name"] not in ("koffi", "@koromix/koffi-win32-x64") or
                item["version"] != "3.3.3" or item["url"] != entry["resolved"] or
                item["integrity"] != entry["integrity"] or
                not item["url"].startswith("https://registry.npmjs.org/")):
            raise ValueError("Unexpected registry source")
        address = "https://registry.npmjs.org/" + urllib.parse.quote(item["name"], safe="") + "/3.3.3"
        with opener.open(address, timeout=30) as response:
            metadata = json.loads(response.read(1024 * 1024))
        if metadata["dist"]["tarball"] != item["url"] or metadata["dist"]["integrity"] != item["integrity"]:
            raise ValueError("Registry metadata differs from lock")
        with opener.open(item["url"], timeout=30) as response:
            data = response.read(4 * 1024 * 1024 + 1)
        if (len(data) != item["archiveBytes"] or hashlib.sha256(data).hexdigest() != item["archiveSha256"] or
                "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode() != item["integrity"]):
            raise ValueError("Archive identity mismatch")
        with (destination / item["archive"]).open("xb") as output:
            output.write(data)
        records.append({"name": item["name"], "sha256": item["archiveSha256"], "integrity": item["integrity"]})
    return {"source": "official-registry-locked-tarballs", "archives": records}


if __name__ == "__main__":
    print(json.dumps(download(*sys.argv[1:])))
