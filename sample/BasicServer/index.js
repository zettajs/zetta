var zetta = require('../../zetta_runtime.js');
var Arduino = require('./devices/arduino');
var Spark = require('./devices/spark');
var IHeardThat = require('./apps');

var app = zetta()
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

app.id = 'fb828855-e442-4fbb-b6a9-6f965feaf53b';
