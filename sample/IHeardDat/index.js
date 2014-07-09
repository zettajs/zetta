var zetta = require('../../zetta_runtime.js');
var Arduino = require('./devices/arduino');
var IHeardThat = require('./apps');

var app = zetta();

app.id = 'd7fe2c66-db23-4513-a5f5-a2a890d1af36';

app
  .name('local')
  .expose('*')
  .use(Arduino)
  .listen(3000, function(err) {
    if(err) {
      console.log(err);
    }
  });
