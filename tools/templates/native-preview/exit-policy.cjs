'use strict';
// P2 acceptance policy. A controller-requested escalation is distinct from a
// graceful EOF exit; neither an arbitrary signal nor an exited flag is enough.
const POLICY='owned-shutdown-v1';
function acceptsNativeExit(value){
    if(!value||value.policy!==POLICY||value.requested!==true||value.exited!==true||value.streamsClosed!==true||value.errorPresent!==false||value.protocolFailure!==null||value.unexpectedTerminal!==false||!Array.isArray(value.terminalErrors)||value.terminalErrors.length)return false;
    const termination=value.controllerTermination;
    if(!termination||typeof termination.attempted!=='boolean'||typeof termination.succeeded!=='boolean'||termination.error!==null)return false;
    if(termination.attempted?termination.signal!=='SIGTERM':termination.signal!==null||termination.succeeded)return false;
    if(value.kind==='graceful')return value.code===0&&value.signal===null&&termination.succeeded===false;
    return value.kind==='controller-terminated'&&value.code===null&&value.signal==='SIGTERM'&&termination.attempted===true&&termination.succeeded===true&&termination.signal==='SIGTERM';
}
module.exports={POLICY,acceptsNativeExit};
