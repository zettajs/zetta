var base = 'http://rels.zettajs.io/';
function rel(name){
  return base + name;
}

module.exports.self = 'self';
module.exports.root = rel('root');
module.exports.monitor = 'monitor';
module.exports.peer = rel('peer');
module.exports.peerManagement = rel('peer-management');
module.exports.server = rel('server');
module.exports.device = rel('device');
module.exports.objectStream = rel('object-stream');
module.exports.binaryStream = rel('binary-stream');
module.exports.logStream = rel('log-stream');
