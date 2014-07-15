var Transform = require('stream').Transform;

module.exports = function(server) {
  var microphoneQuery = server.where({type: 'microphone'});
  server.observe([microphoneQuery], function(microphone){
    
    microphone.streams.somevar.once('data', function(buf) {
      console.log('first somevar event:', buf);
    });

    microphone.streams.amplitude.once('data', function(msg) {
      console.log('first amplitude event:', msg);
    });

    server.log('Microphone...');
  });
}
