var zetta = require('../../');

// allows a user to use any logger
var winston = require('winston');
// or
var bunyan = require('bunyan').createLogger({ name: 'myapp' });

zetta()
  .logger(function(log) {
    // logs passes an internal logs object.
    
    log.on('message', function(level, event, msg, data) {
      // level = info/warn/error
      // event = http_server
      // msg = "Websocket connection for peer "local" established."
      // data.date = ...
    });
    
    // follows above but filters on type
    log.on('info', function(event, msg, data) {
      winston.info(msg, data);
    });

    log.on('warn', function(event, msg, data) {
      bunyan.warn(data, msg); // bunyan does it the other way.
    });

    log.on('error', function(event, msg, data) {
    });
  })
  .use(function(server) {
    setInterval(function() {
      server.info('Some error', { data: 123 });
    }, 5000);
  })
  .listen(3000);

