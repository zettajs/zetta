var zetta = require('../../');

// allows a user to use any logger
var winston = require('winston');

// or

var bunyan = require('bunyan').createLogger({ name: 'myapp' });

logger.emit('error', 'http_server', 'some message', { data: 123 });

logger.info('http_server', 'some message', { data: 123 });
logger.warn('http_server', 'some message', { data: 123 });
logger.error('http_server', 'some message', { data: 123 });

zetta()
  .silent()
  .logging(function(log) {
    // logs passes an internal logs object.
    
    log.on('log', function(type, msg, data) {
      // type = info/warn/error
      // msg = "Websocket connection for peer "local" established."
      // data.component = http_server
      // data.date = ...
    });
    
    // follows above but filters on type
    log.on('info', function(msg, data) {
      winston.info(msg, data);
    });

    log.on('warn', function(msg, data) {
      bunyan.log(data, msg); // bunyan does it the other way.
    });

    log.on('error', function(msg, data) {
    });

  })
  .listen(3000);
