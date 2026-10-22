'use strict';
// Isolated definition/wire probe only: never opens a channel or contacts a server.
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const project = path.resolve(process.argv[2]);
const protoPath = path.resolve(process.argv[3]);
const deny = () => { throw Error('Network, DNS and process creation are forbidden in this definition probe'); };
for (const [module, names] of [['node:net',['connect','createConnection']],['node:tls',['connect']],
    ['node:dns',['lookup','resolve','resolve4','resolve6']],['node:child_process',['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']]]) {
    const target = require(module); for (const name of names) target[name] = deny;
}
require('node:net').Socket.prototype.connect = deny;
require('node:net').Server.prototype.listen = deny;
for (const target of [require('node:dns'), require('node:dns').promises]) {
    for (const name of Object.keys(target).filter(name => /^(?:lookup|resolve|reverse)/.test(name))) {
        if (typeof target[name] === 'function') target[name] = deny;
    }
}
const load = createRequire(path.join(project,'package.json'));
const grpc = load('@grpc/grpc-js'), loader = load('@grpc/proto-loader');
const options = {keepCase:true,longs:String,enums:String,defaults:true,oneofs:true};
const definition = loader.loadSync(protoPath,options), api = grpc.loadPackageDefinition(definition).clouddrive;
const methods = Object.entries(api.CloudDriveFileSrv.service).map(([name,method]) => ({name,path:method.path,
    requestStream:method.requestStream,responseStream:method.responseStream}));
assert.deepEqual(methods.map(method => method.name),['FindFileByPath','GetSubFiles','GetDownloadUrlPath']);
const file = {fullPathName:'/fixture/movie.mkv',size:'12345',fileType:'File',isDirectory:false};
const samples = {
    FindFileByPathRequest:{parentPath:'/fixture',path:'movie.mkv'},CloudDriveFile:file,
    ListSubFileRequest:{path:'/fixture',forceRefresh:true,checkExpires:true},SubFilesReply:{subFiles:[file]},
    GetDownloadUrlPathRequest:{path:'/fixture/movie.mkv',preview:false,lazy_read:true,get_direct_url:true},
    DownloadUrlPathInfo:{downloadUrlPath:'https://fixture.invalid/media',expiresIn:'60',directUrl:'https://fixture.invalid/direct',userAgent:'fixture',additionalHeaders:{'X-Fixture':'yes'}}
};
const wires = Object.entries(samples).map(([name,value]) => {const bytes=api[name].serialize(value);
    assert.deepEqual(api[name].serialize(api[name].deserialize(bytes)),bytes);return{name,hex:bytes.toString('hex')};});
const channelz = Object.keys(grpc.getChannelzServiceDefinition());
assert.ok(channelz.includes('GetTopChannels')); assert.ok(channelz.includes('GetSocket'));
const grpcRoot = path.dirname(load.resolve('@grpc/grpc-js/package.json'));
const orcaDefinition = loader.loadSync(path.join(grpcRoot,'proto/xds/xds/service/orca/v3/orca.proto'),
    {...options,includeDirs:[path.join(grpcRoot,'proto/xds'),path.join(grpcRoot,'proto/protoc-gen-validate')]});
const orcaApi = grpc.loadPackageDefinition(orcaDefinition), report = orcaApi.xds.data.orca.v3.OrcaLoadReport;
const orcaBytes = report.serialize({cpu_utilization:0.25,mem_utilization:0.5,request_cost:{fixture:2}});
const metadata = new grpc.Metadata(), orca = load('@grpc/grpc-js/build/src/orca');
metadata.set(orca.GRPC_METRICS_HEADER,orcaBytes);let observed;
orca.createMetricsReader(value => {observed=value;})(0,'fixture',metadata);
assert.equal(observed.cpu_utilization,0.25);assert.equal(observed.request_cost.fixture,2);
load('protobufjs/ext/descriptor');
const prefix = path.join(project,'node_modules') + path.sep;
const members = Object.keys(require.cache).filter(name => name.startsWith(prefix))
    .map(name => path.relative(path.join(project,'node_modules'),name).split(path.sep).join('/')).sort();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
process.stdout.write(JSON.stringify({definitionSha256:hash(JSON.stringify(definition)),methods,wires,channelz,
    orcaWire:orcaBytes.toString('hex'),memberCount:members.length,members})+'\n');
