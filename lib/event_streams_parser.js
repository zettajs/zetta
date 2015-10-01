var util = require('util');
var EventEmitter = require('events').EventEmitter;

var EventStreamParser = module.exports = function() {
  EventEmitter.call(this);  
};
util.inherits(EventStreamParser, EventEmitter);

EventStreamParser.prototype.add = function(buf) {
  var json = null;
  var self = this;
  try {
    json = JSON.parse(buf.toString());   
  } catch(e) {
    self.emit('error', e, buf);  
    return;
  }

  if (this.validate(json)) {
    this.emit(json.type, json);
  } else {
    this.emit('error', new Error('Message validation failed.'), json);
  }
};

EventStreamParser.prototype.validate = function(json) {
  var properties = {
    'subscribe': { topic: 'string' },
    'unsubscribe': { subscriptionId: 'number' },
    'error': { code: 'number', timestamp: 'number', topic: 'string' },
    'subscribe-ack': { timestamp: 'number', subscriptionId: 'number', topic: 'string' },
    'unsubscribe-ack': { timestamp: 'number', subscriptionId: 'number' },
    'event': { topic: 'string', timestamp: 'number', subscriptionId: 'number'} 
  }

  var keys = properties[json.type];
  var valid = true; 
  if(keys) {
    Object.keys(keys).forEach(function(key) {
      if(typeof json[key] !== keys[key]) {
        valid = false;
      }  
    });
  } else {
    return false;  
  }

  return valid;
};
