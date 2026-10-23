"""Restore the single pinned Newtonsoft net45 DLL; no package execution or install."""
import argparse,hashlib,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('package',type=Path);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parent.parent);a=p.parse_args()
root=a.root.resolve();m=json.loads((root/'vendor/host-json-manifest.json').read_text());target=root/m['inputRoot']
def physical(p):
 for q in [p,*p.parents]:
  if q.is_symlink() or (q.exists() and q.resolve()!=q.absolute()):raise ValueError('Redirected input/output path')
physical(a.package.absolute());physical(target)
if target.exists():raise ValueError('Prepared input must be new and absent')
b=a.package.read_bytes();assert hashlib.sha256(b).hexdigest()==m['package']['sha256'],'Package SHA256 mismatch'
with zipfile.ZipFile(a.package) as z:
 rows=[x for x in z.infolist() if x.filename==m['package']['selectedMember']];assert len(rows)==1,'Ambiguous selected member'
 b=z.read(rows[0]);assert len(b)==m['file']['size'] and hashlib.sha256(b).hexdigest()==m['file']['sha256'],'Selected DLL identity mismatch'
target.mkdir(parents=True);(target/m['file']['path']).write_bytes(b)
print('Prepared exact pinned Newtonsoft DLL; no execution, package install or restore')
