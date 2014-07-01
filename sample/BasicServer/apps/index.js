module.exports = function(server) {
  var arduinoQuery = server.where({type: 'led'});
  var sparkQuery = server.where({type: 'spark'});
  server.observe([arduinoQuery, sparkQuery], function(led, spark){
    server.log('Spark online...');
    server.log('LED online...');
  });
}
