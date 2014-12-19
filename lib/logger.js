var EventEmitter = require('events').EventEmitter;
var Stream = require('stream');
var util = require('util');
var colors = require('colors');
var Strftime = require('strftime');
var ObjectStream = require('zetta-streams').ObjectStream;

var LEVELS = ['log', 'info', 'warn', 'error'];

function Logger(options) {
  EventEmitter.call(this);
  this.options = options || {};
  this.pubsub = this.options.pubsub;
}
util.inherits(Logger, EventEmitter);

LEVELS.forEach(function(level) {
  Logger.prototype[level] = function(event, msg, data) {
    this.emit(level, event, msg, data);
  };
});

/*
 * Logger intercepts messages sent from all over the fog runtime. We format them accordingly.
 *
 */
Logger.prototype.init = function() {
  var self = this;

  this.removeAllListeners();

  LEVELS.slice(1).forEach(function(level) {
    self.on(level, function(event, msg, data) {
      if (!event || !msg) {
        return;
      }

      if (typeof data !== 'object') {
        data = {
          timestamp: new Date().getTime()
        };
      }

      // add timestamp if it does not exist.
      if (!data.timestamp) {
        data.timestamp  = new Date().getTime();
      }

      self.emit('message', level, event, msg, data);

      if (self.pubsub) {
        self._sendToPubsub(level, event, msg, data);
      }
    });
  });

  this.on('log', function(event, msg, data) {
    self.emit('info', event, msg, data);
  });
};

Logger.prototype._sendToPubsub = function(level, event, msg, data) {
  if (!data) {
    data = {};
  }

  var obj = ObjectStream.format((data.topic || 'logs'), null);
  delete obj.data; // only used for objectstream messages

  Object.keys(data).forEach(function(key) {
    obj[key] = data[key];
  });

  if (msg) {
    obj.msg = msg;
  }

  obj.level = level;
  obj.event = event;

  this.pubsub.publish('logs', obj);
};

function ConsoleOutput(log) {

  function format(level, event, msg, d) {
    var dateStr = Strftime('%b-%d-%Y %H:%M:%S ', new Date(d.timestamp)).green;
    msg = '[' + event + '] ' + msg;
    if (level === 'info' || level === 'log') {
      console.log(dateStr + msg.blue);
    } else if(level === 'warn') {
      console.log(dateStr + msg.yellow);
    } else if (level === 'error') {
      console.error(dateStr + msg.red);
    }
  }

  log.on('message', format);
};

var logger = null;
module.exports = function() {
  if(logger) {
    return logger;
  } else {
    logger = Object.create(Logger.prototype);
    logger.constructor.apply(logger, arguments);
    logger.init();
    return logger;
  }
};

module.exports.LEVELS = LEVELS;
module.exports.ConsoleOutput = ConsoleOutput;
