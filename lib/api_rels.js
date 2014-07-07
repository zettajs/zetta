var base = 'http://rels.zettajs.io/';
function rel(name){
  return base + name;
}

module.exports.server = rel('peer');
module.exports.server = rel('server');
module.exports.device = rel('device');
module.exports.objectStream = rel('object-stream');
module.exports.objectStream = rel('log-stream');
