"""Offline artifact v2; all authority/network in unit tests is synthetic."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import struct
import tarfile
import unittest
from unittest.mock import patch

R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('artifact_v2',R/'ops/c2/publisher-promotion.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
SHA='49f6823768817b0390f215de42439cce523bf5d3'


def capsule(files):
    dirs=set()
    for name in files:
        parent=Path(name).parent
        while str(parent)!='.':dirs.add(parent.as_posix());parent=parent.parent
    rows=[]
    for name in sorted(set(files)|dirs):
        if name in dirs:rows.append({'path':name,'type':'dir','mode':0o555})
        else:rows.append({'path':name,'type':'file','mode':0o444,'size':len(files[name]),'sha256':p.digest(files[name])})
    inventory=p.canonical({'version':1,'entries':rows});out=io.BytesIO()
    with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name,raw in [('inventory.json',inventory),*[('blob/'+str(i),files[row['path']]) for i,row in enumerate(rows) if row['type']=='file']]:
            item=tarfile.TarInfo(name);item.mode=0o444;item.size=len(raw);tar.addfile(item,io.BytesIO(raw))
    return out.getvalue(),inventory,rows


def fixture():
    elf=bytearray(64);elf[:6]=b'\x7fELF\x02\x01';elf[18:20]=b'\x3e\x00'
    contents={n:(bytes(elf) if n in ['node','ingest','c2projection','relayprobe'] else b'public fixture') for n in p.FILES}
    contents['source.bundle']=b'synthetic bundle, never used as source evidence'
    contents['source-manifest.json']=p.canonical({'sourceSha':SHA,'recipe':p.RECIPE,'nodeMajor':24})
    files={'package.json':(R/'pipeline/package.json').read_bytes(),'pnpm-lock.yaml':(R/'pipeline/pnpm-lock.yaml').read_bytes()}
    for name,version in [('zod','4.6.7'),('undici','7.30.1'),('tsx','4.23.15'),('esbuild','0.28.2'),('.aktau-pnpm','10.32.1')]:
        files[('node_modules/.pnpm/'+name+'@'+version+'/node_modules/'+name if name in ['undici','esbuild'] else 'node_modules/'+name)+'/package.json']=json.dumps({'name':name,'version':version}).encode()
    raw,inv,rows=capsule(files)
    d={'version':1,'contract':'pr86-pipeline-v2','sourceSha':SHA,'pipelineTreeSha1':p.PIPELINE_NEXT_TREE,
       'packageBlobSha1':p.PIPELINE_NEW_PACKAGE,'lockBlobSha1':p.PIPELINE_NEW_LOCK,'nodeVersion':'v24.18.0',
       'nodeSha256':p.digest(contents['node']),'pnpmVersion':'10.32.1','pnpmTarSha256':p.PIPELINE_PNPM,
       'platform':'linux/amd64/glibc','capsuleSha256':p.digest(raw),'inventorySha256':p.digest(inv),
       'capsuleBytes':len(raw),'logicalBytes':sum(r.get('size',0) for r in rows),'entryCount':len(rows)}
    contents.update({'pipeline-runtime.tar':raw,'pipeline-runtime.json':p.canonical(d)})
    m={'version':2,'kind':'build-only','sourceSha':SHA,'sourceTree':'a'*40,'goVersion':'go1.27.3','nodeVersion':'v24.18.0',
       'recipe':p.RECIPE,'ciRunId':1,'ciAttempt':1,'buildRunId':2,'buildAttempt':1,
       'files':{n:p.digest(contents[n]) for n in p.FILES},'sourceBundleSha256':p.digest(contents['source.bundle']),
       'pipelineRuntime':{'descriptorSha256':p.digest(contents['pipeline-runtime.json']),
                          'capsuleSha256':p.digest(raw),'inventorySha256':p.digest(inv)}}
    contents['promotion.json']=p.canonical(m)
    return contents,m,d


def outer(contents):
    out=io.BytesIO()
    with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name,data in sorted(contents.items()):
            item=tarfile.TarInfo(name);item.mode=0o444;item.size=len(data);tar.addfile(item,io.BytesIO(data))
    return out.getvalue()


class ArtifactV2Tests(unittest.TestCase):
    def setUp(self):
        self.contents,self.manifest,self.descriptor=fixture()
        # Explicit small ELF fixture, never production admission/authority.
        self.node=patch.object(p,'PIPELINE_NODE',p.digest(self.contents['node']));self.node.start();self.addCleanup(self.node.stop)
    def test_v2_roundtrip_and_legacy_v1_roundtrip(self):
        self.assertEqual(p.validate_package(p.unpack_tar(outer(self.contents)),SHA),self.manifest)
        legacy=dict(self.contents);legacy.pop('pipeline-runtime.tar');legacy.pop('pipeline-runtime.json')
        m=copy.deepcopy(self.manifest);m['version']=1;m.pop('pipelineRuntime');legacy['promotion.json']=p.canonical(m)
        self.assertEqual(p.validate_package(p.unpack_tar(outer(legacy)),SHA),m)
    def test_descriptor_identity_types_counts_and_unapproved_graph_rejected(self):
        for key,value in [('sourceSha','b'*40),('pipelineTreeSha1','b'*40),('lockBlobSha1','b'*40),
                          ('packageBlobSha1','b'*40),('pnpmTarSha256','b'*64),('nodeSha256','b'*64),
                          ('platform','linux/arm64/glibc'),('nodeVersion','v24.10.0'),('pnpmVersion','latest'),
                          ('capsuleBytes',True),('entryCount',1),('logicalBytes',0),('version',True)]:
            with self.subTest(key=key):
                d=copy.deepcopy(self.descriptor);d[key]=value
                with self.assertRaises(p.Blocked):p.pipeline_descriptor(p.canonical(d),self.contents['pipeline-runtime.tar'],SHA)
    def test_version_extra_member_wrong_hash_and_producer_types_fail_closed(self):
        for key,value in [('version',True),('version',3),('sourceSha','c'*40),('buildRunId',True),('ciAttempt',0)]:
            with self.subTest(key=key):
                c=dict(self.contents);m=copy.deepcopy(self.manifest);m[key]=value;c['promotion.json']=p.canonical(m)
                with self.assertRaises(p.Blocked):p.validate_package(c,SHA)
        for name in ['pipeline-runtime.tar','pipeline-runtime.json','source.bundle','node']:
            c=dict(self.contents);c[name]+=b'tamper'
            with self.subTest(name=name),self.assertRaises(p.Blocked):p.validate_package(c,SHA)
        c=dict(self.contents);c['extra']=b'foreign'
        with self.assertRaises(p.Blocked):p.unpack_tar(outer(c))
        with self.assertRaises(p.Blocked):p.unpack_tar(b'not a tar')
    def test_inventory_traversal_links_and_missing_runtime_are_rejected(self):
        for files in [{'../escape':b'x'}, {'package.json':b'{}'}]:
            raw,inv,rows=capsule(files);d=dict(self.descriptor)
            d.update(capsuleSha256=p.digest(raw),inventorySha256=p.digest(inv),capsuleBytes=len(raw),
                     logicalBytes=sum(r.get('size',0) for r in rows),entryCount=len(rows))
            with self.assertRaises(p.Blocked):p.pipeline_descriptor(p.canonical(d),raw,SHA)
        inv=p.canonical({'version':1,'entries':[{'path':'a','type':'symlink','target':'../outside'}]})
        with self.assertRaises(p.Blocked):p.pipeline_inventory(inv)
    def test_v2_cannot_reach_legacy_transaction_even_directly(self):
        with self.assertRaisesRegex(p.Blocked,'artifact_v2_activation_disabled'):
            p.Transaction(object(),object()).promote(self.contents,self.manifest,{},'fixture')
    def test_self_consistent_unapproved_dependency_version_and_inventory_fail(self):
        inv,blobs=p.pipeline_capsule(self.contents['pipeline-runtime.tar'])
        files=dict(blobs);files['node_modules/zod/package.json']=b'{"name":"zod","version":"4.6.8"}'
        raw,inventory,rows=capsule(files);d=dict(self.descriptor)
        d.update(capsuleSha256=p.digest(raw),inventorySha256=p.digest(inventory),capsuleBytes=len(raw),
                 logicalBytes=sum(r.get('size',0) for r in rows),entryCount=len(rows))
        with self.assertRaisesRegex(p.Blocked,'pipeline_runtime_version'):
            p.pipeline_descriptor(p.canonical(d),raw,SHA)
        d=dict(self.descriptor);d['inventorySha256']='f'*64
        with self.assertRaisesRegex(p.Blocked,'pipeline_descriptor_hash'):
            p.pipeline_descriptor(p.canonical(d),self.contents['pipeline-runtime.tar'],SHA)
    def test_outer_tar_rejects_link_duplicate_and_descriptor_capacity(self):
        for kind in ['symlink','duplicate','capacity']:
            with self.subTest(kind=kind):
                out=io.BytesIO()
                with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as tar:
                    for name,raw in self.contents.items():
                        if kind=='capacity' and name=='pipeline-runtime.json':raw=b'x'*16385
                        item=tarfile.TarInfo(name);item.mode=0o444;item.size=len(raw)
                        if kind=='symlink' and name=='pipeline-runtime.tar':
                            item.type=tarfile.SYMTYPE;item.linkname='/outside';item.size=0
                        tar.addfile(item,io.BytesIO(raw) if item.isfile() else None)
                        if kind=='duplicate' and name=='promotion.json':tar.addfile(item,io.BytesIO(raw))
                with self.assertRaises(p.Blocked):p.unpack_tar(out.getvalue())
    def test_version_one_cannot_smuggle_pipeline_payload(self):
        c=dict(self.contents);m=copy.deepcopy(self.manifest);m['version']=1;m.pop('pipelineRuntime')
        c['promotion.json']=p.canonical(m)
        with self.assertRaises(p.Blocked):p.unpack_tar(outer(c))
        with self.assertRaises(p.Blocked):p.validate_package(c,SHA)

    def test_v2_trailing_archive_and_noncanonical_headers_rejected(self):
        raw=outer(self.contents)
        for changed in [raw+b'foreign',raw+b'\0'*10240]:
            with self.assertRaises(p.Blocked):p.unpack_tar(changed)

class V2AdmissionBoundaryTests(unittest.TestCase):
    """Real root admission with explicit synthetic GitHub and OS authority.

    Real bundle/tree/native qualification is separate. These mocks cannot be
    selected by the production CLI or supplied in an uploaded manifest.
    """
    def setUp(self):
        import test_publisher_promotion as historical
        import sys
        self.m=historical.m;self.t=historical.AdmissionTests();self.t.setUp()
        self.t.replies=json.loads(json.dumps(self.t.replies).replace('a'*40,SHA))
        self.t.sha=SHA;self.t.request['sourceSha']=SHA
        contents,manifest,_=fixture();manifest.update(kind='promote',ciRunId=8,buildRunId=9,sourceTree='f'*40)
        self.t.contents,self.t.manifest=contents,manifest
        self.t.policy['version']=2
        self.t.policy['runtimeFiles'].update({self.m.ROOT+'/bin/pnpm':self.m.digest(self.t.source),
            '/etc/systemd/system/aktau-sync-dependencies.service':self.m.digest(self.t.source)})
        c={'id':self.m.CONTRACT,'oldSourceSha':self.m.PIPELINE_OLD_SOURCE,'oldTreeSha1':self.m.PIPELINE_OLD_TREE,
            'newTreeSha1':self.m.PIPELINE_NEW_TREE,'oldPackageBlobSha1':self.m.PIPELINE_OLD_PACKAGE,'newPackageBlobSha1':self.m.PIPELINE_NEW_PACKAGE,
            'oldLockBlobSha1':self.m.PIPELINE_OLD_LOCK,'newLockBlobSha1':self.m.PIPELINE_NEW_LOCK,
            'contractsOldLockBlobSha1':self.m.CONTRACTS_OLD_LOCK,'contractsNewLockBlobSha1':self.m.CONTRACTS_NEW_LOCK,
            'nodeSha256':self.m.digest(contents['node']),'pnpmTarSha256':self.m.PIPELINE_PNPM,
            'baselineInputInventorySha256':'e'*64,'baselineRuntimeInventorySha256':'f'*64}
        self.t.policy['pipelineContract']=c
        for ctx in [patch.object(self.m,'PIPELINE_NODE',self.m.digest(contents['node'])),patch.dict(sys.modules,{self.m.__name__:self.m}),
                    patch.object(self.m,'pipeline_runtime'),patch.object(self.m,'require_enrollment'),patch.object(self.m,'source_admission_v2')]:
            ctx.start();self.addCleanup(ctx.stop)
    def test_independent_zip_digest_precedes_private_authority_and_source_checks(self):
        raw=self.t.archive();_,manifest,_,_=self.t.admit(raw)
        self.assertEqual(manifest['_rootProvenance']['zipSha256'],self.m.digest(raw))
        self.assertEqual(manifest['_rootProvenance']['artifactId'],7)
        self.m.require_enrollment.assert_called_once();self.m.source_admission_v2.assert_called_once()
        self.m.require_enrollment.reset_mock();self.m.source_admission_v2.reset_mock()
        self.t.replies['actions/artifacts/7']['digest']='sha256:'+'0'*64
        with self.assertRaisesRegex(self.m.Blocked,'github_archive_digest'):self.t.admit(raw)
        self.m.require_enrollment.assert_not_called();self.m.source_admission_v2.assert_not_called()
    def test_v1_policy_or_missing_enrollment_never_reaches_v2_source_transition(self):
        raw=self.t.archive();self.m.require_enrollment.side_effect=self.m.Blocked('pipeline_baseline_receipt')
        with self.assertRaisesRegex(self.m.Blocked,'pipeline_baseline_receipt'):self.t.admit(raw)
        self.m.source_admission_v2.assert_not_called();self.m.require_enrollment.side_effect=None
        self.t.policy['version']=1;self.t.policy.pop('pipelineContract')
        self.t.policy['runtimeFiles'].pop(self.m.ROOT+'/bin/pnpm');self.t.policy['runtimeFiles'].pop('/etc/systemd/system/aktau-sync-dependencies.service')
        with self.assertRaisesRegex(self.m.Blocked,'pipeline_policy_required'):self.t.admit(raw)
        self.m.source_admission_v2.assert_not_called()
    def test_uploader_cannot_supply_private_provenance_or_build_only_authorization(self):
        self.t.manifest['_rootProvenance']={'approved':True}
        with self.assertRaises(self.m.Blocked):self.t.admit(self.t.archive())
        self.m.require_enrollment.assert_not_called()
        self.t.manifest.pop('_rootProvenance');self.t.manifest['kind']='build-only'
        with self.assertRaisesRegex(self.m.Blocked,'build_only_not_authorized'):self.t.admit(self.t.archive())
        self.m.require_enrollment.assert_not_called()
