var zetta = require('../../zetta_runtime.js');
var Arduino = require('./devices/arduino');
var Spark = require('./devices/spark');
var iPhone = require('./devices/remote');
var app = require('./apps');

zetta()
  .name('local')
  .expose('*')
  .use(Arduino)
  .use(Spark)
  .use(iPhone, {http_device: true})
  .load(app)
  .listen(3000, function(err) {
    if(err) {
      console.log(err);
    }
  });
