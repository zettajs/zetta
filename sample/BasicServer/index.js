var zetta = require('../../zetta_runtime.js');
var Arduino = require('./devices/arduino');
var Spark = require('./devices/spark');
var IHeardThat = require('./apps');

zetta()
  .name('local')
  .expose('*')
  .use(Arduino)
  .use(Spark)
  .load(IHeardThat)
  .listen(3000, function(err) {
    if(err) {
      console.log(err);
    }
  });
