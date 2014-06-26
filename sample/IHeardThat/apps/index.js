module.exports = function(server) {
  var query = server.where({type: 'led'});

  server.observe([query], function(led){
    console.log('LED ONLINE:'+led.id);
  });
}
