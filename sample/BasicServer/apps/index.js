module.exports = function(server) {
  var arduinoQuery = server.where({type: 'led'});
  var sparkQuery = server.where({type: 'spark'});
  var iphoneQuery = server.where({type: 'iphone'});
  server.observe([arduinoQuery, sparkQuery, iphoneQuery], function(led, spark, iphone){
    server.log('Spark online...');
    server.log('LED online...');
    server.log('iPhone online...');
  });
};
