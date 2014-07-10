//var Logger = require('./logger');
//var l = Logger();

var subscribedTo = [];
var response;
var callback;
 
exports.publish = function(name, data) {
  if(subscribedTo.indexOf(name) !== -1) {
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    } else {
      data = data.toString();
    }

    if(callback) {
      callback(name, data);
    }

    if (response) {
      var stream = response.push(name, { 'Host': 'fog.argo.cx' });

      stream.on('error', function(err) {
        if (err.message === 'Received error: 3') {
          stream.end();
        } else {
          console.error(err);
        }
      });

      stream.end(new Buffer(data));
    }
  }
};

exports.subscribe = function(res, name) {
  response = res;
  if (subscribedTo.indexOf(name) === -1) {
//    l.emit('log', 'fog-runtime', 'Created subscription to stream '+name);
    subscribedTo.push(name);
  }
};

exports.subscribeLocal = function(name, fn) {
  callback = fn;
  if (subscribedTo.indexOf(name) === -1) {
    l.emit('log', 'fog-runtime', 'Created subscription to stream '+name);
    subscribedTo.push(name);
  }
};
 
exports.unsubscribe = function(name) {
  var i = subscribedTo.indexOf(name);
  subscribedTo.splice(i);
};
