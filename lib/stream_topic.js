var StreamTopic = module.exports = function() {
  
}

StreamTopic.prototype.parse = function(topicString){
  var previousCharacter = null;
  var currentCharacter = null;
  var start = 0;
  var topicComponents = [];
  for(var i = 0; i < topicString.length; i++) {
      currentCharacter = topicString[i];
      if(currentCharacter === '/' && previousCharacter !== '\\') {
        topicComponents.push(topicString.slice(start, i));
        start = i + 1;
      } else if(i === topicString.length - 1) {
        topicComponents.push(topicString.slice(start, topicString.length));
      }
  }

  if(topicComponents.length !== 4) {
    throw new Error('Topic Parse Error'); 
  }

  function checkForRegex(s) {
    if(s[0] === '{' && s[s.length - 1] === '}') {
      return new RegExp(s.slice(1, -1));
    } else {
      return s;  
    }
  }

  this.serverName = checkForRegex(topicComponents[0]);
  this.deviceType = checkForRegex(topicComponents[1]);
  this.deviceId = checkForRegex(topicComponents[2]);
  var streamComponents = topicComponents[3].split('?');
  this.streamName = checkForRegex(streamComponents[0]);
  this.streamQuery = streamComponents[1];
}

StreamTopic.parse = function(topicString) {
  var topic =  new StreamTopic();  
  topic.parse(topicString);
  return topic;
}
