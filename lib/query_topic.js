var uuid = require('node-uuid');

// query:{id}/<topic>
// query/<topic>
function isQuery(topic) {
  var queryPrefix = 'query/';
  if (topic.slice(0, queryPrefix.length) === queryPrefix) {
    return true;
  }

  var queryPrefix = 'query:';
  if (topic.slice(0, queryPrefix.length) === queryPrefix) {
    return true;
  }

  return false;
}

module.exports.isQuery = isQuery;

module.exports.parse = function parseDeviceQuery(q) {
  if (!isQuery(q)) {
    return null;
  }

  var split = q.split('/');
  var ret = {
    id: (split.splice(0, 1)[0].split(':')[1] || uuid.v4() ),
    ql: split.join('/')
  };

  return ret;
};

module.exports.format = function formatDeviceQuery(obj) {
  if (!obj.id) {
    obj.id = uuid.v4();
  }
  return 'query:' + obj.id + '/' + obj.ql;
};


